import { getVod, putVod } from "./db/repo";
import type { VodRecord } from "./db/schema";

export const toggleMarkedWatched = async (
  vodId: string,
  nowMs: number = Date.now()
): Promise<VodRecord> => {
  const existing = await getVod(vodId);

  if (existing) {
    const next: VodRecord = {
      ...existing,
      markedWatched: !existing.markedWatched,
      lastUpdated: nowMs
    };
    await putVod(next);
    return next;
  }

  const created: VodRecord = {
    vodId,
    channelId: "",
    channelLogin: "",
    durationSeconds: null,
    createdAt: null,
    ranges: [],
    totalWatchedSeconds: 0,
    markedWatched: true,
    lastUpdated: nowMs
  };
  await putVod(created);
  return created;
};
