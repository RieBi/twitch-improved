import browser from "webextension-polyfill";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info("Twitch Improved background ready.");
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "settingsChanged") {
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });
});
