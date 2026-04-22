import browser from "webextension-polyfill";
import type { Msg } from "../lib/messaging";
import { getVodsByIds } from "../lib/db/repo";
import { linkEligibleLiveSessionsToVod, runUnlinkedLiveSessionSweep } from "../lib/liveVodLinking";
import { applyLiveFlush } from "../lib/liveFlush";
import { toggleMarkedWatched } from "../lib/toggleMarkedWatched";
import { applyVodFlush } from "../lib/vodFlush";
import { installMainWorldMetadataBridge } from "./content/injected/mainWorld";

interface SelectorMissEvent {
  id: string;
  url: string;
  timestamp: number;
}

const MAX_SELECTOR_MISSES = 100;
const selectorMissBuffer: SelectorMissEvent[] = [];
const SHOULD_LOG_FLUSH_DEBUG = import.meta.env.DEV;

const LINK_SWEEP_ALARM = "td-live-vod-link-sweep";

const pushSelectorMiss = (entry: SelectorMissEvent): void => {
  selectorMissBuffer.push(entry);
  if (selectorMissBuffer.length > MAX_SELECTOR_MISSES) {
    selectorMissBuffer.shift();
  }
};

const executeMainWorldBridge = async (tabId: number, frameId: number): Promise<void> => {
  try {
    await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: installMainWorldMetadataBridge
    });
    return;
  } catch {
    // Firefox support for execution worlds differs; fallback without world.
  }

  await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: installMainWorldMetadataBridge
  });
};

const broadcastVodRecordChanged = async (
  payload: Extract<Msg, { type: "vodRecordChanged" }>
): Promise<void> => {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) {
        return;
      }

      await browser.tabs.sendMessage(tab.id, payload).catch(() => undefined);
    })
  );
};

const ensureLinkSweepAlarm = async (): Promise<void> => {
  const existing = await browser.alarms.get(LINK_SWEEP_ALARM);
  if (existing) {
    return;
  }

  await browser.alarms.create(LINK_SWEEP_ALARM, { periodInMinutes: 60 });
};

export default defineBackground(() => {
  void ensureLinkSweepAlarm();

  browser.runtime.onInstalled.addListener(() => {
    console.info("Twitch Improved background ready.");
    void ensureLinkSweepAlarm();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== LINK_SWEEP_ALARM) {
      return;
    }

    void runUnlinkedLiveSessionSweep()
      .then(async (records) => {
        for (const record of records) {
          await broadcastVodRecordChanged({
            type: "vodRecordChanged",
            vodId: record.vodId,
            record
          });
        }
      })
      .catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (typeof message !== "object" || message === null || !("type" in message)) {
      return undefined;
    }

    const typedMessage = message as Msg;

    if (typedMessage.type === "settingsChanged") {
      return Promise.resolve({ ok: true });
    }

    if (typedMessage.type === "ensureMetadataBridge") {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        return Promise.resolve({ ok: false });
      }

      const frameId = sender.frameId ?? 0;
      return executeMainWorldBridge(tabId, frameId)
        .then(() => ({ ok: true }))
        .catch(() => ({ ok: false }));
    }

    if (typedMessage.type === "reportSelectorMiss") {
      pushSelectorMiss({
        id: typedMessage.id,
        url: typedMessage.url,
        timestamp: Date.now()
      });

      return Promise.resolve({
        ok: true,
        buffered: selectorMissBuffer.length
      });
    }

    if (typedMessage.type === "flushRanges") {
      if (typedMessage.kind === "live") {
        if (SHOULD_LOG_FLUSH_DEBUG) {
          console.info("[td][background][flush] received live", {
            sessionId: typedMessage.sessionId,
            rangeCount: typedMessage.ranges.length
          });
        }

        return applyLiveFlush(typedMessage)
          .then((record) => {
            if (SHOULD_LOG_FLUSH_DEBUG) {
              console.info("[td][background][flush] persisted live", {
                sessionId: typedMessage.sessionId,
                rangeCount: record.ranges.length
              });
            }

            return { ok: true as const };
          })
          .catch((error: unknown) => {
            if (SHOULD_LOG_FLUSH_DEBUG) {
              console.error("[td][background][flush] live failed", {
                sessionId: typedMessage.sessionId,
                error
              });
            }

            return { ok: false as const };
          });
      }

      if (typedMessage.kind !== "vod") {
        if (SHOULD_LOG_FLUSH_DEBUG) {
          console.warn("[td][background][flush] unsupported-kind", {
            kind: typedMessage.kind
          });
        }
        return Promise.resolve({ ok: false });
      }

      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][background][flush] received", {
          vodId: typedMessage.vodId,
          rangeCount: typedMessage.ranges.length
        });
      }

      return applyVodFlush(typedMessage)
        .then(async (record) => {
          if (SHOULD_LOG_FLUSH_DEBUG) {
            console.info("[td][background][flush] persisted", {
              vodId: typedMessage.vodId,
              rangeCount: record.ranges.length,
              totalWatchedSeconds: record.totalWatchedSeconds
            });
          }

          const linked = await linkEligibleLiveSessionsToVod(record);

          const payload: Extract<Msg, { type: "vodRecordChanged" }> = {
            type: "vodRecordChanged",
            vodId: typedMessage.vodId,
            record: linked
          };
          await broadcastVodRecordChanged(payload);
          return { ok: true };
        })
        .catch((error: unknown) => {
          if (SHOULD_LOG_FLUSH_DEBUG) {
            console.error("[td][background][flush] failed", {
              vodId: typedMessage.vodId,
              error
            });
          }
          return { ok: false };
        });
    }

    if (typedMessage.type === "toggleMarkedWatched") {
      const vodId = typedMessage.vodId;
      if (typeof vodId !== "string" || vodId.length === 0) {
        return Promise.resolve({ ok: false as const });
      }

      return toggleMarkedWatched(vodId)
        .then(async (record) => {
          await broadcastVodRecordChanged({
            type: "vodRecordChanged",
            vodId,
            record
          });
          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const }));
    }

    if (typedMessage.type === "getVodRecords") {
      const uniqueIds = Array.from(
        new Set(typedMessage.ids.filter((id) => typeof id === "string" && id.length > 0))
      );
      if (SHOULD_LOG_FLUSH_DEBUG) {
        console.info("[td][background][heatmap] getVodRecords:request", {
          requestedCount: typedMessage.ids.length,
          uniqueCount: uniqueIds.length
        });
      }

      return getVodsByIds(uniqueIds)
        .then((records) => {
          if (SHOULD_LOG_FLUSH_DEBUG) {
            const foundCount = Object.values(records).filter((record) => record !== null).length;
            console.info("[td][background][heatmap] getVodRecords:response", {
              uniqueCount: uniqueIds.length,
              foundCount
            });
          }

          return { records };
        })
        .catch((error: unknown) => {
          if (SHOULD_LOG_FLUSH_DEBUG) {
            console.error("[td][background][heatmap] getVodRecords:failed", {
              uniqueCount: uniqueIds.length,
              error
            });
          }

          return { records: {} };
        });
    }

    return undefined;
  });
});
