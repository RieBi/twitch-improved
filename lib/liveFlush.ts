import type { Msg } from "./messaging";
import { getLiveSession, putLiveSession } from "./db/repo";
import { merge } from "./util/ranges";
import type { LiveSessionRecord } from "./db/schema";

type LiveFlushMessage = Extract<Msg, { type: "flushRanges"; kind: "live" }>;

export const applyLiveFlush = async (
  message: LiveFlushMessage,
  nowMs: number = Date.now()
): Promise<LiveSessionRecord> => {
  const existing = await getLiveSession(message.sessionId);
  const mergedRanges = merge(existing?.ranges ?? [], message.ranges);

  const nextRecord: LiveSessionRecord = {
    sessionId: message.sessionId,
    channelId: existing?.channelId ?? message.meta.channelId,
    channelLogin: existing?.channelLogin ?? message.meta.channelLogin,
    streamStartedAt: existing?.streamStartedAt ?? message.meta.streamStartedAt,
    ranges: mergedRanges,
    linkedVodId: existing?.linkedVodId ?? null,
    lastUpdated: nowMs
  };

  await putLiveSession(nextRecord);
  return nextRecord;
};
