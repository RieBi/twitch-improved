import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { Range } from "../util/ranges";

export const DB_NAME = "twitch-decluttered";
export const DB_VERSION = 2;

export interface VodRecord {
  vodId: string;
  channelId: string;
  channelLogin: string;
  durationSeconds: number | null;
  createdAt: number | null;
  ranges: Range[];
  totalWatchedSeconds: number;
  markedWatched: boolean;
  lastUpdated: number;
}

export interface LiveSessionRecord {
  sessionId: string;
  channelId: string;
  channelLogin: string;
  streamStartedAt: number;
  ranges: Range[];
  linkedVodId: string | null;
  lastUpdated: number;
}

export interface TwitchImprovedDb extends DBSchema {
  vods: {
    key: string;
    value: VodRecord;
    indexes: {
      by_channel: string;
      by_lastUpdated: number;
    };
  };
  liveSessions: {
    key: string;
    value: LiveSessionRecord;
    indexes: {
      by_channel_startedAt: [string, number];
      by_linked: string | null;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<TwitchImprovedDb>> | null = null;

const createStoresV1 = (db: IDBPDatabase<TwitchImprovedDb>): void => {
  const vods = db.createObjectStore("vods", { keyPath: "vodId" });
  vods.createIndex("by_channel", "channelId");
  vods.createIndex("by_lastUpdated", "lastUpdated");

  const liveSessions = db.createObjectStore("liveSessions", { keyPath: "sessionId" });
  liveSessions.createIndex("by_channel_startedAt", ["channelId", "streamStartedAt"]);
  liveSessions.createIndex("by_linked", "linkedVodId");

};

export async function openDatabase(): Promise<IDBPDatabase<TwitchImprovedDb>> {
  if (!dbPromise) {
    dbPromise = openDB<TwitchImprovedDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          createStoresV1(db);
        }
        if (oldVersion < 2 && db.objectStoreNames.contains("channels")) {
          db.deleteObjectStore("channels");
        }
      }
    });
  }

  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  if (!dbPromise) {
    return;
  }

  const db = await dbPromise;
  db.close();
  dbPromise = null;
}
