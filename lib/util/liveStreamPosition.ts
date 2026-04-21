/**
 * §5.3 stream-relative seconds: `liveEdgeSec - rewindOffset` when the media
 * timeline matches that model. Twitch often exposes `seekable.end` on an
 * absolute clock while `liveEdgeSec` is seconds since `streamStartedAt`, so
 * subtracting them yields huge negatives; fall back to `liveEdgeSec` only.
 */
export const computeLiveStreamPositionSec = (
  wallClockMs: number,
  streamStartedAtMs: number,
  video: Pick<HTMLVideoElement, "seekable" | "currentTime">
): number => {
  const liveEdgeSec = (wallClockMs - streamStartedAtMs) / 1000;
  if (!Number.isFinite(liveEdgeSec) || liveEdgeSec < 0) {
    return 0;
  }

  if (video.seekable.length === 0) {
    return liveEdgeSec;
  }

  const rewindOffset = video.seekable.end(0) - video.currentTime;
  if (!Number.isFinite(rewindOffset)) {
    return liveEdgeSec;
  }

  const raw = liveEdgeSec - rewindOffset;
  if (!Number.isFinite(raw) || raw < 0 || raw > liveEdgeSec) {
    return liveEdgeSec;
  }

  return raw;
};
