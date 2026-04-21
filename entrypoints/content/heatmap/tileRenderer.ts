import type { VodRecord } from "../../../lib/db/schema";
import type { Settings } from "../../../lib/settings";
import { coveragePct } from "../../../lib/util/ranges";

const PROCESSED_ATTR = "data-td-processed";
const VOD_ID_ATTR = "data-td-vod-id";
const HEATMAP_CLASS = "td-heatmap";
const HEATMAP_SEGMENT_CLASS = "td-heatmap-seg";
const HOST_CLASS = "td-heatmap-host";
const DEBUG_BADGE_CLASS = "td-heatmap-debug-badge";
const WATCHED_CHIP_CLASS = "td-watched-chip";
const WATCHED_BORDER_CLASS = "td-watched-border";
const WATCHED_GRAYOUT_CLASS = "td-watched-grayout";
const NATIVE_PROGRESS_SELECTOR = ".video-media-card__progress-bar-wrapper, .tw-progress-bar[role='progressbar']";
const SHOW_DEBUG_BADGES = false;

const DURATION_TEXT_PATTERN = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;
const CARD_ROOT_SELECTOR = [
  "article",
  "li",
  "[data-a-target='video-tower-card']",
  "[data-test-selector='video-card']",
  "[data-test-selector*='video-card' i]",
  "[data-a-target*='video-card' i]",
  "[data-test-selector*='video-tower-card' i]",
  "[data-a-target*='video-tower-card' i]",
  "[data-test-selector*='preview-card' i]",
  "[data-a-target*='preview-card' i]"
].join(", ");
const THUMBNAIL_HOST_SELECTOR = [
  '[class*="preview-card-thumbnail"]:not([class*="__image"])',
  '[data-test-selector*="preview-card-thumbnail" i]',
  '[data-a-target*="preview-card-thumbnail" i]',
  '[data-test-selector*="thumbnail" i]',
  '[data-a-target*="thumbnail" i]',
  "figure"
].join(", ");

