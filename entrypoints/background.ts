import browser from "webextension-polyfill";
import type { Msg } from "../lib/messaging";
import { installMainWorldMetadataBridge } from "./content/injected/mainWorld";

interface SelectorMissEvent {
  id: string;
  url: string;
  timestamp: number;
}

const MAX_SELECTOR_MISSES = 100;
const selectorMissBuffer: SelectorMissEvent[] = [];

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

    return undefined;
  });
});
