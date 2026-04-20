import { openDatabase } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1_000;
const VOD_RETENTION_MS = 60 * DAY_MS;
const LINKED_LIVE_RETENTION_MS = 60 * DAY_MS;
const UNLINKED_LIVE_RETENTION_MS = 14 * DAY_MS;

export interface GarbageCollectionResult {
  deletedVods: number;
  deletedLinkedLiveSessions: number;
  deletedUnlinkedLiveSessions: number;
}

export interface GarbageCollectionOptions {
  nowMs?: number;
}

const isOlderThan = (lastUpdated: number, cutoffMs: number): boolean => lastUpdated < cutoffMs;

export async function runGarbageCollection(
  options: GarbageCollectionOptions = {}
): Promise<GarbageCollectionResult> {
  const nowMs = options.nowMs ?? Date.now();
  const vodCutoff = nowMs - VOD_RETENTION_MS;
  const linkedLiveCutoff = nowMs - LINKED_LIVE_RETENTION_MS;
  const unlinkedLiveCutoff = nowMs - UNLINKED_LIVE_RETENTION_MS;

  const db = await openDatabase();
  const tx = db.transaction(["vods", "liveSessions"], "readwrite");

  let deletedVods = 0;
  let deletedLinkedLiveSessions = 0;
  let deletedUnlinkedLiveSessions = 0;

  let vodCursor = await tx.objectStore("vods").index("by_lastUpdated").openCursor();
  while (vodCursor) {
    if (
      isOlderThan(vodCursor.value.lastUpdated, vodCutoff) &&
      vodCursor.value.markedWatched === false
    ) {
      await vodCursor.delete();
      deletedVods += 1;
    }

    vodCursor = await vodCursor.continue();
  }

  let liveCursor = await tx.objectStore("liveSessions").openCursor();
  while (liveCursor) {
    const { linkedVodId, lastUpdated } = liveCursor.value;

    if (linkedVodId !== null && isOlderThan(lastUpdated, linkedLiveCutoff)) {
      await liveCursor.delete();
      deletedLinkedLiveSessions += 1;
      liveCursor = await liveCursor.continue();
      continue;
    }

    if (linkedVodId === null && isOlderThan(lastUpdated, unlinkedLiveCutoff)) {
      await liveCursor.delete();
      deletedUnlinkedLiveSessions += 1;
    }

    liveCursor = await liveCursor.continue();
  }

  await tx.done;

  return {
    deletedVods,
    deletedLinkedLiveSessions,
    deletedUnlinkedLiveSessions
  };
}
