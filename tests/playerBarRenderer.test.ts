/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VodRecord } from "../lib/db/schema";

const {
  sendMsgMock,
  runtimeAddListenerMock,
  runtimeRemoveListenerMock,
  storageAddListenerMock,
  storageRemoveListenerMock,
  storageSyncGetMock
} = vi.hoisted(() => ({
  sendMsgMock: vi.fn(),
  runtimeAddListenerMock: vi.fn(),
  runtimeRemoveListenerMock: vi.fn(),
  storageAddListenerMock: vi.fn(),
  storageRemoveListenerMock: vi.fn(),
  storageSyncGetMock: vi.fn(async () => ({}))
}));

vi.mock("../lib/messaging", async () => {
  const actual = await vi.importActual("../lib/messaging");
  return {
    ...actual,
    sendMsg: sendMsgMock
  };
});

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: runtimeAddListenerMock,
        removeListener: runtimeRemoveListenerMock
      }
    },
    storage: {
      sync: {
        get: storageSyncGetMock,
        set: vi.fn(async () => undefined)
      },
      onChanged: {
        addListener: storageAddListenerMock,
        removeListener: storageRemoveListenerMock
      }
    }
  }
}));

import {
  computePlayerBarSegments,
  createPlayerBarHeatmapLifecycle
} from "../entrypoints/content/heatmap/playerBarRenderer";

const createRecord = (vodId: string, ranges: [number, number][] = [[0, 10], [50, 80]]): VodRecord => ({
  vodId,
  channelId: "c1",
  channelLogin: "streamer",
  durationSeconds: 100,
  createdAt: 1_000,
  ranges,
  totalWatchedSeconds: 40,
  markedWatched: false,
  lastUpdated: Date.now()
});

