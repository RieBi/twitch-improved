import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, DB_NAME, openDatabase, type VodRecord } from "../lib/db/schema";
import { getVod, putVod } from "../lib/db/repo";
import { toggleMarkedWatched } from "../lib/toggleMarkedWatched";

const now = 1_700_000_000_000;

const buildVod = (overrides: Partial<VodRecord> = {}): VodRecord => ({
  vodId: "vod-toggle",
  channelId: "c-1",
  channelLogin: "ch",
  durationSeconds: 100,
  createdAt: now - 1000,
  ranges: [
    [0, 10]
  ],
  totalWatchedSeconds: 10,
  markedWatched: false,
  lastUpdated: now,
  ...overrides
});

afterEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

describe("toggleMarkedWatched", () => {
  it("flips markedWatched and updates lastUpdated for an existing vod", async () => {
    await openDatabase();
    await putVod(buildVod());

    const result = await toggleMarkedWatched("vod-toggle", now + 5000);

    expect(result.markedWatched).toBe(true);
    expect(result.lastUpdated).toBe(now + 5000);
    expect(result.channelId).toBe("c-1");
    expect(result.ranges).toEqual([
      [0, 10]
    ]);

    const again = await toggleMarkedWatched("vod-toggle", now + 8000);
    expect(again.markedWatched).toBe(false);
    expect(again.lastUpdated).toBe(now + 8000);
  });

  it("creates a stub vod with markedWatched true when none exists", async () => {
    await openDatabase();

    const result = await toggleMarkedWatched("vod-new", now + 12_000);

    expect(result).toEqual({
      vodId: "vod-new",
      channelId: "",
      channelLogin: "",
      durationSeconds: null,
      createdAt: null,
      ranges: [],
      totalWatchedSeconds: 0,
      markedWatched: true,
      lastUpdated: now + 12_000
    });

    const fromDb = await getVod("vod-new");
    expect(fromDb).toEqual(result);
  });
});
