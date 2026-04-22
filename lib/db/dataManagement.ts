import { DB_VERSION, openDatabase, type LiveSessionRecord, type VodRecord } from "./schema";

import type { DataSnapshot, ImportMode } from "../messaging";
import type { Range } from "../util/ranges";

interface ParsedSnapshot {
  vods: VodRecord[];
  liveSessions: LiveSessionRecord[];
}

export interface DataSummary {
  counts: {
    vods: number;
    liveSessions: number;
  };
}

export interface ImportDataResult {
  mode: ImportMode;
  imported: {
    vods: number;
    liveSessions: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRange = (value: unknown): value is Range =>
  Array.isArray(value) &&
  value.length === 2 &&
  isFiniteNumber(value[0]) &&
  isFiniteNumber(value[1]) &&
  value[0] <= value[1];

const isRangeList = (value: unknown): value is Range[] => Array.isArray(value) && value.every(isRange);

const isVodRecord = (value: unknown): value is VodRecord => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.vodId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.channelLogin === "string" &&
    (value.durationSeconds === null || isFiniteNumber(value.durationSeconds)) &&
    (value.createdAt === null || isFiniteNumber(value.createdAt)) &&
    isRangeList(value.ranges) &&
    isFiniteNumber(value.totalWatchedSeconds) &&
    typeof value.markedWatched === "boolean" &&
    isFiniteNumber(value.lastUpdated)
  );
};

const isLiveSessionRecord = (value: unknown): value is LiveSessionRecord => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sessionId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.channelLogin === "string" &&
    isFiniteNumber(value.streamStartedAt) &&
    isRangeList(value.ranges) &&
    (value.linkedVodId === null || typeof value.linkedVodId === "string") &&
    isFiniteNumber(value.lastUpdated)
  );
};

const parseSnapshot = (payload: unknown): ParsedSnapshot => {
  if (!isRecord(payload)) {
    throw new Error("Invalid import payload.");
  }

  const allowedTopLevelKeys = new Set(["exportedAt", "schemaVersion", "vods", "liveSessions"]);
  for (const key of Object.keys(payload)) {
    if (!allowedTopLevelKeys.has(key)) {
      throw new Error(`Import payload has unknown field: ${key}.`);
    }
  }

  const vods = payload.vods;
  const liveSessions = payload.liveSessions;

  if (!Array.isArray(vods) || !vods.every(isVodRecord)) {
    throw new Error("Import payload has invalid vods.");
  }
  if (!Array.isArray(liveSessions) || !liveSessions.every(isLiveSessionRecord)) {
    throw new Error("Import payload has invalid liveSessions.");
  }

  return {
    vods,
    liveSessions
  };
};

export async function getDataSummary(): Promise<DataSummary> {
  const db = await openDatabase();

  return {
    counts: {
      vods: await db.count("vods"),
      liveSessions: await db.count("liveSessions")
    }
  };
}

export async function exportDataSnapshot(): Promise<DataSnapshot> {
  const db = await openDatabase();
  const [vods, liveSessions] = await Promise.all([
    db.getAll("vods"),
    db.getAll("liveSessions")
  ]);

  return {
    exportedAt: Date.now(),
    schemaVersion: DB_VERSION,
    vods,
    liveSessions
  };
}

export async function clearAllData(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(["vods", "liveSessions"], "readwrite");
  await tx.objectStore("vods").clear();
  await tx.objectStore("liveSessions").clear();
  await tx.done;
}

export async function importDataSnapshot(mode: ImportMode, payload: unknown): Promise<ImportDataResult> {
  const parsed = parseSnapshot(payload);
  const db = await openDatabase();
  const tx = db.transaction(["vods", "liveSessions"], "readwrite");

  if (mode === "replace") {
    await tx.objectStore("vods").clear();
    await tx.objectStore("liveSessions").clear();
  }

  const vodStore = tx.objectStore("vods");
  for (const record of parsed.vods) {
    await vodStore.put(record);
  }

  const liveStore = tx.objectStore("liveSessions");
  for (const record of parsed.liveSessions) {
    await liveStore.put(record);
  }

  await tx.done;

  return {
    mode,
    imported: {
      vods: parsed.vods.length,
      liveSessions: parsed.liveSessions.length
    }
  };
}
