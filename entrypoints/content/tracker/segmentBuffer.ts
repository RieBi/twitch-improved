import { quantize, type Range } from "../../../lib/util/ranges";

export interface TrackerSample {
  wallClockMs: number;
  currentTime: number;
}

interface SegmentState {
  start: number;
  end: number;
}

const MAX_ALLOWED_DRIFT_SECONDS = 0.5;

const isValidSample = (sample: TrackerSample): boolean => {
  return Number.isFinite(sample.wallClockMs) && Number.isFinite(sample.currentTime) && sample.currentTime >= 0;
};

const isValidSegment = (segment: SegmentState | null): segment is SegmentState =>
  !!segment && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start;

export interface SegmentBuffer {
  pushSample(sample: TrackerSample): void;
  flushPendingRanges(bucketSeconds: number): Range[];
  requeueRanges(ranges: Range[]): void;
  reset(): void;
}

export const createSegmentBuffer = (): SegmentBuffer => {
  let lastSample: TrackerSample | null = null;
  let openSegment: SegmentState | null = null;
  let closedSegments: Range[] = [];

  const closeOpenSegment = (): void => {
    if (!isValidSegment(openSegment)) {
      return;
    }

    closedSegments.push([openSegment.start, openSegment.end]);
  };

  const startOpenSegmentAt = (currentTime: number): void => {
    openSegment = { start: currentTime, end: currentTime };
  };

  const preserveContinuityAfterFlush = (): void => {
    if (!lastSample) {
      openSegment = null;
      return;
    }

    startOpenSegmentAt(lastSample.currentTime);
  };

  return {
    pushSample(sample: TrackerSample): void {
      if (!isValidSample(sample)) {
        return;
      }

      if (!lastSample) {
        lastSample = sample;
        startOpenSegmentAt(sample.currentTime);
        return;
      }

      const wallDeltaSeconds = (sample.wallClockMs - lastSample.wallClockMs) / 1000;
      const mediaDeltaSeconds = sample.currentTime - lastSample.currentTime;
      const isContinuous =
        wallDeltaSeconds > 0 &&
        mediaDeltaSeconds >= 0 &&
        Math.abs(mediaDeltaSeconds - wallDeltaSeconds) < MAX_ALLOWED_DRIFT_SECONDS;

      if (!isContinuous) {
        closeOpenSegment();
        startOpenSegmentAt(sample.currentTime);
        lastSample = sample;
        return;
      }

      if (!openSegment) {
        startOpenSegmentAt(lastSample.currentTime);
      }

      if (openSegment) {
        openSegment.end = Math.max(openSegment.end, sample.currentTime);
      }

      lastSample = sample;
    },

    flushPendingRanges(bucketSeconds: number): Range[] {
      closeOpenSegment();
      const quantized = quantize(closedSegments, bucketSeconds);
      closedSegments = [];
      preserveContinuityAfterFlush();
      return quantized;
    },

    requeueRanges(ranges: Range[]): void {
      if (ranges.length === 0) {
        return;
      }

      closedSegments = quantize([...closedSegments, ...ranges], 0);
    },

    reset(): void {
      lastSample = null;
      openSegment = null;
      closedSegments = [];
    }
  };
};

