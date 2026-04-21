/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMsgMock, waitForPlayerProbeMock } = vi.hoisted(() => ({
  sendMsgMock: vi.fn(),
  waitForPlayerProbeMock: vi.fn()
}));

vi.mock("../lib/messaging", async () => {
  const actual = await vi.importActual("../lib/messaging");
  return {
    ...actual,
    sendMsg: sendMsgMock
  };
});

vi.mock("../entrypoints/content/tracker/playerProbe", () => ({
  waitForPlayerProbe: waitForPlayerProbeMock
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

import { startLiveTracker } from "../entrypoints/content/tracker/liveTracker";

describe("liveTracker route guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    window.history.pushState({}, "", "/streamer");
    sendMsgMock.mockReset();
    sendMsgMock.mockResolvedValue({ ok: true });

    waitForPlayerProbeMock.mockReset();
    waitForPlayerProbeMock.mockResolvedValue({
      video: {
        currentTime: 120,
        seekable: {
          length: 0,
          end: () => 0
        }
      },
      getState: () => ({
        paused: false,
        ended: false,
        readyState: 3,
        currentTime: 120
      }),
      dispose: vi.fn()
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not keep flushing live ranges after navigating to a VOD", async () => {
    const nowMs = Date.now();
    const session = await startLiveTracker("c1:1000", {
      channelId: "c1",
      channelLogin: "streamer",
      streamStartedAt: nowMs - 60_000
    });

    await vi.advanceTimersByTimeAsync(11_000);
    expect(sendMsgMock).toHaveBeenCalledTimes(1);

    window.history.pushState({}, "", "/videos/200");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sendMsgMock).toHaveBeenCalledTimes(1);

    await session.stop();
  });
});
