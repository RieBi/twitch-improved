import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearAllData,
  exportDataSnapshot,
  getDataSummary,
  importDataSnapshot
} from "../lib/db/dataManagement";
import { closeDatabase } from "../lib/db/schema";
import { DB_NAME, type LiveSessionRecord, type VodRecord } from "../lib/db/schema";
import { getLiveSession, getVod, putLiveSession, putVod } from "../lib/db/repo";
import { createSelectorMissBuffer } from "../lib/selectorDiagnostics";

const now = Date.now();

const buildVod = (overrides: Partial<VodRecord> = {}): VodRecord => ({
  vodId: "vod-1",
  channelId: "c-1",
  channelLogin: "channel_one",
  durationSeconds: 3600,
  createdAt: now - 1_000,
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

afterEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

describe("data management", () => {
  it("exports snapshot and reports summary counts", async () => {
    await putVod(buildVod({ vodId: "vod-a" }));
    await putLiveSession(buildLive({ sessionId: "c-1:2000" }));

    const summary = await getDataSummary();
    expect(summary.counts).toEqual({
      vods: 1,
      liveSessions: 1
    });

    const snapshot = await exportDataSnapshot();
    expect(snapshot.schemaVersion).toBeGreaterThan(0);
    expect(snapshot.exportedAt).toBeTypeOf("number");
    expect(snapshot.vods).toEqual([expect.objectContaining({ vodId: "vod-a" })]);
    expect(snapshot.liveSessions).toEqual([expect.objectContaining({ sessionId: "c-1:2000" })]);
  });

  it("clears all stores", async () => {
    await putVod(buildVod({ vodId: "vod-a" }));
    await putLiveSession(buildLive({ sessionId: "c-1:2000" }));

    await clearAllData();

    const summary = await getDataSummary();
    expect(summary.counts).toEqual({
      vods: 0,
      liveSessions: 0
    });
  });

  it("imports in merge mode without clearing existing records", async () => {
    await putVod(buildVod({ vodId: "existing-vod" }));

    const result = await importDataSnapshot("merge", {
      vods: [buildVod({ vodId: "import-vod", totalWatchedSeconds: 120 })],
      liveSessions: [buildLive({ sessionId: "c-1:3000" })]
    });

    expect(result).toEqual({
      mode: "merge",
      imported: {
        vods: 1,
        liveSessions: 1
      }
    });
    expect(await getVod("existing-vod")).toEqual(expect.objectContaining({ vodId: "existing-vod" }));
    expect(await getVod("import-vod")).toEqual(expect.objectContaining({ vodId: "import-vod" }));
    expect(await getLiveSession("c-1:3000")).toEqual(expect.objectContaining({ sessionId: "c-1:3000" }));
  });

  it("imports in replace mode after clearing previous data", async () => {
    await putVod(buildVod({ vodId: "old-vod" }));
    await putLiveSession(buildLive({ sessionId: "c-1:old" }));

    await importDataSnapshot("replace", {
      vods: [buildVod({ vodId: "new-vod" })],
      liveSessions: [buildLive({ sessionId: "c-1:new" })]
    });

    expect(await getVod("old-vod")).toBeUndefined();
    expect(await getVod("new-vod")).toEqual(expect.objectContaining({ vodId: "new-vod" }));
    expect(await getLiveSession("c-1:old")).toBeUndefined();
    expect(await getLiveSession("c-1:new")).toEqual(expect.objectContaining({ sessionId: "c-1:new" }));
  });

  it("rejects invalid import payloads", async () => {
    await expect(importDataSnapshot("merge", { vods: "nope", liveSessions: [] })).rejects.toThrow(
      /invalid vods/i
    );
    await expect(
      importDataSnapshot("merge", {
        vods: [],
        liveSessions: [{ sessionId: "bad" }]
      })
    ).rejects.toThrow(/invalid livesessions/i);

    await expect(
      importDataSnapshot("merge", {
        vods: [],
        liveSessions: [],
        channels: []
      })
    ).rejects.toThrow(/unknown field: channels/i);
  });
});

describe("selector diagnostics buffer", () => {
  it("caps entries and keeps newest ordering", () => {
    const buffer = createSelectorMissBuffer(3);
    buffer.push({ id: "a", url: "u1", timestamp: 1 });
    buffer.push({ id: "b", url: "u2", timestamp: 2 });
    buffer.push({ id: "c", url: "u3", timestamp: 3 });
    buffer.push({ id: "d", url: "u4", timestamp: 4 });

    expect(buffer.size()).toBe(3);
    expect(buffer.snapshot()).toEqual([
      { id: "b", url: "u2", timestamp: 2 },
      { id: "c", url: "u3", timestamp: 3 },
      { id: "d", url: "u4", timestamp: 4 }
    ]);
  });
});
