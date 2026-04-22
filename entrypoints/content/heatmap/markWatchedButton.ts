import type { VodRecord } from "../../../lib/db/schema";
import { sendMsg } from "../../../lib/messaging";
import type { Settings } from "../../../lib/settings";

export const TILE_MARK_BTN_CLASS = "td-mark-watched-btn";
export const TILE_MARK_WRAP_CLASS = "td-mark-watched-btn-wrap";
export const TILE_MARK_HOST_CLASS = "td-mark-watched-tile-host";

export interface TileMarkButtonOptions {
  vodId: string;
  record: VodRecord | null;
  settings: Settings;
}

const removeMarkButtonFromHost = (host: HTMLElement): void => {
  host.classList.remove(TILE_MARK_HOST_CLASS);
  host.querySelector(`:scope > .${TILE_MARK_WRAP_CLASS}`)?.remove();
  host.querySelector<HTMLButtonElement>(`:scope > .${TILE_MARK_BTN_CLASS}`)?.remove();
};

export const ensureTileMarkButton = (host: HTMLElement, options: TileMarkButtonOptions): void => {
  const { vodId, settings } = options;
  if (!settings.heatmap.enabled || !settings.heatmap.showOnTiles) {
    removeMarkButtonFromHost(host);
    return;
  }

  host.classList.add(TILE_MARK_HOST_CLASS);

  let wrap = host.querySelector<HTMLElement>(`:scope > .${TILE_MARK_WRAP_CLASS}`);
  let btn = wrap?.querySelector<HTMLButtonElement>(`.${TILE_MARK_BTN_CLASS}`) ?? null;
  if (!wrap || !btn) {
    wrap?.remove();
    wrap = document.createElement("span");
    wrap.className = TILE_MARK_WRAP_CLASS;
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = TILE_MARK_BTN_CLASS;
    btn.setAttribute("aria-label", "Toggle watched");
    btn.textContent = "✓";
    btn.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        void sendMsg<{ ok: boolean }>({ type: "toggleMarkedWatched", vodId }).catch(() => undefined);
      },
      true
    );
    btn.addEventListener(
      "pointerdown",
      (event) => {
        event.stopPropagation();
      },
      true
    );
    wrap.appendChild(btn);
    if (window.getComputedStyle(host).position === "static") {
      host.style.setProperty("position", "relative");
    }
    host.appendChild(wrap);
  }

  const marked = options.record?.markedWatched === true;
  btn.setAttribute("data-td-marked", marked ? "true" : "false");
  btn.style.setProperty("--td-indicator-color", settings.heatmap.indicatorColor);
};

export const clearTileMarkButton = (root: HTMLElement): void => {
  for (const host of root.querySelectorAll<HTMLElement>(`.${TILE_MARK_HOST_CLASS}`)) {
    removeMarkButtonFromHost(host);
  }
  for (const wrap of root.querySelectorAll<HTMLElement>(`.${TILE_MARK_WRAP_CLASS}`)) {
    wrap.remove();
  }
  for (const btn of root.querySelectorAll<HTMLButtonElement>(`.${TILE_MARK_BTN_CLASS}`)) {
    btn.remove();
  }
};
