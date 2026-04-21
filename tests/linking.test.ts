import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { applyLiveFlush } from "../lib/liveFlush";
import { applyVodFlush } from "../lib/vodFlush";
import { closeDatabase, DB_NAME, openDatabase, type LiveSessionRecord, type VodRecord } from "../lib/db/schema";
import {
  commitVodLinkingTransaction,
  getLiveSession,
  getVod,
  putLiveSession,
  putVod
} from "../lib/db/repo";
import {
  LINK_TOLERANCE_MS,
  linkEligibleLiveSessionsToVod,
  runUnlinkedLiveSessionSweep
} from "../lib/liveVodLinking";

afterEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

describe("linkEligibleLiveSessionsToVod", () => {
  it("merges live ranges into VOD with offset and clamp", async () => {
    await openDatabase();

    const vodCreatedAt = 1_000_000;
    const streamStartedAt = vodCreatedAt + 30_000;
    const live: LiveSessionRecord = {
      sessionId: "ch-1:" + streamStartedAt,
      channelId: "ch-1",
      channelLogin: "a",
      streamStartedAt,
      ranges: [
        [0, 100]
      ],
      linkedVodId: null,
      lastUpdated: 1
    };
    await putLiveSession(live);

    const vod: VodRecord = {
      vodId: "v-1",
      channelId: "ch-1",
      channelLogin: "a",
      durationSeconds: 500,
      createdAt: vodCreatedAt,
      ranges: [
        [0, 10]
      ],
      totalWatchedSeconds: 10,
      markedWatched: false,
      lastUpdated: 2
    };

    const linked = await linkEligibleLiveSessionsToVod(vod, 99_000);
    expect(linked.ranges).toEqual([
      [0, 10],
      [30, 130]
    ]);
    expect(linked.totalWatchedSeconds).toBe(110);

    const session = await getLiveSession(live.sessionId);
    expect(session?.linkedVodId).toBe("v-1");
  });

  it("does not link sessions outside the 10 minute tolerance", async () => {
    await openDatabase();

    const vodCreatedAt = 1_000_000;
    const streamStartedAt = vodCreatedAt + LINK_TOLERANCE_MS;
    const live: LiveSessionRecord = {
      sessionId: "ch-2:" + streamStartedAt,
      channelId: "ch-2",
      channelLogin: "b",
      streamStartedAt,
      ranges: [
        [0, 50]
      ],
      linkedVodId: null,
      lastUpdated: 1
    };
    await putLiveSession(live);

    const vod: VodRecord = {
      vodId: "v-2",
      channelId: "ch-2",
      channelLogin: "b",
      durationSeconds: 10_000,
      createdAt: vodCreatedAt,
      ranges: [],
      totalWatchedSeconds: 0,
      markedWatched: false,
      lastUpdated: 2
    };

    const linked = await linkEligibleLiveSessionsToVod(vod, 3);
    expect(linked.ranges).toEqual([]);
    expect((await getLiveSession(live.sessionId))?.linkedVodId).toBeNull();
  });

  it("returns VOD unchanged when createdAt is null", async () => {
    await openDatabase();

    const vod: VodRecord = {
      vodId: "v-null",
      channelId: "ch-3",
      channelLogin: "c",
      durationSeconds: 100,
      createdAt: null,
      ranges: [
        [5, 15]
      ],
      totalWatchedSeconds: 10,
      markedWatched: false,
      lastUpdated: 1
    };

    const linked = await linkEligibleLiveSessionsToVod(vod, 2);
    expect(linked).toEqual(vod);
  });

  it("after VOD flush + link, a later live flush extends ranges without clearing linkedVodId", async () => {
    await openDatabase();

    const createdAt = 50_000;
    const streamStartedAt = createdAt;

    await putLiveSession({
      sessionId: "ch-4:" + streamStartedAt,
      channelId: "ch-4",
      channelLogin: "d",
      streamStartedAt,
      ranges: [
        [0, 40]
      ],
      linkedVodId: null,
      lastUpdated: 1
    });

    const afterFlush = await applyVodFlush(
      {
        type: "flushRanges",
        kind: "vod",
        vodId: "v-4",
        meta: {
          channelId: "ch-4",
          channelLogin: "d",
          durationSeconds: 200,
          createdAt
        },
        ranges: [
          [0, 20]
        ]
      },
      100
    );

    const afterLink = await linkEligibleLiveSessionsToVod(afterFlush, 200);
    expect(afterLink.ranges).toEqual([
      [0, 40]
    ]);

    await applyLiveFlush(
      {
        type: "flushRanges",
        kind: "live",
        sessionId: "ch-4:" + streamStartedAt,
        meta: {
          channelId: "ch-4",
          channelLogin: "d",
          streamStartedAt
        },
        ranges: [
          [50, 80]
        ]
      },
      300
    );

    const vod = await getVod("v-4");
    const live = await getLiveSession("ch-4:" + streamStartedAt);

    expect(live?.linkedVodId).toBe("v-4");
    expect(vod?.ranges).toEqual([
      [0, 40]
    ]);
    expect(live?.ranges).toEqual([
      [0, 40],
      [50, 80]
    ]);
  });
});

