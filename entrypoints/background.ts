import browser from "webextension-polyfill";
import type { Msg } from "../lib/messaging";
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

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info("Twitch Improved background ready.");
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
      if (typedMessage.kind !== "vod") {
        if (SHOULD_LOG_FLUSH_DEBUG) {
          console.warn("[td][background][flush] unsupported-kind", {
            kind: typedMessage.kind
          });
        }
        return Promise.resolve({ ok: false, reason: "live-not-implemented" });
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

          const payload: Extract<Msg, { type: "vodRecordChanged" }> = {
            type: "vodRecordChanged",
            vodId: typedMessage.vodId,
            record
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

    return undefined;
  });
});
