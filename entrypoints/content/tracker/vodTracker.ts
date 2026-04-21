import browser from "webextension-polyfill";

import { parseTwitchVodIdFromPathname } from "../declutter/routeMatch";
import { sendMsg, type Msg } from "../../../lib/messaging";
import { defaultSettings, loadSettings, type Settings } from "../../../lib/settings";
import { totalDuration } from "../../../lib/util/ranges";
import { getLatestVodMeta, isValidVodMeta, VOD_EVENT_NAME } from "./streamMetadata";
import { createSegmentBuffer } from "./segmentBuffer";
import { waitForPlayerProbe } from "./playerProbe";

const SAMPLE_INTERVAL_MS = 1_000;
const FLUSH_INTERVAL_MS = 10_000;
const SHOULD_LOG_FLUSH_DEBUG = import.meta.env.DEV;
const TRACKER_ACTIVE_ATTR = "data-td-vodtracker-active";
const TRACKER_LAST_FLUSH_ATTR = "data-td-vodtracker-last-flush";
const TRACKER_LAST_META_ATTR = "data-td-vodtracker-last-meta";
const TRACKER_LAST_ERROR_ATTR = "data-td-vodtracker-last-error";

const loadSettingsOrDefault = async (): Promise<Settings> => {
  try {
    return await loadSettings();
  } catch {
    return defaultSettings;
  }
};

const toVodMeta = (vodId: string): Extract<Msg, { type: "flushRanges"; kind: "vod" }>["meta"] | null => {
  const vodMeta = getLatestVodMeta(vodId);
  if (!vodMeta) {
    return null;
  }

  return {
    channelId: vodMeta.channelId,
    channelLogin: vodMeta.channelLogin,
    durationSeconds: vodMeta.durationSeconds,
    createdAt: vodMeta.createdAt
  };
};

export interface VodTrackerSession {
  vodId: string;
  stop(): Promise<void>;
}

