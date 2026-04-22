import browser from "webextension-polyfill";

import { sendMsg, type GetVodRecordsResponse, type Msg } from "../../../lib/messaging";
import { defaultSettings, loadSettings, migrateSettings, type Settings } from "../../../lib/settings";
import type { VodRecord } from "../../../lib/db/schema";
import cssText from "./styles.css?inline";
import {
  buildProcessedTag,
  clearTile,
  collectVodTiles,
  getProcessedTag,
  renderTile,
  type RenderTileResult,
  setProcessedTag
} from "./tileRenderer";

const HEATMAP_STYLE_ID = "td-heatmap-style";
const BATCH_FETCH_DELAY_MS = 50;
const MISSING_RECORD_REFETCH_MS = 15_000;
const HEATMAP_VERBOSE_DEBUG_FLAG = "td:heatmap-verbose-debug";
const SHOULD_LOG_HEATMAP_DEBUG = (() => {
  if (!import.meta.env.DEV) {
    return false;
  }

  try {
    return window.localStorage.getItem(HEATMAP_VERBOSE_DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
})();
const DEBUG_ENABLED = import.meta.env.DEV;
const DEBUG_ATTR = "data-td-heatmap-debug";
const DEBUG_BOOT_ATTR = "data-td-heatmap-boot";
const DEBUG_BOUND_ATTR = "data-td-bound-vod-id";
const DEBUG_REASON_ATTR = "data-td-render-reason";
const DEBUG_SEGMENTS_ATTR = "data-td-last-segments";

const OBSERVER_ROOT_SELECTORS = [
  '[data-a-target="root-scroller__main-column"]',
  '[data-test-selector="main-content-column"]',
  "main[role='main']",
  "main"
];

const loadSettingsOrDefault = async (): Promise<Settings> => {
  try {
    return await loadSettings();
  } catch {
    return defaultSettings;
  }
};

const ensureStyleTag = (): void => {
  const existing = document.getElementById(HEATMAP_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    return;
  }

  const style = document.createElement("style");
  style.id = HEATMAP_STYLE_ID;
  style.textContent = cssText;
  (document.head ?? document.documentElement).appendChild(style);
};

const resolveObserverRoot = (): HTMLElement => {
  for (const selector of OBSERVER_ROOT_SELECTORS) {
    const match = document.querySelector<HTMLElement>(selector);
    if (match) {
      return match;
    }
  }

  return document.documentElement;
};

export interface HeatmapController {
  refresh: () => void;
  dispose: () => void;
}

interface HeatmapDebugState {
  scans: number;
  tilesDiscovered: number;
  tilesBound: number;
  batchRequests: number;
  requestedVodIds: number;
  recordsReturned: number;
  recordsMissing: number;
  renderAttempts: number;
  renderSkippedByTag: number;
  renderReasons: Record<RenderTileResult["reason"], number>;
  vodRecordChangedEvents: number;
  settingsChanges: number;
  lastBatchIds: string[];
  lastRender: { vodId: string; reason: RenderTileResult["reason"]; segmentCount: number } | null;
}

interface HeatmapDebugApi {
  getState: () => HeatmapDebugState;
  reset: () => void;
  setVerbose: (next: boolean) => void;
}

declare global {
  interface Window {
    __tdHeatmapDebug?: HeatmapDebugApi;
  }
}

const createInitialDebugState = (): HeatmapDebugState => ({
  scans: 0,
  tilesDiscovered: 0,
  tilesBound: 0,
  batchRequests: 0,
  requestedVodIds: 0,
  recordsReturned: 0,
  recordsMissing: 0,
  renderAttempts: 0,
  renderSkippedByTag: 0,
  renderReasons: {
    "no-record": 0,
    "heatmap-disabled": 0,
    "tiles-disabled": 0,
    "no-duration": 0,
    "no-ranges": 0,
    rendered: 0
  },
  vodRecordChangedEvents: 0,
  settingsChanges: 0,
  lastBatchIds: [],
  lastRender: null
});

export const initHeatmap = async (): Promise<HeatmapController> => {
  if (DEBUG_ENABLED) {
    document.documentElement.setAttribute(DEBUG_BOOT_ATTR, "booted");
  }
  ensureStyleTag();

  let settings = await loadSettingsOrDefault();
  let settingsRevision = 0;
  let observer: MutationObserver | null = null;
  let observerRoot: HTMLElement | null = null;
  let scheduledRefresh: number | null = null;
  let fetchTimer: number | null = null;
  let disposed = false;

  const pendingFetchVodIds = new Set<string>();
  const inFlightVodIds = new Set<string>();
  const recordsByVodId = new Map<string, VodRecord | null>();
  const recordFetchedAtByVodId = new Map<string, number>();
  const tilesByVodId = new Map<string, Set<HTMLElement>>();
  const debug = createInitialDebugState();
  let verboseDebugLogging = SHOULD_LOG_HEATMAP_DEBUG;
  let lastDocumentFallbackScanAt = 0;

  const logDebug = (event: string, payload: Record<string, unknown>): void => {
    if (!verboseDebugLogging) {
      return;
    }

    console.info("[td][heatmap][debug]", event, payload);
  };

  const publishDebugSnapshot = (): void => {
    if (!DEBUG_ENABLED) {
      return;
    }

    const snapshot = {
      scans: debug.scans,
      tilesDiscovered: debug.tilesDiscovered,
      tilesBound: debug.tilesBound,
      batchRequests: debug.batchRequests,
      requestedVodIds: debug.requestedVodIds,
      recordsReturned: debug.recordsReturned,
      recordsMissing: debug.recordsMissing,
      renderAttempts: debug.renderAttempts,
      renderSkippedByTag: debug.renderSkippedByTag,
      renderReasons: debug.renderReasons,
      settingsChanges: debug.settingsChanges,
      vodRecordChangedEvents: debug.vodRecordChangedEvents,
      lastBatchIds: debug.lastBatchIds,
      lastRender: debug.lastRender,
      pathname: window.location.pathname
    };
    document.documentElement.setAttribute(DEBUG_ATTR, JSON.stringify(snapshot));
  };

  if (DEBUG_ENABLED) {
    window.__tdHeatmapDebug = {
      getState: () => {
        publishDebugSnapshot();
        return structuredClone(debug);
      },
      reset: () => {
        Object.assign(debug, createInitialDebugState());
        logDebug("reset", {});
        publishDebugSnapshot();
      },
      setVerbose: (next: boolean) => {
        verboseDebugLogging = next;
        console.info("[td][heatmap][debug] verbose", { enabled: verboseDebugLogging });
        publishDebugSnapshot();
      }
    };
  }

  const pruneDetachedTiles = (): void => {
    for (const [vodId, tiles] of tilesByVodId) {
      for (const tile of Array.from(tiles)) {
        if (!tile.isConnected) {
          tiles.delete(tile);
        }
      }

      if (tiles.size === 0) {
        tilesByVodId.delete(vodId);
      }
    }
  };

  const updateTileRendering = (tile: HTMLElement, vodId: string, record: VodRecord | null): void => {
    debug.renderAttempts += 1;
    const expectedTag = buildProcessedTag(vodId, record?.lastUpdated ?? null, settingsRevision);
    const hasDebugBadge = tile.querySelector(".td-heatmap-debug-badge") !== null;
    const hasHeatmap = tile.querySelector(".td-heatmap") !== null;
    if (getProcessedTag(tile) === expectedTag && (hasDebugBadge || hasHeatmap)) {
      debug.renderSkippedByTag += 1;
      if (DEBUG_ENABLED) {
        tile.setAttribute(DEBUG_BOUND_ATTR, vodId);
      }
      publishDebugSnapshot();
      return;
    }

    let renderResult: RenderTileResult;
    try {
      renderResult = renderTile({ tile, vodId, record, settings });
    } catch (error) {
      renderResult = {
        rendered: false,
        reason: "no-record",
        durationSeconds: null,
        segmentCount: 0,
        watchedIndicatorApplied: false
      };
      logDebug("render-failed", {
        vodId,
        error: error instanceof Error ? error.message : String(error)
      });
      if (DEBUG_ENABLED) {
        tile.setAttribute(DEBUG_REASON_ATTR, "render-failed");
      }
      publishDebugSnapshot();
      return;
    }
    debug.renderReasons[renderResult.reason] += 1;
    debug.lastRender = { vodId, reason: renderResult.reason, segmentCount: renderResult.segmentCount };
    if (DEBUG_ENABLED) {
      tile.setAttribute(DEBUG_BOUND_ATTR, vodId);
      tile.setAttribute(DEBUG_REASON_ATTR, renderResult.reason);
      tile.setAttribute(DEBUG_SEGMENTS_ATTR, String(renderResult.segmentCount));
    }
    logDebug("render", {
      vodId,
      reason: renderResult.reason,
      segmentCount: renderResult.segmentCount,
      durationSeconds: renderResult.durationSeconds,
      watchedIndicatorApplied: renderResult.watchedIndicatorApplied,
      rangeCount: record?.ranges.length ?? 0
    });
    setProcessedTag(tile, expectedTag);
    publishDebugSnapshot();
  };

  const renderVodAcrossTiles = (vodId: string): void => {
    const tiles = tilesByVodId.get(vodId);
    if (!tiles) {
      return;
    }

    const record = recordsByVodId.get(vodId) ?? null;
    for (const tile of tiles) {
      if (!tile.isConnected) {
        continue;
      }

      updateTileRendering(tile, vodId, record);
    }
  };

  const renderAllBoundTiles = (): void => {
    pruneDetachedTiles();
    for (const vodId of tilesByVodId.keys()) {
      renderVodAcrossTiles(vodId);
    }
  };

  const flushFetchQueue = (): void => {
    if (fetchTimer !== null) {
      window.clearTimeout(fetchTimer);
      fetchTimer = null;
    }

    const now = Date.now();
    const nextIds = Array.from(pendingFetchVodIds).filter((vodId) => {
      if (inFlightVodIds.has(vodId)) {
        return false;
      }

      const cached = recordsByVodId.get(vodId);
      if (cached === undefined) {
        return true;
      }

      if (cached !== null) {
        return false;
      }

      const fetchedAt = recordFetchedAtByVodId.get(vodId) ?? 0;
      return now - fetchedAt >= MISSING_RECORD_REFETCH_MS;
    });
    pendingFetchVodIds.clear();
    if (nextIds.length === 0) {
      return;
    }

    for (const id of nextIds) {
      inFlightVodIds.add(id);
    }
    debug.batchRequests += 1;
    debug.requestedVodIds += nextIds.length;
    debug.lastBatchIds = nextIds;
    logDebug("batch-fetch", { ids: nextIds });
    publishDebugSnapshot();

    void sendMsg<GetVodRecordsResponse>({ type: "getVodRecords", ids: nextIds })
      .then((response) => {
        for (const vodId of nextIds) {
          const record = response.records[vodId] ?? null;
          recordsByVodId.set(vodId, record);
          recordFetchedAtByVodId.set(vodId, Date.now());
          if (record) {
            debug.recordsReturned += 1;
          } else {
            debug.recordsMissing += 1;
          }
          inFlightVodIds.delete(vodId);
          renderVodAcrossTiles(vodId);
          publishDebugSnapshot();
        }
      })
      .catch(() => {
        logDebug("batch-fetch-failed", { ids: nextIds });
        for (const vodId of nextIds) {
          inFlightVodIds.delete(vodId);
        }
      });
  };

  const scheduleFetch = (): void => {
    if (fetchTimer !== null) {
      return;
    }

    fetchTimer = window.setTimeout(() => {
      fetchTimer = null;
      flushFetchQueue();
    }, BATCH_FETCH_DELAY_MS);
  };

  const bindTile = (vodId: string, tile: HTMLElement): void => {
    if (DEBUG_ENABLED) {
      tile.setAttribute(DEBUG_BOUND_ATTR, vodId);
    }
    let tiles = tilesByVodId.get(vodId);
    if (!tiles) {
      tiles = new Set<HTMLElement>();
      tilesByVodId.set(vodId, tiles);
    }

    tiles.add(tile);
    debug.tilesBound += 1;
    publishDebugSnapshot();

    const cached = recordsByVodId.get(vodId);
    if (cached !== undefined) {
      updateTileRendering(tile, vodId, cached);
      if (cached === null) {
        const fetchedAt = recordFetchedAtByVodId.get(vodId) ?? 0;
        const ageMs = Date.now() - fetchedAt;
        if (ageMs >= MISSING_RECORD_REFETCH_MS) {
          pendingFetchVodIds.add(vodId);
          scheduleFetch();
          logDebug("stale-miss-refetch", { vodId, ageMs });
        }
      }
      return;
    }

    pendingFetchVodIds.add(vodId);
    scheduleFetch();
  };

  const scanNode = (root: ParentNode): void => {
    debug.scans += 1;
    const discovered = collectVodTiles(root);
    debug.tilesDiscovered += discovered.length;
    logDebug("scan", {
      discovered: discovered.length,
      pathname: window.location.pathname,
      rootNodeName: root instanceof Node ? root.nodeName : "unknown"
    });
    publishDebugSnapshot();
    for (const { tile, vodId } of discovered) {
      bindTile(vodId, tile);
    }
  };

  const clearAllTiles = (): void => {
    for (const tiles of tilesByVodId.values()) {
      for (const tile of tiles) {
        clearTile(tile);
      }
    }
  };

  const clearStaleGlobalDecorations = (): void => {
    for (const image of Array.from(document.querySelectorAll<HTMLImageElement>(".td-watched-grayout"))) {
      image.classList.remove("td-watched-grayout");
    }

    for (const overlay of Array.from(document.querySelectorAll<HTMLElement>(".td-heatmap"))) {
      overlay.remove();
    }

    for (const badge of Array.from(document.querySelectorAll<HTMLElement>(".td-heatmap-debug-badge"))) {
      badge.remove();
    }
  };

  const onStorageChanged = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "sync" || !changes.settings) {
      return;
    }

    settings = migrateSettings(changes.settings.newValue);
    debug.settingsChanges += 1;
    settingsRevision += 1;
    renderAllBoundTiles();
    publishDebugSnapshot();
  };

  const onRuntimeMessage = (message: unknown): void => {
    if (typeof message !== "object" || message === null || !("type" in message)) {
      return;
    }

    const typed = message as Msg;
    if (typed.type !== "vodRecordChanged") {
      return;
    }

    debug.vodRecordChangedEvents += 1;
    logDebug("vod-record-changed", {
      vodId: typed.vodId,
      ranges: typed.record.ranges.length,
      totalWatchedSeconds: typed.record.totalWatchedSeconds
    });
    recordsByVodId.set(typed.vodId, typed.record);
    recordFetchedAtByVodId.set(typed.vodId, Date.now());
    renderVodAcrossTiles(typed.vodId);
    publishDebugSnapshot();
  };

  const connectObserver = (): void => {
    const nextRoot = resolveObserverRoot();
    if (observer && observerRoot === nextRoot) {
      return;
    }

    observer?.disconnect();
    observerRoot = nextRoot;
    observer = new MutationObserver((records) => {
      let discoveredInTick = 0;
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }

          const discovered = collectVodTiles(node);
          discoveredInTick += discovered.length;
          if (discovered.length > 0) {
            debug.scans += 1;
            debug.tilesDiscovered += discovered.length;
            logDebug("scan", {
              discovered: discovered.length,
              pathname: window.location.pathname,
              rootNodeName: node.nodeName
            });
            publishDebugSnapshot();
            for (const item of discovered) {
              bindTile(item.vodId, item.tile);
            }
          }
        }
      }

      if (discoveredInTick === 0) {
        const now = Date.now();
        if (now - lastDocumentFallbackScanAt > 1000) {
          lastDocumentFallbackScanAt = now;
          scanNode(document);
        }
      }
    });

    observer.observe(nextRoot, { childList: true, subtree: true });
  };

  const runRefresh = (): void => {
    if (disposed) {
      return;
    }

    clearStaleGlobalDecorations();
    connectObserver();
    scanNode(document);
    pruneDetachedTiles();
    flushFetchQueue();
  };

  const scheduleRefresh = (): void => {
    if (scheduledRefresh !== null) {
      return;
    }

    scheduledRefresh = window.setTimeout(() => {
      scheduledRefresh = null;
      runRefresh();
    }, 0);
  };

  browser.storage.onChanged.addListener(onStorageChanged);
  browser.runtime.onMessage.addListener(onRuntimeMessage);
  runRefresh();
  if (DEBUG_ENABLED) {
    document.documentElement.setAttribute(DEBUG_BOOT_ATTR, "ready");
  }

  return {
    refresh: () => {
      scheduleRefresh();
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      browser.storage.onChanged.removeListener(onStorageChanged);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      observer?.disconnect();
      observer = null;

      if (fetchTimer !== null) {
        window.clearTimeout(fetchTimer);
        fetchTimer = null;
      }

      if (scheduledRefresh !== null) {
        window.clearTimeout(scheduledRefresh);
        scheduledRefresh = null;
      }

      clearAllTiles();
      tilesByVodId.clear();
      pendingFetchVodIds.clear();
      inFlightVodIds.clear();
      recordsByVodId.clear();
      recordFetchedAtByVodId.clear();
      if (DEBUG_ENABLED) {
        delete window.__tdHeatmapDebug;
      }
      document.documentElement.removeAttribute(DEBUG_ATTR);
      document.documentElement.removeAttribute(DEBUG_BOOT_ATTR);
    }
  };
};
