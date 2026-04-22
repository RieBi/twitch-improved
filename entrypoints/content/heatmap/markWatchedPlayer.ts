import browser from "webextension-polyfill";

import { parseTwitchVodIdFromPathname } from "../declutter/routeMatch";
import { sendMsg, type GetVodRecordsResponse, type Msg } from "../../../lib/messaging";
import { defaultSettings, loadSettings, migrateSettings, type Settings } from "../../../lib/settings";

const WRAP_CLASS = "td-player-mark-watched-root";
const BTN_CLASS = "td-player-mark-watched";
const LABEL_CLASS = "td-player-mark-watched-label";
const HOST_MARKER = "data-td-player-mark-host";

/** Static SVG (24×24) — same canvas size as Twitch core action icons; `currentColor` follows the button. */
const MARK_WATCHED_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';

const MUTATION_ATTACH_DEBOUNCE_MS = 200;

const findVideoOptionsButton = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('button[aria-label="Video Options"]') ??
  document.querySelector<HTMLButtonElement>('button[title="Video Options"]');

const normalizeAria = (value: string | null): string => (value ?? "").trim().toLowerCase();

const findShareButton = (): HTMLButtonElement | null => {
  const exact = document.querySelector<HTMLButtonElement>('button[aria-label="Share"]');
  if (exact) {
    return exact;
  }

  for (const btn of document.querySelectorAll<HTMLButtonElement>("button[aria-label]")) {
    if (normalizeAria(btn.getAttribute("aria-label")) === "share") {
      return btn;
    }
  }

  return null;
};

/**
 * Twitch binds the Share tooltip to `[data-test-selector="toggle-balloon-wrapper__mouse-enter-detector"]`
 * (from verified page markup). If we insert Mark watched *inside* that subtree, hovering it opens Share's
 * balloon. Insert after the wrapper instead.
 */
const SHARE_BALLOON_MOUSE_ENTER_SELECTOR =
  '[data-test-selector="toggle-balloon-wrapper__mouse-enter-detector"]';

const findShareHoverAnchor = (share: HTMLElement): HTMLElement => {
  const wrapper = share.closest<HTMLElement>(SHARE_BALLOON_MOUSE_ENTER_SELECTOR);
  return wrapper ?? share;
};

const isMountStillAfterAnchor = (anchor: Element, mount: Element): boolean =>
  mount.isConnected &&
  anchor.isConnected &&
  anchor.parentNode === mount.parentNode &&
  mount.previousElementSibling === anchor;

/** After we insert beside the balloon wrapper, that node is a flex child and often grows to 100% width — stack Mark watched below Share. Shrink-wrap it. */
const SHARE_BALLOON_SHRINK_ATTR = "data-td-share-balloon-shrink-v2";

const patchShareBalloonWrapperShrink = (share: HTMLElement): void => {
  const balloon = share.closest<HTMLElement>(SHARE_BALLOON_MOUSE_ENTER_SELECTOR);
  if (!balloon || balloon.getAttribute(SHARE_BALLOON_SHRINK_ATTR) === "1") {
    return;
  }

  balloon.setAttribute(SHARE_BALLOON_SHRINK_ATTR, "1");
  const p = (key: string, value: string): void => {
    balloon.style.setProperty(key, value, "important");
  };
  p("flex", "0 0 auto");
  p("flex-grow", "0");
  p("flex-shrink", "0");
  p("width", "fit-content");
  p("max-width", "100%");
  p("min-width", "0");
  p("align-self", "center");
};

/**
 * Mark watched is `insertAdjacentElement("afterend", …)` from `insertAnchor`, so both share the same
 * `parentElement`. Row flex on that parent fixes column/stack layout; we only run once the mount exists
 * so we never restyle an arbitrary ancestor before insertion. If the parent is huge (unsafe), walk up.
 */
const SHARE_ACTIONS_INLINE_HOST_ATTR = "data-td-share-actions-inline-host-v2";

const applyActionsRowStyles = (host: HTMLElement): void => {
  if (host.getAttribute(SHARE_ACTIONS_INLINE_HOST_ATTR) === "1") {
    return;
  }

  host.setAttribute(SHARE_ACTIONS_INLINE_HOST_ATTR, "1");
  const imp = (key: string, value: string): void => {
    host.style.setProperty(key, value, "important");
  };
  imp("display", "flex");
  imp("flex-direction", "row");
  imp("flex-wrap", "nowrap");
  imp("align-items", "center");
  imp("row-gap", "0");
  imp("column-gap", "0.5rem");
};

