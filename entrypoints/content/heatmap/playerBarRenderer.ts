import browser from "webextension-polyfill";

import type { VodRecord } from "../../../lib/db/schema";
import { sendMsg, type GetVodRecordsResponse, type Msg } from "../../../lib/messaging";
import { defaultSettings, loadSettings, migrateSettings, type Settings } from "../../../lib/settings";
import type { Range } from "../../../lib/util/ranges";
import { parseTwitchVodIdFromPathname } from "../declutter/routeMatch";

const OVERLAY_CLASS = "td-player-heatmap";
const SEGMENT_CLASS = "td-player-heatmap-seg";
const HOST_MARK_ATTR = "data-td-player-heatmap-host";
const SYNC_RETRY_MS = [250, 1_000, 3_000];
const MUTATION_RENDER_DEBOUNCE_MS = 180;
const ROUTE_WATCH_INTERVAL_MS = 500;

export interface PlayerBarSegment {
  leftPct: number;
  widthPct: number;
}

export interface PlayerBarHeatmapLifecycle {
  sync(url: URL): void;
  dispose(): void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isVisibleElement = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 1) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return true;
};

const sortByWidthDesc = (elements: HTMLElement[]): HTMLElement[] => {
  return elements.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
};

export const computePlayerBarSegments = (ranges: Range[], durationSeconds: number): PlayerBarSegment[] => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [];
  }

  const segments: PlayerBarSegment[] = [];
  for (const range of ranges) {
    const startRaw = Number.isFinite(range[0]) ? range[0] : 0;
    const endRaw = Number.isFinite(range[1]) ? range[1] : 0;
    const start = clamp(startRaw, 0, durationSeconds);
    const end = clamp(endRaw, 0, durationSeconds);
    if (end <= start) {
      continue;
    }

    segments.push({
      leftPct: (start / durationSeconds) * 100,
      widthPct: ((end - start) / durationSeconds) * 100
    });
  }

  return segments;
};

const loadSettingsOrDefault = async (): Promise<Settings> => {
  try {
    return await loadSettings();
  } catch {
    return defaultSettings;
  }
};

const clearMarkedHosts = (): void => {
  for (const host of document.querySelectorAll<HTMLElement>(`[${HOST_MARK_ATTR}]`)) {
    host.removeAttribute(HOST_MARK_ATTR);
  }
};

const removeOverlay = (): void => {
  document.querySelector(`.${OVERLAY_CLASS}`)?.remove();
  clearMarkedHosts();
};

const isInternalHeatmapMutation = (records: MutationRecord[]): boolean => {
  return records.every((record) => {
    if (!(record.target instanceof Element) || !record.target.closest(`[${HOST_MARK_ATTR}]`)) {
      return false;
    }

    const touchedNodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
    return touchedNodes.every((node) => !(node instanceof Element) || node.closest(`[${HOST_MARK_ATTR}]`));
  });
};

const resolveObserverRoot = (): HTMLElement =>
  document.querySelector<HTMLElement>('[data-a-target="player-controls"]') ?? document.documentElement;

