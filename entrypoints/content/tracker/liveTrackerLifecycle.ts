import browser from "webextension-polyfill";

import type { LiveMeta } from "../../../lib/messaging";
import { defaultSettings, loadSettings, type Settings } from "../../../lib/settings";
import { getChannelLoginFromPathname, isLiveChannelSurfacePath } from "../declutter/routeMatch";
import type { LiveTrackerSession } from "./liveTracker";
import { getLatestStreamMeta } from "./streamMetadata";

const STREAM_META_EVENT = "td:stream-meta";

export type LiveTrackerStarter = (sessionId: string, meta: LiveMeta) => Promise<LiveTrackerSession>;

export interface LiveTrackerLifecycleController {
  sync(url: URL): Promise<void>;
  stop(): Promise<void>;
}

const loadSettingsOrDefault = async (): Promise<Settings> => {
  try {
    return await loadSettings();
  } catch {
    return defaultSettings;
  }
};

const loginsMatch = (urlLogin: string, metaLogin: string): boolean =>
  urlLogin.toLowerCase() === metaLogin.toLowerCase();

const buildSessionId = (channelId: string, streamStartedAt: number): string =>
  `${channelId}:${streamStartedAt}`;

export const createLiveTrackerLifecycle = (
  startTracker: LiveTrackerStarter
): LiveTrackerLifecycleController => {
  let current: LiveTrackerSession | null = null;
  let activeSessionId: string | null = null;
  let disposed = false;
  let opChain: Promise<void> = Promise.resolve();

  const stopInternal = async (): Promise<void> => {
    if (!current) {
      activeSessionId = null;
      return;
    }

    await current.stop();
    current = null;
    activeSessionId = null;
  };

  const maybeStartFromUrl = async (url: URL): Promise<void> => {
    if (!isLiveChannelSurfacePath(url.pathname)) {
      await stopInternal();
      return;
    }

    const urlLogin = getChannelLoginFromPathname(url.pathname);
    if (!urlLogin) {
      await stopInternal();
      return;
    }

    const settings = await loadSettingsOrDefault();
    if (!settings.heatmap.enabled || !settings.heatmap.trackLiveStreams) {
      await stopInternal();
      return;
    }

    const stream = getLatestStreamMeta();
    if (!stream || !loginsMatch(urlLogin, stream.channelLogin)) {
      await stopInternal();
      return;
    }

    const sessionId = buildSessionId(stream.channelId, stream.streamStartedAt);
    if (activeSessionId === sessionId && current) {
      return;
    }

    if (current) {
      await current.stop();
      current = null;
    }

    const meta: LiveMeta = {
      channelId: stream.channelId,
      channelLogin: stream.channelLogin,
      streamStartedAt: stream.streamStartedAt
    };

    activeSessionId = sessionId;
    const nextSession = await startTracker(sessionId, meta);
    if (activeSessionId !== sessionId) {
      await nextSession.stop();
      return;
    }

    current = nextSession;
  };

  const enqueueResync = (): void => {
    if (disposed) {
      return;
    }

    opChain = opChain.then(async () => {
      await maybeStartFromUrl(new URL(window.location.href));
    });
  };

  const onStreamMeta = (): void => {
    enqueueResync();
  };

  const onStorageChanged = (): void => {
    enqueueResync();
  };

  document.addEventListener(STREAM_META_EVENT, onStreamMeta as EventListener);
  browser.storage.onChanged.addListener(onStorageChanged);

  return {
    sync(url: URL): Promise<void> {
      if (disposed) {
        return opChain;
      }

      opChain = opChain.then(async () => {
        await maybeStartFromUrl(url);
      });
      return opChain;
    },

    stop(): Promise<void> {
      opChain = opChain.then(async () => {
        if (disposed) {
          return;
        }

        disposed = true;
        document.removeEventListener(STREAM_META_EVENT, onStreamMeta as EventListener);
        browser.storage.onChanged.removeListener(onStorageChanged);
        activeSessionId = null;
        await stopInternal();
      });
      return opChain;
    }
  };
};
