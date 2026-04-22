import browser from "webextension-polyfill";

import type { LiveSessionRecord, VodRecord } from "./db/schema";
import type { Range } from "./util/ranges";

export interface VodMeta {
  channelId: string;
  channelLogin: string;
  durationSeconds: number | null;
  createdAt: number | null;
}

export interface LiveMeta {
  channelId: string;
  channelLogin: string;
  streamStartedAt: number;
}

export type MetadataSource = "apollo" | "fetch";

export interface BridgeStreamMeta extends LiveMeta {
  streamId: string;
  source: MetadataSource;
  observedAt: number;
}

export interface BridgeVodMeta extends VodMeta {
  vodId: string;
  source: MetadataSource;
  observedAt: number;
}

export interface BridgeVodTileMeta {
  source: MetadataSource;
  observedAt: number;
  vods: BridgeVodMeta[];
}

export interface DataSnapshot {
  exportedAt: number;
  schemaVersion: number;
  vods: VodRecord[];
  liveSessions: LiveSessionRecord[];
}

export type ImportMode = "merge" | "replace";

export interface SelectorMissEvent {
  id: string;
  url: string;
  timestamp: number;
}

export type Msg =
  | { type: "flushRanges"; kind: "vod"; vodId: string; meta: VodMeta; ranges: Range[] }
  | { type: "flushRanges"; kind: "live"; sessionId: string; meta: LiveMeta; ranges: Range[] }
  | { type: "getVodRecords"; ids: string[] }
  | { type: "toggleMarkedWatched"; vodId: string }
  | { type: "reportSelectorMiss"; id: string; url: string }
  | { type: "getDataSummary" }
  | { type: "exportData" }
  | { type: "importData"; mode: ImportMode; payload: unknown }
  | { type: "clearAllData" }
  | { type: "getDiagnostics" }
  | { type: "ensureMetadataBridge" }
  | { type: "settingsChanged" }
  | { type: "vodRecordChanged"; vodId: string; record: VodRecord };

export interface GetVodRecordsResponse {
  records: Record<string, VodRecord | null>;
}

export interface GetDataSummaryResponse {
  counts: {
    vods: number;
    liveSessions: number;
  };
}

export interface ExportDataResponse {
  snapshot: DataSnapshot;
}

export interface ImportDataResponse {
  ok: boolean;
  mode: ImportMode;
  imported: {
    vods: number;
    liveSessions: number;
  };
}

export interface ClearAllDataResponse {
  ok: boolean;
}

export interface GetDiagnosticsResponse {
  selectorMisses: SelectorMissEvent[];
  buffered: number;
}

export async function sendMsg<T>(msg: Msg): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}
