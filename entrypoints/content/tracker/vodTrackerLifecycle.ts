import { parseTwitchVodIdFromPathname } from "../declutter/routeMatch";
import { VOD_EVENT_NAME } from "./streamMetadata";

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

  document.addEventListener(VOD_EVENT_NAME, onVodMeta as EventListener);

  return {
    sync(url: URL): Promise<void> {
      opChain = opChain.then(async () => {
        await maybeStartFromUrl(url);
      });
      return opChain;
    },

    stop(): Promise<void> {
      opChain = opChain.then(async () => {
        document.removeEventListener(VOD_EVENT_NAME, onVodMeta as EventListener);
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
