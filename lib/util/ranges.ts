export type Range = [number, number];

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const isValidRange = (range: Range): boolean => {
  const [start, end] = range;
  if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
    return false;
  }

  return end > start;
};

const normalizeRanges = (ranges: Range[]): Range[] => {
  if (ranges.length === 0) {
    return [];
  }

  const validRanges = ranges.filter(isValidRange).sort((left, right) => left[0] - right[0]);
  if (validRanges.length === 0) {
    return [];
  }

  const merged: Range[] = [];
  for (const [start, end] of validRanges) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push([start, end]);
      continue;
    }

    if (start > last[1]) {
      merged.push([start, end]);
      continue;
    }

    last[1] = Math.max(last[1], end);
  }

  return merged;
};

export function merge(existing: Range[], incoming: Range[]): Range[] {
  return normalizeRanges([...existing, ...incoming]);
}

export function totalDuration(_ranges: Range[]): number {
  const normalized = normalizeRanges(_ranges);
  if (normalized.length === 0) {
    return 0;
  }

  let total = 0;
  for (const [start, end] of normalized) {
    total += end - start;
  }

  return total;
}

export function coveragePct(_ranges: Range[], _totalDuration: number): number {
  if (!isFiniteNumber(_totalDuration) || _totalDuration <= 0) {
    return 0;
  }

  const watched = totalDuration(_ranges);
  const pct = (watched / _totalDuration) * 100;
  if (pct <= 0) {
    return 0;
  }

  return Math.min(pct, 100);
}

export function quantize(_ranges: Range[], _bucketSec: number): Range[] {
  const normalized = normalizeRanges(_ranges);
  if (normalized.length === 0) {
    return [];
  }

  if (!isFiniteNumber(_bucketSec) || _bucketSec <= 0) {
    return normalized;
  }

  const quantized = normalized.map(([start, end]) => {
    const quantizedStart = Math.floor(start / _bucketSec) * _bucketSec;
    const quantizedEnd = Math.ceil(end / _bucketSec) * _bucketSec;
    return [quantizedStart, quantizedEnd] as Range;
  });

  return normalizeRanges(quantized);
}

export function offset(_ranges: Range[], _deltaSec: number): Range[] {
  if (!isFiniteNumber(_deltaSec)) {
    return normalizeRanges(_ranges);
  }

  const shifted = _ranges.map(([start, end]) => [start + _deltaSec, end + _deltaSec] as Range);
  return normalizeRanges(shifted);
}

export function clamp(_ranges: Range[], _min: number, _max: number): Range[] {
  if (!isFiniteNumber(_min) || !isFiniteNumber(_max)) {
    return [];
  }

  if (_max <= _min) {
    return [];
  }

  const normalized = normalizeRanges(_ranges);
  if (normalized.length === 0) {
    return [];
  }

  const clamped: Range[] = [];
  for (const [start, end] of normalized) {
    const clampedStart = Math.max(start, _min);
    const clampedEnd = Math.min(end, _max);

    if (clampedEnd <= clampedStart) {
      continue;
    }

    clamped.push([clampedStart, clampedEnd]);
  }

  return normalizeRanges(clamped);
}