const patchShareActionsInlineHost = (insertAnchor: HTMLElement, mount: HTMLElement | null): void => {
  if (mount === null || !mount.isConnected) {
    return;
  }

  const parent = insertAnchor.parentElement;
  if (
    !(parent instanceof HTMLElement) ||
    parent !== mount.parentElement ||
    mount.previousElementSibling !== insertAnchor
  ) {
    return;
  }

  const n = parent.children.length;
  if (n >= 2 && n <= 72) {
    applyActionsRowStyles(parent);
    return;
  }

  let host: HTMLElement | null = parent.parentElement;
  for (let depth = 0; depth < 10 && host; depth++, host = host.parentElement) {
    if (host.getAttribute(SHARE_ACTIONS_INLINE_HOST_ATTR) === "1") {
      return;
    }

    const hn = host.children.length;
    if (hn < 2 || hn > 14) {
      continue;
    }

    applyActionsRowStyles(host);
    return;
  }
};

const SHARE_COLUMN_LAYOUT_ATTR = "data-td-share-actions-row";

const patchShareColumnRowLayout = (column: HTMLElement): void => {
  if (column.getAttribute(SHARE_COLUMN_LAYOUT_ATTR) === "1") {
    return;
  }

  column.setAttribute(SHARE_COLUMN_LAYOUT_ATTR, "1");
  column.style.setProperty("display", "flex");
  column.style.setProperty("flex-direction", "row");
  column.style.setProperty("align-items", "center");
  column.style.setProperty("flex-wrap", "nowrap");
  column.style.setProperty("column-gap", "0.5rem");
  column.style.setProperty("row-gap", "0");
};

/** Widen the Share column to a row when needed; Mark watched mounts after the Share hover wrapper. */
const maybePatchShareColumnContaining = (share: HTMLElement): void => {
  const videoOptions = findVideoOptionsButton();
  if (!videoOptions?.parentElement) {
    return;
  }

  const row = videoOptions.parentElement;
  if (!row.contains(share)) {
    return;
  }

  for (let i = 0; i < row.children.length; i++) {
    const child = row.children[i];
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    if (child.contains(share) && !child.contains(videoOptions)) {
      patchShareColumnRowLayout(child);
      return;
    }
  }
};

export interface MarkWatchedPlayerLifecycle {
  sync(url: URL): void;
  dispose(): void;
}

