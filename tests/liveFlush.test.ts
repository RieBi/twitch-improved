import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { applyLiveFlush } from "../lib/liveFlush";
import { closeDatabase, DB_NAME, openDatabase, type LiveSessionRecord } from "../lib/db/schema";
import { getLiveSession, putLiveSession } from "../lib/db/repo";

afterEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

describe("applyLiveFlush", () => {
  it("creates a live session on first flush", async () => {
    await openDatabase();

    const record = await applyLiveFlush(
      {
        type: "flushRanges",
        kind: "live",
        sessionId: "c-1:5000",
        meta: {
          channelId: "c-1",
          channelLogin: "streamer",
          streamStartedAt: 5_000
        },
        ranges: [
          [0, 30]
        ]
      },
      10_000
    );

    expect(record).toEqual({
      sessionId: "c-1:5000",
      channelId: "c-1",
      channelLogin: "streamer",
      streamStartedAt: 5_000,
      ranges: [
        [0, 30]
      ],
      linkedVodId: null,
      lastUpdated: 10_000
    });
  });

  it("merges subsequent flushes and preserves linkedVodId", async () => {
    await openDatabase();

    const existing: LiveSessionRecord = {
      sessionId: "c-1:9000",
      channelId: "c-1",
      channelLogin: "streamer",
      streamStartedAt: 9_000,
      ranges: [
        [0, 10]
      ],
      linkedVodId: "vod-99",
      lastUpdated: 1_000
    };
    await putLiveSession(existing);

    const record = await applyLiveFlush(
      {
        type: "flushRanges",
        kind: "live",
        sessionId: "c-1:9000",
        meta: {
          channelId: "c-1",
          channelLogin: "streamer",
          streamStartedAt: 9_000
        },
        ranges: [
          [100, 120]
        ]
      },
      2_000
    );

    expect(record.linkedVodId).toBe("vod-99");
    expect(record.lastUpdated).toBe(2_000);
    expect(record.ranges).toEqual([
      [0, 10],
      [100, 120]
    ]);

    const roundTrip = await getLiveSession("c-1:9000");
    expect(roundTrip?.ranges).toEqual(record.ranges);
  });
});
