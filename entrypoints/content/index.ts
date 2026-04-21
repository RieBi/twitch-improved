import { initDeclutter } from "./declutter";
import { initHeatmap } from "./heatmap";
import { initStreamMetadata } from "./tracker/streamMetadata";
import { startLiveTracker } from "./tracker/liveTracker";
import { createLiveTrackerLifecycle } from "./tracker/liveTrackerLifecycle";
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
    let heatmap = { refresh: () => undefined, dispose: () => undefined };
    try {
      heatmap = await initHeatmap();
    } catch (error) {
      document.documentElement.setAttribute("data-td-heatmap-boot", "failed");
      console.error("[td][heatmap] init failed", error);
    }
    const vodTrackerLifecycle = createVodTrackerLifecycle(startVodTracker);
    const liveTrackerLifecycle = createLiveTrackerLifecycle(startLiveTracker);

    const notifyRouteChange = (): void => {
      declutter.refresh();
      heatmap.refresh();
      void vodTrackerLifecycle.sync(new URL(window.location.href));
      void liveTrackerLifecycle.sync(new URL(window.location.href));
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
    window.addEventListener("beforeunload", () => {
      declutter.dispose();
      heatmap.dispose();
      void liveTrackerLifecycle.stop();
      void vodTrackerLifecycle.stop();
    });
    void vodTrackerLifecycle.sync(new URL(window.location.href));
    void liveTrackerLifecycle.sync(new URL(window.location.href));
  }
});
