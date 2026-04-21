import { describe, expect, it } from "vitest";

import { computeLiveStreamPositionSec } from "../lib/util/liveStreamPosition";

const mockVideo = (
  seekable: { length: number; start: (i: number) => number; end: (i: number) => number },
  currentTime: number
): Pick<HTMLVideoElement, "seekable" | "currentTime"> =>
  ({ seekable, currentTime }) as Pick<HTMLVideoElement, "seekable" | "currentTime">;

describe("computeLiveStreamPositionSec", () => {
  const streamStartMs = 1_776_798_468_000;
  const wallMs = streamStartMs + 3_600_000;

  it("uses liveEdge minus rewind when seekable matches wall-clock stream age", () => {
    const liveEdgeSec = 3600;
    const video = mockVideo(
      {
        length: 1,
        start: () => 3500,
        end: () => 3600
      },
      3580
    );
    expect(computeLiveStreamPositionSec(wallMs, streamStartMs, video)).toBeCloseTo(3580, 5);
  });

  it("falls back to liveEdge when seekable is absolute-scale (Twitch)", () => {
    const video = mockVideo(
      {
        length: 1,
        start: () => 1_776_798_000,
        end: () => 1_776_799_000
      },
      100
    );
    const pos = computeLiveStreamPositionSec(wallMs, streamStartMs, video);
    expect(pos).toBeCloseTo((wallMs - streamStartMs) / 1000, 3);
    expect(pos).toBeGreaterThan(0);
  });
});