export const createMarkWatchedPlayerLifecycle = (): MarkWatchedPlayerLifecycle => {
  let activeVodId: string | null = null;
  let observer: MutationObserver | null = null;
  let debounceTimer: number | null = null;
  const placementRetryTimers: number[] = [];
  let mountRoot: HTMLDivElement | null = null;
  let settings: Settings = defaultSettings;
  let disposed = false;
  let listenersAttached = false;

  const clearPlacementRetries = (): void => {
    for (const id of placementRetryTimers) {
      window.clearTimeout(id);
    }

    placementRetryTimers.length = 0;
  };

  const getActionButton = (): HTMLButtonElement | null =>
    mountRoot?.querySelector<HTMLButtonElement>(`:scope > .${BTN_CLASS}`) ?? null;

  const getLabelEl = (): HTMLSpanElement | null =>
    mountRoot?.querySelector<HTMLSpanElement>(`:scope > .${BTN_CLASS} > .${LABEL_CLASS}`) ?? null;

  const removeMount = (): void => {
    mountRoot?.remove();
    mountRoot = null;
    for (const el of document.querySelectorAll(`[${HOST_MARKER}]`)) {
      el.removeAttribute(HOST_MARKER);
    }
  };

  const clearDebounce = (): void => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const stopObserver = (): void => {
    observer?.disconnect();
    observer = null;
    clearDebounce();
    clearPlacementRetries();
  };

  const applyMarkedState = (marked: boolean): void => {
    const btn = getActionButton();
    const label = getLabelEl();
    if (!btn || !label) {
      return;
    }

    const nextText = marked ? "Unmark watched" : "Mark watched";
    const nextPressed = marked ? "true" : "false";
    if (label.textContent !== nextText) {
      label.textContent = nextText;
    }
    if (btn.getAttribute("aria-pressed") !== nextPressed) {
      btn.setAttribute("aria-pressed", nextPressed);
    }
  };

  const applyIndicatorColor = (): void => {
    getActionButton()?.style.setProperty("--td-indicator-color", settings.heatmap.indicatorColor);
  };

  const fetchMarkedAndApply = async (): Promise<void> => {
    const vodId = activeVodId;
    if (!vodId || disposed || !getActionButton()) {
      return;
    }

    const response = await sendMsg<GetVodRecordsResponse>({ type: "getVodRecords", ids: [vodId] }).catch(
      () => ({ records: {} } as GetVodRecordsResponse)
    );

    if (vodId !== activeVodId || disposed) {
      return;
    }

    const record = response.records[vodId] ?? null;
    applyIndicatorColor();
    applyMarkedState(record?.markedWatched === true);
  };

  /**
   * DOM-only placement. Does not call the background — safe to run on every debounced mutation tick.
   * @returns whether a new mount was created (needs initial marked state fetch).
   */
  const ensurePlacedSync = (): boolean => {
    const vodId = activeVodId;
    if (disposed || !vodId || !settings.heatmap.enabled) {
      removeMount();
      return false;
    }

    const share = findShareButton();
    if (!share) {
      if (mountRoot) {
        removeMount();
      }
      return false;
    }

    patchShareBalloonWrapperShrink(share);
    maybePatchShareColumnContaining(share);

    const insertAnchor = findShareHoverAnchor(share);
    const inPlace =
      mountRoot !== null && mountRoot.isConnected && isMountStillAfterAnchor(insertAnchor, mountRoot);

    if (!inPlace) {
      removeMount();
    }

    if (mountRoot) {
      patchShareActionsInlineHost(insertAnchor, mountRoot);
      applyIndicatorColor();
      return false;
    }

    const root = document.createElement("div");
    root.className = WRAP_CLASS;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.style.setProperty("--td-indicator-color", settings.heatmap.indicatorColor);

    const icon = document.createElement("span");
    icon.className = "td-player-mark-watched-icon";
    icon.innerHTML = MARK_WATCHED_ICON_SVG;

    const label = document.createElement("span");
    label.className = LABEL_CLASS;
    label.textContent = "Mark watched";

    btn.append(icon, label);
    root.appendChild(btn);

    btn.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = activeVodId;
        if (!id) {
          return;
        }

        void sendMsg<{ ok: boolean }>({ type: "toggleMarkedWatched", vodId: id }).catch(() => undefined);
      },
      true
    );

    insertAnchor.insertAdjacentElement("afterend", root);
    insertAnchor.parentElement?.setAttribute(HOST_MARKER, "1");

    mountRoot = root;
    patchShareActionsInlineHost(insertAnchor, mountRoot);
    applyMarkedState(false);
    return true;
  };

  const runDebouncedPlacement = (): void => {
    const created = ensurePlacedSync();
    if (created) {
      void fetchMarkedAndApply();
    }
  };

  const scheduleDebouncedPlacement = (): void => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      runDebouncedPlacement();
    }, MUTATION_ATTACH_DEBOUNCE_MS);
  };

  const flushPlacementNow = (): void => {
    clearDebounce();
    const created = ensurePlacedSync();
    if (created) {
      void fetchMarkedAndApply();
    }
  };

  const onRuntimeMessage = (message: unknown): void => {
    if (typeof message !== "object" || message === null || !("type" in message)) {
      return;
    }

    const typed = message as Msg;
    if (typed.type === "vodRecordChanged" && typed.vodId === activeVodId) {
      applyIndicatorColor();
      applyMarkedState(typed.record.markedWatched);
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
    applyIndicatorColor();
    scheduleDebouncedPlacement();
  };

  const attachListeners = (): void => {
    if (listenersAttached) {
      return;
    }

    listenersAttached = true;
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    browser.storage.onChanged.addListener(onStorageChanged);
  };

  const detachListeners = (): void => {
    if (!listenersAttached) {
      return;
    }

    listenersAttached = false;
    browser.runtime.onMessage.removeListener(onRuntimeMessage);
    browser.storage.onChanged.removeListener(onStorageChanged);
  };

  return {
    sync(url: URL): void {
      void (async () => {
        try {
          settings = await loadSettings();
        } catch {
          settings = defaultSettings;
        }

        if (disposed) {
          return;
        }

        const vodId = parseTwitchVodIdFromPathname(url.pathname);
        if (!vodId) {
          activeVodId = null;
          stopObserver();
          removeMount();
          detachListeners();
          return;
        }

        const previousVodId = activeVodId;
        if (previousVodId !== vodId) {
          removeMount();
        }

        activeVodId = vodId;
        attachListeners();
        stopObserver();
        observer = new MutationObserver(() => {
          scheduleDebouncedPlacement();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        clearPlacementRetries();
        flushPlacementNow();
        placementRetryTimers.push(
          window.setTimeout(() => {
            if (!disposed && activeVodId === vodId) {
              flushPlacementNow();
            }
          }, 400)
        );
        placementRetryTimers.push(
          window.setTimeout(() => {
            if (!disposed && activeVodId === vodId) {
              flushPlacementNow();
            }
          }, 2000)
        );
        placementRetryTimers.push(
          window.setTimeout(() => {
            if (!disposed && activeVodId === vodId) {
              flushPlacementNow();
            }
          }, 5000)
        );
        placementRetryTimers.push(
          window.setTimeout(() => {
            if (!disposed && activeVodId === vodId) {
              flushPlacementNow();
            }
          }, 12_000)
        );
      })();
    },

    dispose(): void {
      disposed = true;
      stopObserver();
      removeMount();
      detachListeners();
    }
  };
};
