import browser from "webextension-polyfill";

import { sendMsg, type Msg } from "../../../lib/messaging";
import { defaultSettings, loadSettings, type Settings } from "../../../lib/settings";
import { totalDuration } from "../../../lib/util/ranges";
import { getLatestVodMeta } from "./streamMetadata";
import { createSegmentBuffer } from "./segmentBuffer";
import { waitForPlayerProbe } from "./playerProbe";

const SAMPLE_INTERVAL_MS = 1_000;
const FLUSH_INTERVAL_MS = 10_000;
const SHOULD_LOG_FLUSH_DEBUG = import.meta.env.DEV;

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
  const playerProbe = await waitForPlayerProbe();
  if (!playerProbe) {
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

  const flushPending = async (): Promise<void> => {
    const ranges = segmentBuffer.flushPendingRanges(settings.heatmap.bucketSeconds);
    if (ranges.length === 0) {
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][flush][vod] skipped: no-ranges", { vodId });
      }
      return;
    }

    const watchedSeconds = totalDuration(ranges);
    if (watchedSeconds < settings.heatmap.minWatchSecondsToRecord) {
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
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.warn("[td][flush][vod] blocked: missing-meta, requeued", {
          vodId,
          rangeCount: ranges.length,
          watchedSeconds
        });
      }
      return;
    }

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
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.warn("[td][flush][vod] failed: send-or-handler, requeued", {
          vodId,
          rangeCount: ranges.length
        });
      }
      return;
    }

    if (SHOULD_LOG_FLUSH_DEBUG) {
      console.info("[td][flush][vod] success", {
        vodId,
        rangeCount: ranges.length
      });
    }
  };

  const sampleTick = (): void => {
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
      browser.storage.onChanged.removeListener(onStorageChanged);
      playerProbe.dispose();
      await flushPending();
      segmentBuffer.reset();
    }
  };
};

