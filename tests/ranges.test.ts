import { clamp, coveragePct, merge, offset, quantize, totalDuration, type Range } from "../lib/util/ranges";

import { describe, expect, it } from "vitest";

describe("ranges.merge", () => {
  it("returns empty for empty inputs", () => {
    expect(merge([], [])).toEqual([]);
  });

  it("returns sorted, non-overlapping intervals", () => {
    const existing: Range[] = [
      [20, 25],
      [0, 10]
    ];
    const incoming: Range[] = [[12, 18]];

    expect(merge(existing, incoming)).toEqual([
      [0, 10],
      [12, 18],
      [20, 25]
    ]);
  });

  it("merges overlapping and touching intervals", () => {
    const existing: Range[] = [[0, 10]];
    const incoming: Range[] = [
      [5, 15],
      [15, 20]
    ];

    expect(merge(existing, incoming)).toEqual([[0, 20]]);
  });

  it("drops degenerate or invalid intervals", () => {
    const existing: Range[] = [
      [0, 0],
      [5, 2],
      [1, 3]
    ];
    const incoming: Range[] = [
      [Number.NaN, 10],
      [4, Number.POSITIVE_INFINITY],
      [3, 4]
    ];

    expect(merge(existing, incoming)).toEqual([
      [1, 4]
    ]);
  });
});

describe("ranges.totalDuration", () => {
  it("sums merged duration without double counting", () => {
    const ranges: Range[] = [
      [0, 10],
      [5, 15],
      [20, 25]
    ];

    expect(totalDuration(ranges)).toBe(20);
  });

  it("returns zero for empty input", () => {
    expect(totalDuration([])).toBe(0);
  });
});

describe("ranges.coveragePct", () => {
  it("computes percentage from merged watched ranges", () => {
    const ranges: Range[] = [
      [0, 20],
      [40, 50]
    ];

    expect(coveragePct(ranges, 100)).toBe(30);
  });

  it("returns zero when total duration is non-positive or not finite", () => {
    expect(coveragePct([[0, 10]], 0)).toBe(0);
    expect(coveragePct([[0, 10]], -10)).toBe(0);
    expect(coveragePct([[0, 10]], Number.NaN)).toBe(0);
    expect(coveragePct([[0, 10]], Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("caps coverage to 100", () => {
    expect(coveragePct([[0, 150]], 100)).toBe(100);
  });
});

describe("ranges.offset", () => {
  it("shifts all ranges by delta seconds", () => {
    expect(offset([[10, 20], [30, 35]], -5)).toEqual([
      [5, 15],
      [25, 30]
    ]);
  });

  it("drops invalid ranges after offset and normalizes output", () => {
    expect(offset([[0, 0], [2, 3], [10, 9]], 1)).toEqual([[3, 4]]);
  });
});

describe("ranges.clamp", () => {
  it("intersects with clamp window and removes empty slices", () => {
    const ranges: Range[] = [
      [-10, 2],
      [4, 8],
      [10, 20]
    ];

    expect(clamp(ranges, 0, 12)).toEqual([
      [0, 2],
      [4, 8],
      [10, 12]
    ]);
  });

  it("returns empty when clamp bounds are invalid", () => {
    expect(clamp([[0, 10]], 10, 10)).toEqual([]);
    expect(clamp([[0, 10]], 12, 10)).toEqual([]);
  });
});

describe("ranges.quantize", () => {
  it("quantizes to bucket boundaries and re-merges", () => {
    const ranges: Range[] = [
      [1.2, 4.8],
      [5.1, 9.9]
    ];

    expect(quantize(ranges, 5)).toEqual([[0, 10]]);
  });

  it("is idempotent for already quantized ranges", () => {
    const ranges: Range[] = [
      [0, 10],
      [20, 30]
    ];

    expect(quantize(ranges, 10)).toEqual(ranges);
    expect(quantize(quantize(ranges, 10), 10)).toEqual(ranges);
  });

  it("returns normalized ranges when bucket is invalid", () => {
    const ranges: Range[] = [
      [5, 8],
      [2, 4],
      [3.5, 3.6]
    ];

    expect(quantize(ranges, 0)).toEqual([
      [2, 4],
      [5, 8]
    ]);
  });
});
