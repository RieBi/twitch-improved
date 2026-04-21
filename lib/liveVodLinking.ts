import type { LiveSessionRecord, VodRecord } from "./db/schema";
import {
  commitVodLinkingTransaction,
  getLiveSession,
  getLiveSessionsByChannelSince,
  getUnlinkedLiveSessions,
  getVod,
  getVodsByChannel
} from "./db/repo";
import { clamp, merge, offset, totalDuration } from "./util/ranges";

export const LINK_TOLERANCE_MS = 10 * 60 * 1_000;
export const SWEEP_MIN_SESSION_AGE_MS = 30 * 60 * 1_000;

const clampUpper = (durationSeconds: number | null): number =>
  durationSeconds ?? Number.POSITIVE_INFINITY;

const isWithinLinkTolerance = (aMs: number, bMs: number): boolean =>
  Math.abs(aMs - bMs) < LINK_TOLERANCE_MS;

const mergeLiveIntoVodRanges = (
  vod: VodRecord,
  live: LiveSessionRecord
): VodRecord["ranges"] => {
  if (vod.createdAt === null) {
    return vod.ranges;
  }

  const deltaSec = (live.streamStartedAt - vod.createdAt) / 1_000;
  const translated = offset(live.ranges, deltaSec);
  const clamped = clamp(translated, 0, clampUpper(vod.durationSeconds));
  return merge(vod.ranges, clamped);
};

const markLiveLinked = (live: LiveSessionRecord, vodId: string, nowMs: number): LiveSessionRecord => ({
  ...live,
  linkedVodId: vodId,
  lastUpdated: nowMs
});

const finalizeVodRanges = (vod: VodRecord, ranges: VodRecord["ranges"], nowMs: number): VodRecord => ({
  ...vod,
  ranges,
  totalWatchedSeconds: totalDuration(ranges),
  lastUpdated: nowMs
});

export async function linkEligibleLiveSessionsToVod(
  vod: VodRecord,
  nowMs: number = Date.now()
): Promise<VodRecord> {
  if (vod.createdAt === null) {
    return vod;
  }

  const minStreamStartedAt = vod.createdAt - LINK_TOLERANCE_MS;
  const candidates = await getLiveSessionsByChannelSince(vod.channelId, minStreamStartedAt);
  const eligible = candidates.filter(
    (session) =>
      session.linkedVodId === null &&
      session.streamStartedAt <= vod.createdAt! + LINK_TOLERANCE_MS &&
      isWithinLinkTolerance(session.streamStartedAt, vod.createdAt!)
  );

  if (eligible.length === 0) {
    return vod;
  }

  let ranges = vod.ranges;
  for (const live of eligible) {
    ranges = mergeLiveIntoVodRanges({ ...vod, ranges }, live);
  }

  const nextVod = finalizeVodRanges(vod, ranges, nowMs);
  const updatedLives = eligible.map((live) => markLiveLinked(live, vod.vodId, nowMs));
  await commitVodLinkingTransaction(nextVod, updatedLives);
  return nextVod;
}

export async function runUnlinkedLiveSessionSweep(
  nowMs: number = Date.now()
): Promise<VodRecord[]> {
  const stale = (await getUnlinkedLiveSessions()).filter(
    (session) => nowMs - session.lastUpdated >= SWEEP_MIN_SESSION_AGE_MS
  );

  const updatedVods: VodRecord[] = [];

  for (const session of stale) {
    const live = await getLiveSession(session.sessionId);
    if (!live || live.linkedVodId !== null) {
      continue;
    }

    const vods = await getVodsByChannel(live.channelId);
    const candidates = vods.filter(
      (vod) =>
        vod.createdAt !== null && isWithinLinkTolerance(vod.createdAt, live.streamStartedAt)
    );

    if (candidates.length === 0) {
      continue;
    }

    // Prefer the VOD whose createdAt is closest to stream start so one session is not linked twice.
    candidates.sort(
      (left, right) =>
        Math.abs(left.createdAt! - live.streamStartedAt) -
        Math.abs(right.createdAt! - live.streamStartedAt)
    );

    const targetId = candidates[0]!.vodId;
    let vod = await getVod(targetId);
    if (!vod || vod.createdAt === null) {
      continue;
    }

    const ranges = mergeLiveIntoVodRanges(vod, live);
    const nextVod = finalizeVodRanges(vod, ranges, nowMs);
    const nextLive = markLiveLinked(live, vod.vodId, nowMs);
    await commitVodLinkingTransaction(nextVod, [nextLive]);
    updatedVods.push(nextVod);
  }

  return updatedVods;
}
