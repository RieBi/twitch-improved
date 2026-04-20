import browser from "webextension-polyfill";

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

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info("Twitch Improved background ready.");
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "settingsChanged") {
      return Promise.resolve({ ok: true });
    }

    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "reportSelectorMiss" &&
      "id" in message &&
      typeof message.id === "string"
    ) {
      pushSelectorMiss({
        id: message.id,
        url: "url" in message && typeof message.url === "string" ? message.url : "",
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
