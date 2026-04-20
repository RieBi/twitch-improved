import { initDeclutter } from "./declutter";
import { initStreamMetadata } from "./tracker/streamMetadata";
import { startVodTracker } from "./tracker/vodTracker";
import { createVodTrackerLifecycle } from "./tracker/vodTrackerLifecycle";
import { sendMsg } from "../../lib/messaging";

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_start",
  async main() {
    initStreamMetadata();
    await sendMsg<{ ok: boolean }>({ type: "ensureMetadataBridge" }).catch(() => undefined);

    const declutter = await initDeclutter();
    const vodTrackerLifecycle = createVodTrackerLifecycle(startVodTracker);

    const notifyRouteChange = (): void => {
      declutter.refresh();
      void vodTrackerLifecycle.sync(new URL(window.location.href));
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
    void vodTrackerLifecycle.sync(new URL(window.location.href));
  }
});
