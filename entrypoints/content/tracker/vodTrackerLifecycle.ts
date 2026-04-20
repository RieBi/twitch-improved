const parseVodIdFromUrl = (url: URL): string | null => {
  const match = /^\/videos\/(\d+)(?:\/|$)/.exec(url.pathname);
  if (!match) {
    return null;
  }

  return match[1] ?? null;
};

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

  return {
    sync(url: URL): Promise<void> {
      const nextVodId = parseVodIdFromUrl(url);
      opChain = opChain.then(async () => {
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
      });

      return opChain;
    },

    stop(): Promise<void> {
      opChain = opChain.then(async () => {
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

