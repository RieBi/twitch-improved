import browser from "webextension-polyfill";

import { sendMsg, type LiveMeta } from "../../../lib/messaging";
import { defaultSettings, loadSettings, type Settings } from "../../../lib/settings";
import { computeLiveStreamPositionSec } from "../../../lib/util/liveStreamPosition";
import { totalDuration } from "../../../lib/util/ranges";
import { createSegmentBuffer } from "./segmentBuffer";
import { waitForPlayerProbe } from "./playerProbe";

const SAMPLE_INTERVAL_MS = 1_000;
const FLUSH_INTERVAL_MS = 10_000;
const SHOULD_LOG_FLUSH_DEBUG = import.meta.env.DEV;
const TRACKER_ACTIVE_ATTR = "data-td-livetracker-active";
const TRACKER_LAST_FLUSH_ATTR = "data-td-livetracker-last-flush";
const TRACKER_LAST_META_ATTR = "data-td-livetracker-last-meta";
const TRACKER_LAST_ERROR_ATTR = "data-td-livetracker-last-error";

const loadSettingsOrDefault = async (): Promise<Settings> => {
  try {
    return await loadSettings();
  } catch {
    return defaultSettings;
  }
};

export interface LiveTrackerSession {
  sessionId: string;
  stop(): Promise<void>;
}

export const startLiveTracker = async (
  sessionId: string,
  meta: LiveMeta
): Promise<LiveTrackerSession> => {
  let settings = await loadSettingsOrDefault();
  if (!settings.heatmap.enabled || !settings.heatmap.trackLiveStreams) {
    return {
      sessionId,
      stop: async () => undefined
    };
  }

  document.documentElement.setAttribute(TRACKER_ACTIVE_ATTR, sessionId);
  const playerProbe = await waitForPlayerProbe();
  if (!playerProbe) {
    document.documentElement.setAttribute(TRACKER_LAST_ERROR_ATTR, "player-probe-missing");
    document.documentElement.removeAttribute(TRACKER_ACTIVE_ATTR);
    return {
      sessionId,
      stop: async () => undefined
    };
  }

  const segmentBuffer = createSegmentBuffer({ mode: "live" });
  let stopped = false;
  let hiddenSkipLogged = false;
  const streamStartedAtMs = meta.streamStartedAt;
  const DIAG_ATTR = "data-td-livetracker-diag";
  let diag = {
    pushTotal: 0,
    skipGate: 0,
    skipPaused: 0,
    skipReady: 0,
    skipHidden: 0,
    skipInvalidPos: 0,
    lastStreamPos: null as number | null,
    lastWallDeltaMs: null as number | null
  };
  let lastSampleWallMs: number | null = null;

  const onStorageChanged = (): void => {
    void loadSettingsOrDefault().then((next) => {
      settings = next;
    });
  };

  browser.storage.onChanged.addListener(onStorageChanged);

  const writeDiag = (): void => {
    try {
      document.documentElement.setAttribute(DIAG_ATTR, JSON.stringify(diag));
    } catch {
      // ignore
    }
  };

  const flushPending = async (): Promise<void> => {
    const ranges = segmentBuffer.flushPendingRanges(settings.heatmap.bucketSeconds);
    writeDiag();
    if (ranges.length === 0) {
      document.documentElement.setAttribute(TRACKER_LAST_FLUSH_ATTR, "skipped:no-ranges");
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][flush][live] skipped: no-ranges", { sessionId, diag });
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
        console.info("[td][flush][live] skipped: below-min-watch", {
          sessionId,
          watchedSeconds,
          minWatchSecondsToRecord: settings.heatmap.minWatchSecondsToRecord
        });
      }
      return;
    }

    document.documentElement.setAttribute(
      TRACKER_LAST_META_ATTR,
      JSON.stringify({
        channelId: meta.channelId,
        channelLogin: meta.channelLogin,
        streamStartedAt: meta.streamStartedAt
      })
    );

    if (SHOULD_LOG_FLUSH_DEBUG) {
      console.info("[td][flush][live] sending", {
        sessionId,
        rangeCount: ranges.length,
        watchedSeconds,
        meta
      });
    }

    const response = await sendMsg<{ ok: boolean }>({
      type: "flushRanges",
      kind: "live",
      sessionId,
      meta,
      ranges
    }).catch(() => undefined);

    if (!response?.ok) {
      segmentBuffer.requeueRanges(ranges);
      document.documentElement.setAttribute(TRACKER_LAST_FLUSH_ATTR, "failed:send-or-handler");
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.warn("[td][flush][live] failed: send-or-handler, requeued", {
          sessionId,
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
      console.info("[td][flush][live] success", {
        sessionId,
        rangeCount: ranges.length
      });
    }
  };

  const sampleTick = (): void => {
    if (!settings.heatmap.enabled || !settings.heatmap.trackLiveStreams) {
      diag.skipGate += 1;
      return;
    }

    const video = playerProbe.video;
    const state = playerProbe.getState();
    // Live HLS often sits at readyState 2; VOD path uses 3 in the spec.
    if (state.paused || state.ended) {
      diag.skipPaused += 1;
      return;
    }

    if (state.readyState < 2) {
      diag.skipReady += 1;
      return;
    }

    if (settings.heatmap.pauseWhenTabUnfocused && document.hidden) {
      diag.skipHidden += 1;
      if (SHOULD_LOG_FLUSH_DEBUG && !hiddenSkipLogged) {
        console.warn("[td][flush][live] sampling-paused: hidden-tab-setting-enabled", {
          sessionId,
          pauseWhenTabUnfocused: settings.heatmap.pauseWhenTabUnfocused
        });
        hiddenSkipLogged = true;
      }
      return;
    }

    hiddenSkipLogged = false;

    const wallClockMs = Date.now();
    const currentTime = computeLiveStreamPositionSec(wallClockMs, streamStartedAtMs, video);
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      diag.skipInvalidPos += 1;
      diag.lastStreamPos = currentTime;
      return;
    }

    if (lastSampleWallMs !== null) {
      diag.lastWallDeltaMs = wallClockMs - lastSampleWallMs;
    }

    lastSampleWallMs = wallClockMs;
    diag.lastStreamPos = currentTime;
    diag.pushTotal += 1;
    segmentBuffer.pushSample({
      wallClockMs,
      currentTime
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
    sessionId,
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
      document.documentElement.removeAttribute(TRACKER_ACTIVE_ATTR);
    }
  };
};
