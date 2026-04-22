/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createVodTrackerLifecycle } from "../entrypoints/content/tracker/vodTrackerLifecycle";
import { VOD_EVENT_NAME } from "../entrypoints/content/tracker/streamMetadata";

describe("vodTracker lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not duplicate tracker for same VOD route and stops on route exits", async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createVodTrackerLifecycle(async (vodId) => {
      starts.push(vodId);
      return {
        vodId,
        stop: async () => {
          stops.push(vodId);
        }
      };
    });

    await lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    await lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    await lifecycle.sync(new URL("https://www.twitch.tv/videos/200"));
    await lifecycle.sync(new URL("https://www.twitch.tv/some_channel"));
    await lifecycle.stop();

    expect(starts).toEqual(["100", "200"]);
    expect(stops).toEqual(["100", "200"]);
  });

  it("handles rapid sync calls without duplicate same-vod starts", async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createVodTrackerLifecycle(async (vodId) => {
      starts.push(vodId);
      await Promise.resolve();
      return {
        vodId,
        stop: async () => {
          stops.push(vodId);
        }
      };
    });

    await Promise.all([
      lifecycle.sync(new URL("https://www.twitch.tv/videos/100")),
      lifecycle.sync(new URL("https://www.twitch.tv/videos/100")),
      lifecycle.sync(new URL("https://www.twitch.tv/videos/200"))
    ]);
    await lifecycle.stop();

    expect(starts).toEqual(["100", "200"]);
    expect(stops).toEqual(["100", "200"]);
  });

  it("route watchdog resyncs when URL changes without explicit sync", async () => {
    vi.useFakeTimers();
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createVodTrackerLifecycle(async (vodId) => {
      starts.push(vodId);
      return {
        vodId,
        stop: async () => {
          stops.push(vodId);
        }
      };
    });

    await lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    expect(starts).toEqual(["100"]);

    window.history.pushState({}, "", "/videos/200");
    await vi.advanceTimersByTimeAsync(600);

    expect(starts).toEqual(["100", "200"]);
    expect(stops).toEqual(["100"]);
    await lifecycle.stop();
    expect(stops).toEqual(["100", "200"]);
  });
});

describe("vodTracker lifecycle td:vod-meta resync", () => {
  it("re-runs URL sync when td:vod-meta fires after history navigates to another VOD", async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createVodTrackerLifecycle(async (vodId) => {
      starts.push(vodId);
      return {
        vodId,
        stop: async () => {
          stops.push(vodId);
        }
      };
    });

    window.history.pushState({}, "", "/videos/100");
    await lifecycle.sync(new URL(window.location.href));
    expect(starts).toEqual(["100"]);

    window.history.pushState({}, "", "/videos/200");
    document.dispatchEvent(
      new CustomEvent(VOD_EVENT_NAME, {
        detail: {
          vodId: "200",
          channelId: "c1",
          channelLogin: "ch",
          durationSeconds: 3600,
          createdAt: 1_000_000,
          source: "fetch",
          observedAt: Date.now()
        }
      })
    );

    await vi.waitFor(() => {
      expect(starts).toEqual(["100", "200"]);
    });

    expect(stops).toEqual(["100"]);
    await lifecycle.stop();
    expect(stops).toEqual(["100", "200"]);
  });
});