const mountPlayerDom = (): void => {
  document.body.innerHTML = `
    <div id="player-root">
      <video></video>
      <div data-a-target="player-seekbar" id="seekbar-interaction">
        <div class="seekbar-bar" id="seekbar-bar">
          <div id="seek-slider" role="slider" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
      </div>
    </div>
  `;

  const slider = document.getElementById("seek-slider") as HTMLElement;
  slider.getBoundingClientRect = () =>
    ({
      width: 640,
      height: 10,
      top: 0,
      right: 640,
      bottom: 10,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
};

describe("computePlayerBarSegments", () => {
  it("clamps invalid ranges and computes percentage segments", () => {
    const segments = computePlayerBarSegments(
      [
        [-5, 10],
        [40, 70],
        [90, 120],
        [30, 30],
        [70, 50]
      ],
      100
    );

    expect(segments).toEqual([
      { leftPct: 0, widthPct: 10 },
      { leftPct: 40, widthPct: 30 },
      { leftPct: 90, widthPct: 10 }
    ]);
  });
});

describe("playerBar lifecycle route gating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMsgMock.mockReset();
    runtimeAddListenerMock.mockReset();
    runtimeRemoveListenerMock.mockReset();
    storageAddListenerMock.mockReset();
    storageRemoveListenerMock.mockReset();
    storageSyncGetMock.mockReset();
    storageSyncGetMock.mockResolvedValue({});
    document.body.innerHTML = "";
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders only on VOD routes", async () => {
    sendMsgMock.mockResolvedValue({ records: { "100": createRecord("100") } });

    const lifecycle = createPlayerBarHeatmapLifecycle();

    lifecycle.sync(new URL("https://www.twitch.tv/streamer"));
    await Promise.resolve();
    expect(sendMsgMock).not.toHaveBeenCalled();
    expect(document.querySelector(".td-player-heatmap")).toBeNull();

    mountPlayerDom();

    lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));

    await vi.waitFor(() => {
      expect(sendMsgMock).toHaveBeenCalledWith({
        type: "getVodRecords",
        ids: ["100"]
      });
      expect(document.querySelector(".td-player-heatmap")).not.toBeNull();
      expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(2);
    });

    lifecycle.dispose();
  });

  it("ignores stale fetch result when route switches to a different VOD", async () => {
    mountPlayerDom();
    let resolveFirst: ((value: unknown) => void) | null = null;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    sendMsgMock.mockImplementation((message: { ids: string[] }) => {
      const requestedId = message.ids[0];
      if (requestedId === "100") {
        return firstPromise;
      }

      if (requestedId === "200") {
        return Promise.resolve({ records: { "200": createRecord("200", [[20, 30]]) } });
      }

      return Promise.resolve({ records: {} });
    });

    const lifecycle = createPlayerBarHeatmapLifecycle();
    lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    lifecycle.sync(new URL("https://www.twitch.tv/videos/200"));

    await vi.waitFor(() => {
      expect(sendMsgMock).toHaveBeenCalledWith({
        type: "getVodRecords",
        ids: ["200"]
      });
      expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(1);
    });

    resolveFirst?.({ records: { "100": createRecord("100", [[0, 10], [30, 40]]) } });
    await Promise.resolve();
    await Promise.resolve();

    // Stale `/videos/100` fetch must not overwrite currently active `/videos/200` render.
    expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(1);
    lifecycle.dispose();
  });

  it("ignores stale sync call that resolves after a newer route sync", async () => {
    mountPlayerDom();
    let resolveFirstSettingsGet: ((value: Record<string, unknown>) => void) | null = null;
    const firstSettingsGet = new Promise<Record<string, unknown>>((resolve) => {
      resolveFirstSettingsGet = resolve;
    });

    storageSyncGetMock
      .mockImplementationOnce(async () => firstSettingsGet)
      .mockImplementationOnce(async () => ({}));

    sendMsgMock.mockImplementation((message: { ids: string[] }) => {
      const requestedId = message.ids[0];
      if (requestedId === "100") {
        return Promise.resolve({ records: { "100": createRecord("100", [[0, 10], [30, 40]]) } });
      }

      if (requestedId === "200") {
        return Promise.resolve({ records: { "200": createRecord("200", [[20, 30]]) } });
      }

      return Promise.resolve({ records: {} });
    });

    const lifecycle = createPlayerBarHeatmapLifecycle();
    lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    lifecycle.sync(new URL("https://www.twitch.tv/videos/200"));

    await vi.waitFor(() => {
      expect(sendMsgMock).toHaveBeenCalledWith({
        type: "getVodRecords",
        ids: ["200"]
      });
      expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(1);
    });

    // Allow the older sync call to resolve after the newer one; it must be ignored.
    resolveFirstSettingsGet?.({});
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(1);
    lifecycle.dispose();
  });

  it("route watchdog syncs on URL change when explicit sync is missed", async () => {
    mountPlayerDom();
    sendMsgMock.mockImplementation((message: { ids: string[] }) => {
      const requestedId = message.ids[0];
      if (requestedId === "100") {
        return Promise.resolve({ records: { "100": createRecord("100", [[0, 10], [30, 40]]) } });
      }

      if (requestedId === "200") {
        return Promise.resolve({ records: { "200": createRecord("200", [[20, 30]]) } });
      }

      return Promise.resolve({ records: {} });
    });

    const lifecycle = createPlayerBarHeatmapLifecycle();
    lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    await vi.waitFor(() => {
      expect(sendMsgMock).toHaveBeenCalledWith({
        type: "getVodRecords",
        ids: ["100"]
      });
      expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(2);
    });

    window.history.pushState({}, "", "/videos/200");
    await vi.advanceTimersByTimeAsync(600);

    await vi.waitFor(() => {
      expect(sendMsgMock).toHaveBeenCalledWith({
        type: "getVodRecords",
        ids: ["200"]
      });
      expect(document.querySelectorAll(".td-player-heatmap-seg").length).toBe(1);
    });

    lifecycle.dispose();
  });
});
