import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { applyVodFlush } from "../lib/vodFlush";
import { closeDatabase, DB_NAME, type VodRecord } from "../lib/db/schema";
import { getVod, putVod } from "../lib/db/repo";

const buildVod = (overrides: Partial<VodRecord> = {}): VodRecord => ({
  vodId: "vod-1",
  channelId: "c-1",
  channelLogin: "channel_one",
  durationSeconds: 3000,
  createdAt: 1000,
  ranges: [[0, 10]],
  totalWatchedSeconds: 10,
  markedWatched: false,
  lastUpdated: 5_000,
  ...overrides
});

afterEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

describe("applyVodFlush", () => {
  it("creates a new vod record when missing", async () => {
    const result = await applyVodFlush(
      {
        type: "flushRanges",
        kind: "vod",
        vodId: "vod-new",
        meta: {
          channelId: "c-10",
          channelLogin: "channel_ten",
          durationSeconds: 1000,
          createdAt: 123
        },
        ranges: [[10, 15]]
      },
      99_000
    );

    expect(result).toEqual(
      expect.objectContaining({
        vodId: "vod-new",
        channelId: "c-10",
        channelLogin: "channel_ten",
        durationSeconds: 1000,
        createdAt: 123,
        ranges: [[10, 15]],
        totalWatchedSeconds: 5,
        lastUpdated: 99_000
      })
    );
  });

  it("merges ranges into existing record and preserves existing metadata precedence", async () => {
    await putVod(buildVod({ ranges: [[0, 10]], totalWatchedSeconds: 10, markedWatched: true }));

    const result = await applyVodFlush(
      {
        type: "flushRanges",
        kind: "vod",
        vodId: "vod-1",
        meta: {
          channelId: "c-override",
          channelLogin: "override",
          durationSeconds: null,
          createdAt: null
        },
        ranges: [[8, 20]]
      },
      77_000
    );

    expect(result).toEqual(
      expect.objectContaining({
        vodId: "vod-1",
        channelId: "c-1",
        channelLogin: "channel_one",
        durationSeconds: 3000,
        createdAt: 1000,
        ranges: [[0, 20]],
        totalWatchedSeconds: 20,
        markedWatched: true,
        lastUpdated: 77_000
      })
    );

    expect(await getVod("vod-1")).toEqual(result);
  });
});

