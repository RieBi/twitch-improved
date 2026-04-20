import { openDatabase, type ChannelRecord, type LiveSessionRecord, type VodRecord } from "./schema";

const withDb = openDatabase;

export async function putVod(record: VodRecord): Promise<void> {
  const db = await withDb();
  await db.put("vods", record);
}

export async function getVod(vodId: string): Promise<VodRecord | undefined> {
  const db = await withDb();
  return db.get("vods", vodId);
}

export async function getVodsByChannel(channelId: string): Promise<VodRecord[]> {
  const db = await withDb();
  return db.getAllFromIndex("vods", "by_channel", channelId);
}

export async function putLiveSession(record: LiveSessionRecord): Promise<void> {
  const db = await withDb();
  await db.put("liveSessions", record);
}

export async function getLiveSession(sessionId: string): Promise<LiveSessionRecord | undefined> {
  const db = await withDb();
  return db.get("liveSessions", sessionId);
}

export async function getLiveSessionsByChannelSince(
  channelId: string,
  streamStartedAtMin: number
): Promise<LiveSessionRecord[]> {
  const db = await withDb();
  const range = IDBKeyRange.bound([channelId, streamStartedAtMin], [channelId, Number.MAX_SAFE_INTEGER]);
  return db.getAllFromIndex("liveSessions", "by_channel_startedAt", range);
}

export async function getUnlinkedLiveSessions(): Promise<LiveSessionRecord[]> {
  const db = await withDb();
  const all = await db.getAll("liveSessions");
  return all.filter((record) => record.linkedVodId === null);
}

export async function putChannel(record: ChannelRecord): Promise<void> {
  const db = await withDb();
  await db.put("channels", record);
}

export async function getChannel(channelId: string): Promise<ChannelRecord | undefined> {
  const db = await withDb();
  return db.get("channels", channelId);
}