const findLikelySeekbarHost = (): HTMLElement | null => {
  const video = document.querySelector("video");
  if (!video) {
    return null;
  }

  const candidateSelectors = [
    '[data-a-target="player-seekbar"]',
    '[data-test-selector*="seek" i]',
    '[data-a-target*="seek" i]',
    '[role="slider"][aria-valuemin][aria-valuemax]',
    '[role="slider"][aria-valuenow]',
    '[role="slider"]',
    '[role="slider"][aria-label*="seek" i]',
    '[aria-label*="seek" i][aria-valuemin][aria-valuemax]',
    '[aria-label*="seek" i][aria-valuenow]'
  ];

  const collectCandidates = (root: ParentNode): HTMLElement[] => {
    const candidates: HTMLElement[] = [];
    for (const selector of candidateSelectors) {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) {
        if (isVisibleElement(element)) {
          candidates.push(element);
        }
      }
    }
    return candidates;
  };

  let ancestor: HTMLElement | null = video.parentElement;
  while (ancestor) {
    const candidates = collectCandidates(ancestor);
    if (candidates.length > 0) {
      const chosen = sortByWidthDesc(candidates)[0] ?? null;
      if (!chosen) {
        return null;
      }

      const hostCandidate = chosen.closest<HTMLElement>('[data-a-target="player-seekbar"]');
      const barHost =
        hostCandidate?.querySelector<HTMLElement>(".seekbar-bar") ??
        hostCandidate?.querySelector<HTMLElement>('[data-test-selector*="seekbar" i]');
      return barHost ?? hostCandidate ?? chosen.parentElement ?? chosen;
    }

    ancestor = ancestor.parentElement;
  }

  // Fallback for Twitch variants where controls are not under the queried video ancestor chain.
  const documentCandidates = collectCandidates(document);
  if (documentCandidates.length > 0) {
    const chosen = sortByWidthDesc(documentCandidates)[0] ?? null;
    if (!chosen) {
      return null;
    }

    const hostCandidate = chosen.closest<HTMLElement>('[data-a-target="player-seekbar"]');
    const barHost =
      hostCandidate?.querySelector<HTMLElement>(".seekbar-bar") ??
      hostCandidate?.querySelector<HTMLElement>('[data-test-selector*="seekbar" i]');
    return barHost ?? hostCandidate ?? chosen.parentElement ?? chosen;
  }

  return null;
};

