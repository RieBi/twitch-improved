import { initDeclutter } from "./declutter";

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_start",
  async main() {
    const declutter = await initDeclutter();

    const notifyRouteChange = (): void => {
      declutter.refresh();
    };

    const patchHistoryMethod = (method: "pushState" | "replaceState"): void => {
      const original = history[method];
      history[method] = function patchedHistory(
        this: History,
        ...args: Parameters<typeof history[typeof method]>
      ): ReturnType<typeof history[typeof method]> {
        const result = original.apply(this, args);
        notifyRouteChange();
        return result;
      };
    };

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");
    window.addEventListener("popstate", notifyRouteChange);
  }
});
