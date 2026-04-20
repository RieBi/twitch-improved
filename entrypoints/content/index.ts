export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_idle",
  main() {
    console.info("Twitch Improved content script loaded.");
  }
});