const parseDurationTextToSeconds = (value: string): number | null => {
  const trimmed = value.trim();
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const parsed = parts.map((part) => Number.parseInt(part, 10));
  if (parsed.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parsed;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = parsed;
  return hours * 3600 + minutes * 60 + seconds;
};

const resolveDurationSeconds = (record: VodRecord | null): number | null => {
  if (record?.durationSeconds && record.durationSeconds > 0) {
    return record.durationSeconds;
  }

  const durationNode = document.querySelector<HTMLElement>('[data-a-target="player-seekbar-duration"]');
  if (!durationNode) {
    return null;
  }

  const attrDuration = Number.parseFloat(durationNode.getAttribute("data-a-value") ?? "");
  if (Number.isFinite(attrDuration) && attrDuration > 0) {
    return attrDuration;
  }

  const parsedTextDuration = parseDurationTextToSeconds(durationNode.textContent ?? "");
  if (parsedTextDuration && parsedTextDuration > 0) {
    return parsedTextDuration;
  }

  return null;
};

const ensureOverlay = (host: HTMLElement): HTMLElement => {
  const existing = host.querySelector<HTMLElement>(`:scope > .${OVERLAY_CLASS}`);
  if (existing) {
    existing.replaceChildren();
    return existing;
  }

  if (window.getComputedStyle(host).position === "static") {
    host.style.setProperty("position", "relative");
  }

  host.setAttribute(HOST_MARK_ATTR, "1");
  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  host.appendChild(overlay);
  return overlay;
};

const renderOverlay = (host: HTMLElement, record: VodRecord | null, settings: Settings): void => {
  const heatmap = settings.heatmap;
  if (!heatmap.enabled || !heatmap.showOnPlayerBar) {
    host.querySelector(`:scope > .${OVERLAY_CLASS}`)?.remove();
    return;
  }

  const durationSeconds = resolveDurationSeconds(record);
  if (!record || !durationSeconds || durationSeconds <= 0 || record.ranges.length === 0) {
    host.querySelector(`:scope > .${OVERLAY_CLASS}`)?.remove();
    return;
  }

  const segments = computePlayerBarSegments(record.ranges, durationSeconds);
  if (segments.length === 0) {
    host.querySelector(`:scope > .${OVERLAY_CLASS}`)?.remove();
    return;
  }

  const overlay = ensureOverlay(host);
  overlay.style.setProperty("--td-indicator-color", heatmap.indicatorColor);
  for (const segment of segments) {
    const element = document.createElement("div");
    element.className = SEGMENT_CLASS;
    element.style.left = `${segment.leftPct}%`;
    element.style.width = `${segment.widthPct}%`;
    overlay.appendChild(element);
  }
};

const fetchVodRecord = async (vodId: string): Promise<VodRecord | null> => {
  const response = await sendMsg<GetVodRecordsResponse>({ type: "getVodRecords", ids: [vodId] }).catch(
    () => ({ records: {} } as GetVodRecordsResponse)
  );

  return response.records[vodId] ?? null;
};

export const createPlayerBarHeatmapLifecycle = (): PlayerBarHeatmapLifecycle => {
  let disposed = false;
  let activeVodId: string | null = null;
  let activeRecord: VodRecord | null = null;
  let settings: Settings = defaultSettings;
  let host: HTMLElement | null = null;
  let mutationObserver: MutationObserver | null = null;
  let mutationObserverRoot: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let retryTimers: number[] = [];
  let mutationRenderTimer: number | null = null;
  let renderQueued = false;
  let isRendering = false;
  let syncRevision = 0;
  let fetchRevision = 0;
  let lastSyncedHref = "";
  let routeWatchdogTimer: number | null = null;
  let listenersAttached = false;

  const clearRetryTimers = (): void => {
    for (const timerId of retryTimers) {
      window.clearTimeout(timerId);
    }

    retryTimers = [];
  };

  const clearMutationRenderTimer = (): void => {
    if (mutationRenderTimer !== null) {
      window.clearTimeout(mutationRenderTimer);
      mutationRenderTimer = null;
    }
  };

  const clearRouteWatchdog = (): void => {
    if (routeWatchdogTimer !== null) {
      window.clearInterval(routeWatchdogTimer);
      routeWatchdogTimer = null;
    }
  };

  const disconnectObservers = (): void => {
    mutationObserver?.disconnect();
    mutationObserver = null;
    mutationObserverRoot = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  const detachListeners = (): void => {
    if (!listenersAttached) {
      return;
    }

    listenersAttached = false;
    browser.runtime.onMessage.removeListener(onRuntimeMessage);
    browser.storage.onChanged.removeListener(onStorageChanged);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
  };

  const cleanupHostRef = (): void => {
    if (!host?.isConnected) {
      host = null;
    }
  };

  const renderCurrent = (): void => {
    if (isRendering) {
      renderQueued = true;
      return;
    }

    isRendering = true;
    try {
      cleanupHostRef();
      if (!activeVodId) {
        removeOverlay();
        return;
      }

      const nextHost = findLikelySeekbarHost();
      if (!nextHost) {
        removeOverlay();
        host = null;
        return;
      }

      if (host !== nextHost) {
        removeOverlay();
        host = nextHost;
        resizeObserver?.disconnect();
        resizeObserver?.observe(nextHost);
      }

      if (activeRecord && activeRecord.vodId !== activeVodId) {
        activeRecord = null;
      }

      renderOverlay(nextHost, activeRecord, settings);
    } finally {
      isRendering = false;
      if (renderQueued) {
        renderQueued = false;
        renderCurrent();
      }
    }
  };

  const scheduleRender = (debounceMs: number = 0): void => {
    if (debounceMs <= 0) {
      clearMutationRenderTimer();
      renderCurrent();
      return;
    }

    clearMutationRenderTimer();
    mutationRenderTimer = window.setTimeout(() => {
      mutationRenderTimer = null;
      renderCurrent();
    }, debounceMs);
  };

  const scheduleRetrySync = (): void => {
    clearRetryTimers();
    if (!activeVodId) {
      return;
    }

    for (const delay of SYNC_RETRY_MS) {
      const timerId = window.setTimeout(() => {
        if (disposed || !activeVodId) {
          return;
        }

        renderCurrent();
      }, delay);
      retryTimers.push(timerId);
    }
  };

  const ensureObservers = (): void => {
    const nextRoot = resolveObserverRoot();
    if (mutationObserver && mutationObserverRoot === nextRoot) {
      return;
    }

    mutationObserver?.disconnect();
    mutationObserverRoot = nextRoot;
    mutationObserver = new MutationObserver((records) => {
      if (records.length > 0 && isInternalHeatmapMutation(records)) {
        return;
      }

      scheduleRender(MUTATION_RENDER_DEBOUNCE_MS);
    });
    mutationObserver.observe(nextRoot, { childList: true, subtree: true });

    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        scheduleRender(MUTATION_RENDER_DEBOUNCE_MS);
      });
    }

    resizeObserver.disconnect();
    if (host) {
      resizeObserver.observe(host);
    }
  };

  const onRuntimeMessage = (message: unknown): void => {
    if (typeof message !== "object" || message === null || !("type" in message)) {
      return;
    }

    const typed = message as Msg;
    if (typed.type !== "vodRecordChanged" || typed.vodId !== activeVodId) {
      return;
    }

    activeRecord = typed.record;
    scheduleRender();
  };

  const onStorageChanged = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "sync" || !changes.settings) {
      return;
    }

    settings = migrateSettings(changes.settings.newValue);
    scheduleRender();
  };

  const onFullscreenChange = (): void => {
    ensureObservers();
    scheduleRender();
  };

  const attachListeners = (): void => {
    if (listenersAttached) {
      return;
    }

    listenersAttached = true;
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    browser.storage.onChanged.addListener(onStorageChanged);
    document.addEventListener("fullscreenchange", onFullscreenChange);
  };

  const stopTracking = (): void => {
    activeVodId = null;
    activeRecord = null;
    clearRetryTimers();
    clearMutationRenderTimer();
    disconnectObservers();
    removeOverlay();
    host = null;
    isRendering = false;
    renderQueued = false;
    fetchRevision += 1;
    lastSyncedHref = "";
  };

  const startRouteWatchdog = (): void => {
    if (routeWatchdogTimer !== null) {
      return;
    }

    routeWatchdogTimer = window.setInterval(() => {
      if (disposed) {
        return;
      }

      const currentHref = window.location.href;
      if (!currentHref || currentHref === lastSyncedHref) {
        return;
      }

      thisSync(new URL(currentHref));
    }, ROUTE_WATCH_INTERVAL_MS);
  };

  const thisSync = (url: URL): void => {
    const syncToken = ++syncRevision;
    lastSyncedHref = url.href;
    void (async () => {
      const loadedSettings = await loadSettingsOrDefault();
      if (disposed || syncToken !== syncRevision) {
        return;
      }
      settings = loadedSettings;

      const vodId = parseTwitchVodIdFromPathname(url.pathname);
      if (!vodId) {
        stopTracking();
        return;
      }

      attachListeners();
      ensureObservers();

      const changedVod = activeVodId !== vodId;
      activeVodId = vodId;
      if (changedVod) {
        // Clear stale render state immediately so we never show the previous VOD's ranges.
        activeRecord = null;
        scheduleRender();
        const fetchToken = ++fetchRevision;
        const fetchedRecord = await fetchVodRecord(vodId);
        // Ignore stale async fetches that resolved after a route change or stop.
        if (
          disposed ||
          syncToken !== syncRevision ||
          activeVodId !== vodId ||
          fetchToken !== fetchRevision
        ) {
          return;
        }

        activeRecord = fetchedRecord;
      }

      ensureObservers();
      scheduleRender();
      scheduleRetrySync();
    })();
  };

  return {
    sync(url: URL): void {
      startRouteWatchdog();
      thisSync(url);
    },

    dispose(): void {
      disposed = true;
      clearRouteWatchdog();
      stopTracking();
      detachListeners();
    }
  };
};