export const startVodTracker = async (vodId: string): Promise<VodTrackerSession> => {
  document.documentElement.setAttribute(TRACKER_ACTIVE_ATTR, vodId);
  const playerProbe = await waitForPlayerProbe();
  if (!playerProbe) {
    document.documentElement.setAttribute(TRACKER_LAST_ERROR_ATTR, "player-probe-missing");
    return {
      vodId,
      stop: async () => undefined
    };
  }

  const segmentBuffer = createSegmentBuffer();
  let settings = await loadSettingsOrDefault();
  let stopped = false;
  let hiddenSkipLogged = false;

  const onStorageChanged = (): void => {
    void loadSettingsOrDefault().then((next) => {
      settings = next;
    });
  };

  browser.storage.onChanged.addListener(onStorageChanged);

  const isUrlForThisVod = (): boolean => parseTwitchVodIdFromPathname(window.location.pathname) === vodId;

  const flushPending = async (options?: { force?: boolean }): Promise<void> => {
    if (!options?.force && !isUrlForThisVod()) {
      segmentBuffer.reset();
      document.documentElement.setAttribute(TRACKER_LAST_FLUSH_ATTR, "skipped:off-vod-route");
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][flush][vod] skipped: off-vod-route", {
          vodId,
          pathname: window.location.pathname
        });
      }
      return;
    }

    const ranges = segmentBuffer.flushPendingRanges(settings.heatmap.bucketSeconds);
    if (ranges.length === 0) {
      document.documentElement.setAttribute(TRACKER_LAST_FLUSH_ATTR, "skipped:no-ranges");
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][flush][vod] skipped: no-ranges", { vodId });
      }
      return;
    }

    const watchedSeconds = totalDuration(ranges);
    if (watchedSeconds < settings.heatmap.minWatchSecondsToRecord) {
      document.documentElement.setAttribute(
        TRACKER_LAST_FLUSH_ATTR,
        `skipped:below-min-watch:${watchedSeconds.toFixed(2)}`
      );
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][flush][vod] skipped: below-min-watch", {
          vodId,
          watchedSeconds,
          minWatchSecondsToRecord: settings.heatmap.minWatchSecondsToRecord
        });
      }
      return;
    }

    const meta = toVodMeta(vodId);
    if (!meta) {
      segmentBuffer.requeueRanges(ranges);
      document.documentElement.setAttribute(TRACKER_LAST_FLUSH_ATTR, "blocked:missing-meta");
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.warn("[td][flush][vod] blocked: missing-meta, requeued", {
          vodId,
          rangeCount: ranges.length,
          watchedSeconds
        });
      }
      return;
    }

    document.documentElement.setAttribute(
      TRACKER_LAST_META_ATTR,
      JSON.stringify({
        channelId: meta.channelId,
        channelLogin: meta.channelLogin,
        durationSeconds: meta.durationSeconds,
        createdAt: meta.createdAt
      })
    );

    if (SHOULD_LOG_FLUSH_DEBUG) {
      console.info("[td][flush][vod] sending", {
        vodId,
        rangeCount: ranges.length,
        watchedSeconds,
        meta
      });
    }

    const response = await sendMsg<{ ok: boolean }>({
      type: "flushRanges",
      kind: "vod",
      vodId,
      meta,
      ranges
    }).catch(() => undefined);

    if (!response?.ok) {
      segmentBuffer.requeueRanges(ranges);
      document.documentElement.setAttribute(TRACKER_LAST_FLUSH_ATTR, "failed:send-or-handler");
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.warn("[td][flush][vod] failed: send-or-handler, requeued", {
          vodId,
          rangeCount: ranges.length
        });
      }
      return;
    }

    document.documentElement.setAttribute(
      TRACKER_LAST_FLUSH_ATTR,
      `success:ranges=${ranges.length}:seconds=${watchedSeconds.toFixed(2)}`
    );

    if (SHOULD_LOG_FLUSH_DEBUG) {
      console.info("[td][flush][vod] success", {
        vodId,
        rangeCount: ranges.length
      });
    }
  };

  const sampleTick = (): void => {
    if (!isUrlForThisVod()) {
      return;
    }

    const state = playerProbe.getState();
    if (state.paused || state.ended || state.readyState < 3) {
      return;
    }

    if (settings.heatmap.pauseWhenTabUnfocused && document.hidden) {
      if (SHOULD_LOG_FLUSH_DEBUG && !hiddenSkipLogged) {
        console.warn("[td][flush][vod] sampling-paused: hidden-tab-setting-enabled", {
          vodId,
          pauseWhenTabUnfocused: settings.heatmap.pauseWhenTabUnfocused
        });
        hiddenSkipLogged = true;
      }
      return;
    }

    hiddenSkipLogged = false;

    segmentBuffer.pushSample({
      wallClockMs: Date.now(),
      currentTime: state.currentTime
    });
  };

  const sampleTimer = window.setInterval(sampleTick, SAMPLE_INTERVAL_MS);
  const flushTimer = window.setInterval(() => {
    void flushPending();
  }, FLUSH_INTERVAL_MS);

  const handleVisibilityChange = (): void => {
    if (!document.hidden) {
      return;
    }

    void flushPending();
  };

  const handleBeforeUnload = (): void => {
    void flushPending();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);

  const onVodMeta = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !isValidVodMeta(event.detail)) {
      return;
    }

    if (event.detail.vodId !== vodId) {
      return;
    }

    if (!isUrlForThisVod()) {
      return;
    }

    void flushPending();
  };

  document.addEventListener(VOD_EVENT_NAME, onVodMeta as EventListener);

  return {
    vodId,
    stop: async (): Promise<void> => {
      if (stopped) {
        return;
      }

      stopped = true;
      window.clearInterval(sampleTimer);
      window.clearInterval(flushTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener(VOD_EVENT_NAME, onVodMeta as EventListener);
      browser.storage.onChanged.removeListener(onStorageChanged);
      playerProbe.dispose();
      await flushPending({ force: true });
      segmentBuffer.reset();
      document.documentElement.removeAttribute(TRACKER_ACTIVE_ATTR);
    }
  };
};

