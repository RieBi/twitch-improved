import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { runGarbageCollection } from "../lib/db/gc";
import {
  DB_NAME,
  DB_VERSION,
  closeDatabase,
  openDatabase,
  type ChannelRecord,
  type LiveSessionRecord,
  type VodRecord
} from "../lib/db/schema";
import {
  getChannel,
  getLiveSession,
  getLiveSessionsByChannelSince,
  getUnlinkedLiveSessions,
  getVod,
  getVodsByChannel,
  putChannel,
  putLiveSession,
  putVod
} from "../lib/db/repo";

const now = Date.now();

const buildVod = (overrides: Partial<VodRecord> = {}): VodRecord => ({
  vodId: "vod-1",
  channelId: "c-1",
  channelLogin: "channel_one",
  durationSeconds: 3600,
  createdAt: now - 10_000,
  ranges: [
    [0, 60]
  ],
  totalWatchedSeconds: 60,
  markedWatched: false,
  lastUpdated: now,
  ...overrides
});

const buildLive = (overrides: Partial<LiveSessionRecord> = {}): LiveSessionRecord => ({
  sessionId: "c-1:1000",
  channelId: "c-1",
  channelLogin: "channel_one",
  streamStartedAt: 1_000,
  ranges: [
    [5, 20]
  ],
  linkedVodId: null,
  lastUpdated: now,
  ...overrides
});

const buildChannel = (overrides: Partial<ChannelRecord> = {}): ChannelRecord => ({
  channelId: "c-1",
  login: "channel_one",
  displayName: "Channel One",
  lastSeen: now,
  ...overrides
});

afterEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

describe("db schema contract", () => {
  it("opens the twitch database with expected stores and indexes", async () => {
    const db = await openDatabase();

    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(["channels", "liveSessions", "vods"]);

    const tx = db.transaction("vods", "readonly");
    expect(Array.from(tx.store.indexNames).sort()).toEqual(["by_channel", "by_lastUpdated"]);
    await tx.done;

    const liveTx = db.transaction("liveSessions", "readonly");
    expect(Array.from(liveTx.store.indexNames).sort()).toEqual(["by_channel_startedAt", "by_linked"]);
    await liveTx.done;

    db.close();
  });
});

describe("db garbage collection", () => {
  it("deletes only records that cross GC age thresholds", async () => {
    const dayMs = 24 * 60 * 60 * 1_000;
    const nowMs = 2_000_000_000_000;

    await putVod(
      buildVod({
        vodId: "vod-old-unwatched",
        markedWatched: false,
        lastUpdated: nowMs - 61 * dayMs
      })
    );
    await putVod(
      buildVod({
        vodId: "vod-old-watched",
        markedWatched: true,
        lastUpdated: nowMs - 61 * dayMs
      })
    );
    await putVod(
      buildVod({
        vodId: "vod-exact-boundary",
        markedWatched: false,
        lastUpdated: nowMs - 60 * dayMs
      })
    );
    await putVod(
      buildVod({
        vodId: "vod-fresh",
        markedWatched: false,
        lastUpdated: nowMs - 5 * dayMs
      })
    );

    await putLiveSession(
      buildLive({
        sessionId: "c-1:old-linked",
        linkedVodId: "vod-1",
        lastUpdated: nowMs - 61 * dayMs
      })
    );
    await putLiveSession(
      buildLive({
        sessionId: "c-1:boundary-linked",
        linkedVodId: "vod-1",
        lastUpdated: nowMs - 60 * dayMs
      })
    );
    await putLiveSession(
      buildLive({
        sessionId: "c-1:old-unlinked",
        linkedVodId: null,
        lastUpdated: nowMs - 15 * dayMs
      })
    );
    await putLiveSession(
      buildLive({
        sessionId: "c-1:boundary-unlinked",
        linkedVodId: null,
        lastUpdated: nowMs - 14 * dayMs
      })
    );

    const result = await runGarbageCollection({ nowMs });

    expect(result).toEqual({
      deletedVods: 1,
      deletedLinkedLiveSessions: 1,
      deletedUnlinkedLiveSessions: 1
    });

    const db = await openDatabase();
    expect(await db.getAllKeys("vods")).toEqual([
      "vod-exact-boundary",
      "vod-fresh",
      "vod-old-watched"
    ]);
    expect(await db.getAllKeys("liveSessions")).toEqual([
      "c-1:boundary-linked",
      "c-1:boundary-unlinked"
    ]);
    db.close();
  });
});

describe("db repository contract", () => {
  it("writes and reads vod records by key and channel index", async () => {
    const first = buildVod({ vodId: "vod-1", channelId: "c-1" });
    const second = buildVod({ vodId: "vod-2", channelId: "c-1" });
    const third = buildVod({ vodId: "vod-3", channelId: "c-2" });

    await putVod(first);
    await putVod(second);
    await putVod(third);

    expect(await getVod("vod-1")).toEqual(first);
    expect(await getVod("missing")).toBeUndefined();
    expect(await getVodsByChannel("c-1")).toEqual([first, second]);
  });

  it("updates existing vod on key collision", async () => {
    await putVod(buildVod({ vodId: "vod-1", totalWatchedSeconds: 60, markedWatched: false }));
    await putVod(buildVod({ vodId: "vod-1", totalWatchedSeconds: 240, markedWatched: true }));

    expect(await getVod("vod-1")).toEqual(
      expect.objectContaining({
        vodId: "vod-1",
        totalWatchedSeconds: 240,
        markedWatched: true
      })
    );
  });

  it("writes and reads channels by key", async () => {
    const channel = buildChannel();
    await putChannel(channel);

    expect(await getChannel(channel.channelId)).toEqual(channel);
  });

  it("writes and reads live sessions by key and indexes", async () => {
    const liveA = buildLive({
      sessionId: "c-1:1000",
      channelId: "c-1",
      streamStartedAt: 1_000,
      linkedVodId: null
    });
    const liveB = buildLive({
      sessionId: "c-1:2000",
      channelId: "c-1",
      streamStartedAt: 2_000,
      linkedVodId: "vod-1"
    });
    const liveC = buildLive({
      sessionId: "c-2:3000",
      channelId: "c-2",
      streamStartedAt: 3_000,
      linkedVodId: null
    });

    await putLiveSession(liveA);
    await putLiveSession(liveB);
    await putLiveSession(liveC);

    expect(await getLiveSession("c-1:1000")).toEqual(liveA);
    expect(await getLiveSessionsByChannelSince("c-1", 1_500)).toEqual([liveB]);
    expect(await getUnlinkedLiveSessions()).toEqual([liveA, liveC]);
  });
});
