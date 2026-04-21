/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLatestStreamMetaMock } = vi.hoisted(() => ({
  getLatestStreamMetaMock: vi.fn<
    () =>
      | {
          channelId: string;
          channelLogin: string;
          streamStartedAt: number;
        }
      | null
  >()
}));

vi.mock("../entrypoints/content/tracker/streamMetadata", () => ({
  getLatestStreamMeta: getLatestStreamMetaMock
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}));

import { createLiveTrackerLifecycle } from "../entrypoints/content/tracker/liveTrackerLifecycle";

describe("liveTracker lifecycle", () => {
  beforeEach(() => {
    getLatestStreamMetaMock.mockReset();
    getLatestStreamMetaMock.mockReturnValue({
      channelId: "c1",
      channelLogin: "streamer",
      streamStartedAt: 1_000
    });
    window.history.pushState({}, "", "/");
  });

  it("stops live tracker on VOD route and ignores future stream-meta resync events", async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createLiveTrackerLifecycle(async (sessionId) => {
      starts.push(sessionId);
      return {
        sessionId,
        stop: async () => {
          stops.push(sessionId);
        }
      };
    });

    await lifecycle.sync(new URL("https://www.twitch.tv/streamer"));
    expect(starts).toEqual(["c1:1000"]);

    await lifecycle.sync(new URL("https://www.twitch.tv/videos/200"));
    expect(stops).toEqual(["c1:1000"]);

    document.dispatchEvent(new CustomEvent("td:stream-meta"));
    await Promise.resolve();
    expect(starts).toEqual(["c1:1000"]);

    await lifecycle.stop();
    expect(stops).toEqual(["c1:1000"]);
  });
});
