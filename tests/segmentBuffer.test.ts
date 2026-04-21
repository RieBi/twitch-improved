import { describe, expect, it } from "vitest";

import { createSegmentBuffer } from "../entrypoints/content/tracker/segmentBuffer";

describe("createSegmentBuffer live mode", () => {
  it("accumulates a range when streamPos jitters backward like HLS live edge", () => {
    const buf = createSegmentBuffer({ mode: "live" });
    const t0 = 1_000_000;
    buf.pushSample({ wallClockMs: t0, currentTime: 5000 });
    buf.pushSample({ wallClockMs: t0 + 1000, currentTime: 4990 });
    buf.pushSample({ wallClockMs: t0 + 2000, currentTime: 5005 });
    const ranges = buf.flushPendingRanges(5);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0][0]).toBeLessThanOrEqual(4990);
    expect(ranges[0][1]).toBeGreaterThanOrEqual(5005);
  });

  it("starts a new segment after a DVR-scale jump between ticks", () => {
    const buf = createSegmentBuffer({ mode: "live" });
    const t0 = 2_000_000;
    buf.pushSample({ wallClockMs: t0, currentTime: 10_000 });
    buf.pushSample({ wallClockMs: t0 + 1000, currentTime: 10_005 });
    buf.pushSample({ wallClockMs: t0 + 2000, currentTime: 500 });
    buf.pushSample({ wallClockMs: t0 + 3000, currentTime: 505 });
    buf.pushSample({ wallClockMs: t0 + 4000, currentTime: 510 });
    const ranges = buf.flushPendingRanges(5);
    expect(ranges.length).toBeGreaterThanOrEqual(2);
  });
});

describe("createSegmentBuffer vod mode (default)", () => {
  it("still requires monotonic media time", () => {
    const buf = createSegmentBuffer();
    const t0 = 3_000_000;
    buf.pushSample({ wallClockMs: t0, currentTime: 100 });
    buf.pushSample({ wallClockMs: t0 + 1000, currentTime: 99 });
    const ranges = buf.flushPendingRanges(5);
    expect(ranges).toEqual([]);
  });
});
