import { initDeclutter } from "./declutter";
import { initStreamMetadata } from "./tracker/streamMetadata";
import { sendMsg } from "../../lib/messaging";

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_start",
  async main() {
    initStreamMetadata();
    await sendMsg<{ ok: boolean }>({ type: "ensureMetadataBridge" }).catch(() => undefined);

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
