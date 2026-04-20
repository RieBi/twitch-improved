import browser from "webextension-polyfill";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info("Twitch Improved background ready.");
  });
});
