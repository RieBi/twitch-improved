import browser from "webextension-polyfill";

import type { VodRecord } from "./db/schema";
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

export type Msg =
  | { type: "flushRanges"; kind: "vod"; vodId: string; meta: VodMeta; ranges: Range[] }
  | { type: "flushRanges"; kind: "live"; sessionId: string; meta: LiveMeta; ranges: Range[] }
  | { type: "getVodRecords"; ids: string[] }
  | { type: "toggleMarkedWatched"; vodId: string }
  | { type: "reportSelectorMiss"; id: string; url: string }
  | { type: "settingsChanged" }
  | { type: "vodRecordChanged"; vodId: string; record: VodRecord };

export async function sendMsg<T>(msg: Msg): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}