const escapeForAttributeContains = (value: string): string => value.replace(/["\\]/g, "\\$&");

export interface TileRef {
  tile: HTMLElement;
  vodId: string;
}

interface RenderTileInput {
  tile: HTMLElement;
  vodId: string;
  record: VodRecord | null;
  settings: Settings;
}

export interface RenderTileResult {
  rendered: boolean;
  reason:
    | "no-record"
    | "heatmap-disabled"
    | "tiles-disabled"
    | "no-duration"
    | "no-ranges"
    | "rendered";
  durationSeconds: number | null;
  segmentCount: number;
  watchedIndicatorApplied: boolean;
}

const parseVodIdFromHref = (href: string): string | null => {
  let path = href;
  try {
    path = new URL(href, window.location.origin).pathname;
  } catch {
    path = href;
  }

  const match = /\/videos\/(\d+)(?:\/|$|[?#])/.exec(path);
  return match?.[1] ?? null;
};

const toAbsoluteHref = (href: string): string => {
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
};

const parseDurationTextToSeconds = (value: string): number | null => {
  const trimmed = value.trim();
  const match = DURATION_TEXT_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
};

const resolveDurationSeconds = (tile: HTMLElement, record: VodRecord | null): number | null => {
  if (record?.durationSeconds && record.durationSeconds > 0) {
    return record.durationSeconds;
  }

  const durationCandidates = tile.querySelectorAll<HTMLElement>(
    '[data-a-target="video-card-duration"], [data-test-selector*="duration" i], span, p'
  );
  for (const candidate of durationCandidates) {
    const parsed = parseDurationTextToSeconds(candidate.textContent ?? "");
    if (parsed && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

const getTileContainer = (anchor: HTMLAnchorElement): HTMLElement => {
  const strictContainer = anchor.closest<HTMLElement>(
    "article, li, [data-a-target='video-tower-card'], [data-test-selector='video-card'], [data-a-target='video-card']"
  );
  if (strictContainer) {
    return strictContainer;
  }

  // Fallback: climb until parent starts containing multiple VOD links.
  // This keeps each card isolated and avoids collapsing all cards into one shared wrapper.
  let candidate: HTMLElement = anchor;
  let current: HTMLElement | null = anchor;
  while (current?.parentElement) {
    const parent = current.parentElement;
    const parentVodLinks = parent.querySelectorAll('a[href*="/videos/"]').length;
    if (parentVodLinks > 1) {
      break;
    }

    candidate = parent;
    current = parent;
  }

  return candidate;
};

const getAnchorForVod = (tile: HTMLElement, vodId: string): HTMLAnchorElement | null => {
  if (tile instanceof HTMLAnchorElement && parseVodIdFromHref(tile.href) === vodId) {
    return tile;
  }

  const escapedVodId = escapeForAttributeContains(vodId);
  return (
    tile.querySelector<HTMLAnchorElement>(`a[href*="/videos/${escapedVodId}"]`) ??
    tile.querySelector<HTMLAnchorElement>('a[href*="/videos/"]')
  );
};

const getArea = (element: HTMLElement): number => {
  const rect = element.getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
};

const isRenderableImage = (image: HTMLImageElement): boolean => {
  const rect = image.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) {
    return false;
  }

  const styles = window.getComputedStyle(image);
  if (styles.display === "none" || styles.visibility === "hidden") {
    return false;
  }

  const opacity = Number.parseFloat(styles.opacity || "1");
  if (!Number.isFinite(opacity) || opacity <= 0.01) {
    return false;
  }

  return true;
};

const isVisibleHost = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 60) {
    return false;
  }

  const styles = window.getComputedStyle(element);
  if (styles.display === "none" || styles.visibility === "hidden") {
    return false;
  }

  const opacity = Number.parseFloat(styles.opacity || "1");
  if (!Number.isFinite(opacity) || opacity <= 0.01) {
    return false;
  }

  return true;
};

const findThumbnailHost = (cardRoot: HTMLElement): HTMLElement | null => {
  const candidates = Array.from(cardRoot.querySelectorAll<HTMLElement>(THUMBNAIL_HOST_SELECTOR));
  let best: HTMLElement | null = null;
  let bestArea = 0;

  for (const candidate of candidates) {
    const className = (candidate.className ?? "").toLowerCase();
    if (className.includes("avatar") || className.includes("__image")) {
      continue;
    }

    if (!isVisibleHost(candidate)) {
      continue;
    }

    const area = getArea(candidate);
    if (area > bestArea) {
      best = candidate;
      bestArea = area;
    }
  }

  return best;
};

const normalizeHost = (host: HTMLElement, fallback: HTMLElement): HTMLElement => {
  if (host instanceof HTMLImageElement) {
    return host.parentElement ?? fallback;
  }

  if ((host.className ?? "").toLowerCase().includes("preview-card-thumbnail__image")) {
    return host.parentElement ?? fallback;
  }

  return host;
};

const promoteToStableThumbnailHost = (host: HTMLElement, cardRoot: HTMLElement): HTMLElement => {
  const durationBadgeSelector = '[data-a-target="video-card-duration"], [data-test-selector*="duration" i]';

  let current: HTMLElement | null = normalizeHost(host, cardRoot);
  while (current && current !== cardRoot) {
    const className = (current.className ?? "").toLowerCase();
    if (className.includes("__image")) {
      current = current.parentElement;
      continue;
    }

    if (current.querySelector(durationBadgeSelector)) {
      return current;
    }

    current = current.parentElement;
  }

  const fallbackAspect = normalizeHost(host, cardRoot).closest<HTMLElement>(".tw-aspect");
  if (fallbackAspect && cardRoot.contains(fallbackAspect)) {
    return fallbackAspect;
  }

  return normalizeHost(host, cardRoot);
};


const getThumbnailElements = (
  tile: HTMLElement,
  vodId: string
): { host: HTMLElement; image: HTMLImageElement | null } => {
  const vodAnchor = getAnchorForVod(tile, vodId);
  const cardRoot = vodAnchor ? getTileContainer(vodAnchor) : tile;
  const strictHost = findThumbnailHost(cardRoot);
  if (strictHost) {
    const hostImageCandidates = Array.from(strictHost.querySelectorAll<HTMLImageElement>("img"));
    const hostImage = hostImageCandidates.find((candidate) => isRenderableImage(candidate)) ?? null;
    return { host: promoteToStableThumbnailHost(strictHost, cardRoot), image: hostImage };
  }

  const allImages = Array.from(cardRoot.querySelectorAll<HTMLImageElement>("img"));
  let chosenImage: HTMLImageElement | null = null;
  let bestScore = -1;
  for (const image of allImages) {
    if (!isRenderableImage(image)) {
      continue;
    }

    const rect = image.getBoundingClientRect();
    const imageClass = image.className.toLowerCase();
    const parentClass = (image.parentElement?.className ?? "").toLowerCase();
    if (imageClass.includes("avatar") || parentClass.includes("avatar")) {
      continue;
    }

    const area = rect.width * rect.height;
    const aspect = rect.width / rect.height;
    if (aspect < 1.15 || rect.width < 120 || rect.height < 60) {
      continue;
    }
    const hasThumbnailAncestor =
      image.closest(THUMBNAIL_HOST_SELECTOR) !== null ||
      image.closest<HTMLElement>('[class*="thumbnail"], [class*="preview-card"], figure') !== null;
    const wideBonus = aspect > 1.2 ? area : area * 0.2;
    const thumbBonus = hasThumbnailAncestor ? area : 0;
    const score = wideBonus + thumbBonus;
    if (score > bestScore) {
      chosenImage = image;
      bestScore = score;
    }
  }

  if (!chosenImage) {
    return { host: cardRoot, image: null };
  }

  const rawHost =
    chosenImage.closest<HTMLElement>(THUMBNAIL_HOST_SELECTOR) ??
    chosenImage.closest<HTMLElement>('[class*="thumbnail"], [class*="preview-card"], figure') ??
    chosenImage.parentElement ??
    cardRoot;

  const host = promoteToStableThumbnailHost(normalizeHost(rawHost ?? cardRoot, cardRoot), cardRoot);

  return { host: host ?? cardRoot, image: chosenImage };
};

const clearTileDecorations = (tile: HTMLElement): void => {
  tile.removeAttribute(PROCESSED_ATTR);

  const overlays = tile.querySelectorAll(`.${HEATMAP_CLASS}`);
  for (const overlay of overlays) {
    overlay.remove();
  }

  const badges = tile.querySelectorAll(`.${DEBUG_BADGE_CLASS}`);
  for (const badge of badges) {
    badge.remove();
  }

  const watchedChips = tile.querySelectorAll(`.${WATCHED_CHIP_CLASS}`);
  for (const chip of watchedChips) {
    chip.remove();
  }

  const hosts = tile.querySelectorAll<HTMLElement>(`.${HOST_CLASS}`);
  for (const host of hosts) {
    host.classList.remove(HOST_CLASS);
  }

  const watchedBorders = tile.querySelectorAll<HTMLElement>(`.${WATCHED_BORDER_CLASS}`);
  for (const host of watchedBorders) {
    host.classList.remove(WATCHED_BORDER_CLASS);
  }

  const watchedImages = tile.querySelectorAll<HTMLImageElement>(`.${WATCHED_GRAYOUT_CLASS}`);
  for (const image of watchedImages) {
    image.classList.remove(WATCHED_GRAYOUT_CLASS);
  }

  const nativeProgressBars = tile.querySelectorAll<HTMLElement>(NATIVE_PROGRESS_SELECTOR);
  for (const progress of nativeProgressBars) {
    progress.style.removeProperty("display");
    progress.style.removeProperty("visibility");
    progress.style.removeProperty("opacity");
  }
};

const resolveWatchedChipHost = (host: HTMLElement): HTMLElement => {
  let current: HTMLElement | null = host;
  while (current && current !== document.body) {
    if (current.querySelector(".tw-media-card-stat, [class*='ScPositionCorner']")) {
      return current;
    }

    current = current.parentElement;
  }

  return host;
};

const ensureWatchedChip = (host: HTMLElement): HTMLElement => {
  const chipHost = resolveWatchedChipHost(host);
  const existing = chipHost.querySelector<HTMLElement>(`:scope > .${WATCHED_CHIP_CLASS}`);
  if (existing) {
    return existing;
  }

  if (window.getComputedStyle(chipHost).position === "static") {
    chipHost.style.setProperty("position", "relative");
  }

  const chip = document.createElement("div");
  chip.className = WATCHED_CHIP_CLASS;
  chip.textContent = "Watched";
  chip.style.setProperty("position", "absolute", "important");
  chip.style.setProperty("top", "6px", "important");
  chip.style.setProperty("right", "6px", "important");
  chip.style.setProperty("left", "auto", "important");
  chip.style.setProperty("bottom", "auto", "important");
  chip.style.setProperty("z-index", "10000", "important");
  chip.style.setProperty("display", "inline-flex", "important");
  chip.style.setProperty("align-items", "center", "important");
  chip.style.setProperty("justify-content", "center", "important");
  chip.style.setProperty("width", "auto", "important");
  chip.style.setProperty("height", "auto", "important");
  chip.style.setProperty("max-width", "none", "important");
  chip.style.setProperty("max-height", "none", "important");
  chip.style.setProperty("padding", "3px 6px", "important");
  chip.style.setProperty("border-radius", "999px", "important");
  chip.style.setProperty("font-size", "10px", "important");
  chip.style.setProperty("line-height", "1", "important");
  chip.style.setProperty("font-weight", "600", "important");
  chip.style.setProperty("white-space", "nowrap", "important");
  chip.style.setProperty("color", "#fff", "important");
  chip.style.setProperty("pointer-events", "none", "important");
  chip.style.setProperty("box-shadow", "0 1px 2px rgba(0,0,0,0.45)", "important");
  chipHost.appendChild(chip);
  return chip;
};

const setDebugBadge = (host: HTMLElement, value: string): void => {
  if (!SHOW_DEBUG_BADGES) {
    return;
  }

  const existing = host.querySelector<HTMLElement>(`:scope > .${DEBUG_BADGE_CLASS}`);
  if (existing) {
    existing.textContent = value;
    return;
  }

  const badge = document.createElement("div");
  badge.className = DEBUG_BADGE_CLASS;
  badge.textContent = value;
  badge.style.position = "absolute";
  badge.style.top = "4px";
  badge.style.left = "4px";
  badge.style.zIndex = "10000";
  badge.style.padding = "2px 4px";
  badge.style.borderRadius = "3px";
  badge.style.fontSize = "10px";
  badge.style.lineHeight = "1";
  badge.style.color = "#fff";
  badge.style.background = "rgba(0,0,0,0.75)";
  badge.style.pointerEvents = "none";
  badge.style.fontFamily = 'Inter, "Helvetica Neue", Arial, sans-serif';
  host.appendChild(badge);
};

const ensureOverlay = (host: HTMLElement): HTMLElement => {
  const existing = host.querySelector<HTMLElement>(`:scope > .${HEATMAP_CLASS}`);
  if (existing) {
    existing.replaceChildren();
    return existing;
  }

  const computedPosition = window.getComputedStyle(host).position;
  if (computedPosition === "static") {
    host.style.setProperty("position", "relative");
  }

  const overlay = document.createElement("div");
  overlay.className = HEATMAP_CLASS;
  overlay.style.setProperty("position", "absolute", "important");
  overlay.style.setProperty("left", "0", "important");
  overlay.style.setProperty("right", "0", "important");
  overlay.style.setProperty("bottom", "2px", "important");
  overlay.style.setProperty("top", "auto", "important");
  overlay.style.setProperty("height", "4px", "important");
  overlay.style.setProperty("min-height", "4px", "important");
  overlay.style.setProperty("max-height", "4px", "important");
  overlay.style.setProperty("overflow", "hidden", "important");
  overlay.style.setProperty("pointer-events", "none", "important");
  overlay.style.setProperty("z-index", "9999", "important");
  host.appendChild(overlay);
  return overlay;
};

const styleOverlay = (overlay: HTMLElement, bottomOffsetPx: number): void => {
  overlay.style.setProperty("position", "absolute", "important");
  overlay.style.setProperty("left", "0", "important");
  overlay.style.setProperty("right", "0", "important");
  overlay.style.setProperty("bottom", `${bottomOffsetPx}px`, "important");
  overlay.style.setProperty("top", "auto", "important");
  overlay.style.setProperty("height", "4px", "important");
  overlay.style.setProperty("min-height", "4px", "important");
  overlay.style.setProperty("max-height", "4px", "important");
  overlay.style.setProperty("overflow", "hidden", "important");
  overlay.style.setProperty("pointer-events", "none", "important");
  overlay.style.setProperty("z-index", "9999", "important");
};

const updateNativeProgressVisibility = (tile: HTMLElement, hide: boolean): void => {
  const nativeProgressBars = tile.querySelectorAll<HTMLElement>(NATIVE_PROGRESS_SELECTOR);
  for (const progress of nativeProgressBars) {
    if (hide) {
      progress.style.setProperty("display", "none", "important");
      progress.style.setProperty("visibility", "hidden", "important");
      progress.style.setProperty("opacity", "0", "important");
    } else {
      progress.style.removeProperty("display");
      progress.style.removeProperty("visibility");
      progress.style.removeProperty("opacity");
    }
  }
};

const renderSegments = (overlay: HTMLElement, record: VodRecord, durationSeconds: number): void => {
  for (const [start, end] of record.ranges) {
    const clampedStart = Math.min(durationSeconds, Math.max(0, start));
    const clampedEnd = Math.min(durationSeconds, Math.max(clampedStart, end));
    const width = clampedEnd - clampedStart;
    if (width <= 0) {
      continue;
    }

    const segment = document.createElement("div");
    segment.className = HEATMAP_SEGMENT_CLASS;
    segment.style.setProperty("position", "absolute", "important");
    segment.style.setProperty("top", "0", "important");
    segment.style.setProperty("bottom", "auto", "important");
    segment.style.setProperty("height", "100%", "important");
    segment.style.setProperty("background-color", "var(--td-indicator-color, #9147ff)", "important");
    segment.style.setProperty("opacity", "1", "important");
    segment.style.left = `${(clampedStart / durationSeconds) * 100}%`;
    segment.style.width = `${(width / durationSeconds) * 100}%`;
    overlay.appendChild(segment);
  }
};

const shouldApplyWatchedIndicator = (
  record: VodRecord | null,
  durationSeconds: number | null,
  thresholdPct: number
): boolean => {
  if (!record) {
    return false;
  }

  if (record.markedWatched) {
    return true;
  }

  if (!durationSeconds || durationSeconds <= 0) {
    return false;
  }

  return coveragePct(record.ranges, durationSeconds) >= thresholdPct;
};

export const buildProcessedTag = (vodId: string, lastUpdated: number | null, settingsRevision: number): string =>
  `${vodId}@${lastUpdated ?? 0}@${settingsRevision}`;

export const collectVodTiles = (root: ParentNode): TileRef[] => {
  const anchors: HTMLAnchorElement[] = [];
  if (root instanceof HTMLAnchorElement) {
    anchors.push(root);
  }

  if (root instanceof Element || root instanceof Document) {
    anchors.push(...Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/videos/"]')));
  }

  const unique = new Set<HTMLElement>();
  const tiles: TileRef[] = [];
  for (const anchor of anchors) {
    const href = toAbsoluteHref(anchor.getAttribute("href") ?? anchor.href ?? "");
    const vodId = parseVodIdFromHref(href);
    if (!vodId) {
      continue;
    }

    const tile = getTileContainer(anchor);
    if (unique.has(tile)) {
      continue;
    }

    unique.add(tile);
    tile.setAttribute(VOD_ID_ATTR, vodId);
    tiles.push({ tile, vodId });
  }

  return tiles;
};

export const renderTile = ({ tile, vodId, record, settings }: RenderTileInput): RenderTileResult => {
  clearTileDecorations(tile);
  updateNativeProgressVisibility(tile, settings.heatmap.hideNativeTileProgressBar);

  if (!record) {
    const { host } = getThumbnailElements(tile, vodId);
    if (SHOW_DEBUG_BADGES) {
      host.classList.add(HOST_CLASS);
    }
    setDebugBadge(host, "NR");
    return {
      rendered: false,
      reason: "no-record",
      durationSeconds: null,
      segmentCount: 0,
      watchedIndicatorApplied: false
    };
  }

  if (!settings.heatmap.enabled) {
    const { host } = getThumbnailElements(tile, vodId);
    if (SHOW_DEBUG_BADGES) {
      host.classList.add(HOST_CLASS);
    }
    setDebugBadge(host, "OFF");
    return {
      rendered: false,
      reason: "heatmap-disabled",
      durationSeconds: null,
      segmentCount: 0,
      watchedIndicatorApplied: false
    };
  }

  if (!settings.heatmap.showOnTiles) {
    const { host } = getThumbnailElements(tile, vodId);
    if (SHOW_DEBUG_BADGES) {
      host.classList.add(HOST_CLASS);
    }
    setDebugBadge(host, "TILES_OFF");
    return {
      rendered: false,
      reason: "tiles-disabled",
      durationSeconds: null,
      segmentCount: 0,
      watchedIndicatorApplied: false
    };
  }

  const durationSeconds = resolveDurationSeconds(tile, record);
  const resolved = getThumbnailElements(tile, vodId);
  const host = resolved.host instanceof HTMLImageElement
    ? (resolved.host.parentElement ?? tile)
    : resolved.host;
  const image = resolved.image;
  if (SHOW_DEBUG_BADGES) {
    host.classList.add(HOST_CLASS);
  }
  host.style.setProperty("--td-indicator-color", settings.heatmap.indicatorColor);
  let segmentCount = 0;

  if (durationSeconds && durationSeconds > 0 && record.ranges.length > 0) {
    const overlay = ensureOverlay(host);
    styleOverlay(overlay, settings.heatmap.hideNativeTileProgressBar ? 0 : 2);
    renderSegments(overlay, record, durationSeconds);
    segmentCount = overlay.childElementCount;
    if (overlay.childElementCount === 0) {
      overlay.remove();
    }
  }

  const watched = shouldApplyWatchedIndicator(record, durationSeconds, settings.heatmap.watchedThresholdPct);
  if (watched) {
    const watchedChip = ensureWatchedChip(host);
    watchedChip.style.setProperty("background-color", settings.heatmap.indicatorColor, "important");

    if (settings.heatmap.indicatorStyle === "border" || settings.heatmap.indicatorStyle === "both") {
      host.classList.add(WATCHED_BORDER_CLASS);
    }
  }

  tile.setAttribute(VOD_ID_ATTR, vodId);
  if (!durationSeconds || durationSeconds <= 0) {
    setDebugBadge(host, "ND");
    return {
      rendered: watched,
      reason: "no-duration",
      durationSeconds: null,
      segmentCount,
      watchedIndicatorApplied: watched
    };
  }

  if (record.ranges.length === 0) {
    setDebugBadge(host, "NRNG");
    return {
      rendered: watched,
      reason: "no-ranges",
      durationSeconds,
      segmentCount,
      watchedIndicatorApplied: watched
    };
  }

  setDebugBadge(host, `OK:${segmentCount}`);
  return {
    rendered: segmentCount > 0 || watched,
    reason: "rendered",
    durationSeconds,
    segmentCount,
    watchedIndicatorApplied: watched
  };
};

export const clearTile = (tile: HTMLElement): void => {
  clearTileDecorations(tile);
};

export const getProcessedTag = (tile: HTMLElement): string => tile.getAttribute(PROCESSED_ATTR) ?? "";

export const setProcessedTag = (tile: HTMLElement, value: string): void => {
  tile.setAttribute(PROCESSED_ATTR, value);
};

export const getTileVodId = (tile: HTMLElement): string | null => tile.getAttribute(VOD_ID_ATTR);
