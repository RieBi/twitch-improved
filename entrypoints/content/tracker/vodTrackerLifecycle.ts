import { parseTwitchVodIdFromPathname } from "../declutter/routeMatch";
import { VOD_EVENT_NAME } from "./streamMetadata";

const ROUTE_WATCH_INTERVAL_MS = 500;

const parseVodIdFromUrl = (url: URL): string | null => parseTwitchVodIdFromPathname(url.pathname);

export type VodTrackerStarter = (vodId: string) => Promise<VodTrackerSession>;

export interface VodTrackerSession {
  vodId: string;
  stop(): Promise<void>;
}

export interface VodTrackerLifecycleController {
  sync(url: URL): Promise<void>;
  stop(): Promise<void>;
}

export const createVodTrackerLifecycle = (startTracker: VodTrackerStarter): VodTrackerLifecycleController => {
  let current: VodTrackerSession | null = null;
  let activeVodId: string | null = null;
  let opChain: Promise<void> = Promise.resolve();
  let routeWatchTimer: number | null = null;
  let lastSeenHref = "";

  const maybeStartFromUrl = async (url: URL): Promise<void> => {
    const nextVodId = parseVodIdFromUrl(url);
    if (!nextVodId) {
      if (current) {
        await current.stop();
      }
      current = null;
      activeVodId = null;
      return;
    }

    if (activeVodId === nextVodId) {
      return;
    }

    if (current) {
      await current.stop();
      current = null;
    }

    activeVodId = nextVodId;
    const nextSession = await startTracker(nextVodId);
    if (activeVodId !== nextVodId) {
      await nextSession.stop();
      return;
    }

    current = nextSession;
  };

  const enqueueResync = (): void => {
    opChain = opChain.then(async () => {
      await maybeStartFromUrl(new URL(window.location.href));
    });
  };

  const onVodMeta = (): void => {
    enqueueResync();
  };

  const ensureRouteWatchdog = (): void => {
    if (routeWatchTimer !== null) {
      return;
    }

    routeWatchTimer = window.setInterval(() => {
      const href = window.location.href;
      if (!href || href === lastSeenHref) {
        return;
      }

      lastSeenHref = href;
      enqueueResync();
    }, ROUTE_WATCH_INTERVAL_MS);
  };

  const clearRouteWatchdog = (): void => {
    if (routeWatchTimer === null) {
      return;
    }

    window.clearInterval(routeWatchTimer);
    routeWatchTimer = null;
  };

  document.addEventListener(VOD_EVENT_NAME, onVodMeta as EventListener);
  ensureRouteWatchdog();

  return {
    sync(url: URL): Promise<void> {
      lastSeenHref = url.href;
      opChain = opChain.then(async () => {
        await maybeStartFromUrl(url);
      });
      return opChain;
    },

    stop(): Promise<void> {
      opChain = opChain.then(async () => {
        clearRouteWatchdog();
        document.removeEventListener(VOD_EVENT_NAME, onVodMeta as EventListener);
        lastSeenHref = "";
        activeVodId = null;
        if (!current) {
          return;
        }

        await current.stop();
        current = null;
      });

      return opChain;
    }
  };
};