describe("runUnlinkedLiveSessionSweep", () => {
  it("links stale unlinked sessions to the closest matching VOD", async () => {
    await openDatabase();

    const nowMs = 10_000_000;
    const streamStartedAt = nowMs - 3_600_000;
    const createdAt = streamStartedAt + 5_000;

    const live: LiveSessionRecord = {
      sessionId: "ch-5:" + streamStartedAt,
      channelId: "ch-5",
      channelLogin: "e",
      streamStartedAt,
      ranges: [
        [10, 40]
      ],
      linkedVodId: null,
      lastUpdated: nowMs - 31 * 60 * 1_000
    };
    await putLiveSession(live);

    const farther: VodRecord = {
      vodId: "v-far",
      channelId: "ch-5",
      channelLogin: "e",
      durationSeconds: 500,
      createdAt: createdAt + 120_000,
      ranges: [],
      totalWatchedSeconds: 0,
      markedWatched: false,
      lastUpdated: 1
    };

    const closer: VodRecord = {
      vodId: "v-close",
      channelId: "ch-5",
      channelLogin: "e",
      durationSeconds: 500,
      createdAt,
      ranges: [],
      totalWatchedSeconds: 0,
      markedWatched: false,
      lastUpdated: 2
    };

    await putVod(farther);
    await putVod(closer);

    const updated = await runUnlinkedLiveSessionSweep(nowMs);
    expect(updated.map((v) => v.vodId)).toEqual(["v-close"]);

    const winner = await getVod("v-close");
    // streamStartedAt is 5s before vod.createdAt → live [10,40] shifts by −5s → [5, 35]
    expect(winner?.ranges).toEqual([
      [5, 35]
    ]);
    expect((await getLiveSession(live.sessionId))?.linkedVodId).toBe("v-close");
  });

  it("skips sessions that are not yet stale", async () => {
    await openDatabase();

    const nowMs = 8_000_000;
    const streamStartedAt = nowMs - 60_000;

    await putLiveSession({
      sessionId: "ch-6:" + streamStartedAt,
      channelId: "ch-6",
      channelLogin: "f",
      streamStartedAt,
      ranges: [
        [0, 10]
      ],
      linkedVodId: null,
      lastUpdated: nowMs - 5 * 60 * 1_000
    });

    await putVod({
      vodId: "v-6",
      channelId: "ch-6",
      channelLogin: "f",
      durationSeconds: 100,
      createdAt: streamStartedAt,
      ranges: [],
      totalWatchedSeconds: 0,
      markedWatched: false,
      lastUpdated: 1
    });

    await runUnlinkedLiveSessionSweep(nowMs);
    expect((await getLiveSession("ch-6:" + streamStartedAt))?.linkedVodId).toBeNull();
  });
});

describe("commitVodLinkingTransaction", () => {
  it("writes VOD and live sessions in one transaction", async () => {
    await openDatabase();

    const vod: VodRecord = {
      vodId: "v-tx",
      channelId: "c",
      channelLogin: "g",
      durationSeconds: 100,
      createdAt: 1,
      ranges: [
        [0, 99]
      ],
      totalWatchedSeconds: 99,
      markedWatched: false,
      lastUpdated: 5
    };

    const live: LiveSessionRecord = {
      sessionId: "c:1",
      channelId: "c",
      channelLogin: "g",
      streamStartedAt: 1,
      ranges: [],
      linkedVodId: "v-tx",
      lastUpdated: 5
    };

    await commitVodLinkingTransaction(vod, [live]);
    expect(await getVod("v-tx")).toEqual(vod);
    expect(await getLiveSession("c:1")).toEqual(live);
  });
});
