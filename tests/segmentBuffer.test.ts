import { describe, expect, it } from "vitest";

import { createSegmentBuffer } from "../entrypoints/content/tracker/segmentBuffer";

describe("segmentBuffer", () => {
  it("folds continuous samples and quantizes on flush", () => {
    const buffer = createSegmentBuffer();
    buffer.pushSample({ wallClockMs: 1_000, currentTime: 10 });
    buffer.pushSample({ wallClockMs: 2_000, currentTime: 11 });
    buffer.pushSample({ wallClockMs: 3_000, currentTime: 12 });

    expect(buffer.flushPendingRanges(5)).toEqual([[10, 15]]);
  });

  it("splits ranges on discontinuities", () => {
    const buffer = createSegmentBuffer();
    buffer.pushSample({ wallClockMs: 1_000, currentTime: 10 });
    buffer.pushSample({ wallClockMs: 2_000, currentTime: 11 });
    buffer.pushSample({ wallClockMs: 3_000, currentTime: 30 });
    buffer.pushSample({ wallClockMs: 4_000, currentTime: 31 });

    expect(buffer.flushPendingRanges(1)).toEqual([
      [10, 11],
      [30, 31]
    ]);
  });

  it("clears internal state when reset is called", () => {
    const buffer = createSegmentBuffer();
    buffer.pushSample({ wallClockMs: 1_000, currentTime: 10 });
    buffer.pushSample({ wallClockMs: 2_000, currentTime: 11 });
    buffer.reset();

    expect(buffer.flushPendingRanges(1)).toEqual([]);
  });

  it("requeues flushed ranges for later retry", () => {
    const buffer = createSegmentBuffer();
    buffer.pushSample({ wallClockMs: 1_000, currentTime: 10 });
    buffer.pushSample({ wallClockMs: 2_000, currentTime: 11 });
    const flushed = buffer.flushPendingRanges(1);
    buffer.requeueRanges(flushed);

    expect(buffer.flushPendingRanges(1)).toEqual([[10, 11]]);
  });
});

