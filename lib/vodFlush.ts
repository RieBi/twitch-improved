import type { Msg } from "./messaging";
import { getVod, putVod } from "./db/repo";
import { merge, totalDuration } from "./util/ranges";
import type { VodRecord } from "./db/schema";

type VodFlushMessage = Extract<Msg, { type: "flushRanges"; kind: "vod" }>;

export const applyVodFlush = async (
  message: VodFlushMessage,
  nowMs: number = Date.now()
): Promise<VodRecord> => {
  console.log("FLUSH");
  const existing = await getVod(message.vodId);
  const mergedRanges = merge(existing?.ranges ?? [], message.ranges);

  const nextRecord: VodRecord = {
    vodId: message.vodId,
    channelId: existing?.channelId ?? message.meta.channelId,
    channelLogin: existing?.channelLogin ?? message.meta.channelLogin,
    durationSeconds: message.meta.durationSeconds ?? existing?.durationSeconds ?? null,
    createdAt: message.meta.createdAt ?? existing?.createdAt ?? null,
    ranges: mergedRanges,
    totalWatchedSeconds: totalDuration(mergedRanges),
    markedWatched: existing?.markedWatched ?? false,
    lastUpdated: nowMs
  };

  await putVod(nextRecord);
  return nextRecord;
};

