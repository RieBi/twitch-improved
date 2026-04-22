import browser from "webextension-polyfill";

import { sendMsg } from "../../../lib/messaging";
import { loadSettings, migrateSettings, type Settings } from "../../../lib/settings";
import { getSelector } from "../../../lib/selectors";
import { buildDeclutterCss, getActiveDeclutterRules } from "./rules";
import {
  shouldSuppressCarouselMedia,
  shouldSuppressChannelCarouselMedia,
  suppressMediaInContainer
} from "./mediaSuppression";
import { evaluateSelectorMisses } from "./watchdog";

const STYLE_ID = "td-declutter";
const PREHIDE_STYLE_ID = "td-declutter-prehide";
const TAG_ATTRIBUTE = "data-td-hide";
const MAIN_FEED_BELOW_CAROUSEL_TAG = "main-feed-below-carousel";
const GLOBAL_GET_AD_FREE_BUTTON_TAG = "global-get-ad-free-button";
const WATCHDOG_INTERVAL_MS = 30_000;
const REPORT_COOLDOWN_MS = 5 * 60_000;

const reportedMisses = new Map<string, number>();

let currentSettings: Settings | null = null;
let styleElement: HTMLStyleElement | null = null;
let mutationObserver: MutationObserver | null = null;
let watchdogTimer: number | null = null;
let scheduledRefresh: number | null = null;
let playListenerAttached = false;
let prehideInstalled = false;

const ensureStyleElement = (): HTMLStyleElement => {
  if (styleElement && document.contains(styleElement)) {
    return styleElement;
  }

  const existing = document.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    styleElement = existing;
    return existing;
  }

  const created = document.createElement("style");
  created.id = STYLE_ID;
  const styleRoot = document.head ?? document.documentElement;
  styleRoot.appendChild(created);
  styleElement = created;
  return created;
};

const ensurePrehideStyleElement = (): HTMLStyleElement => {
  const existing = document.getElementById(PREHIDE_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }

  const created = document.createElement("style");
  created.id = PREHIDE_STYLE_ID;
  const styleRoot = document.head ?? document.documentElement;
  styleRoot.appendChild(created);
  return created;
};

const installPrehideStyles = (): void => {
  if (prehideInstalled) {
    return;
  }

  ensurePrehideStyleElement().textContent = [
    '[data-a-target="front-page-carousel"] { visibility: hidden !important; }',
    '[data-a-target="top-carousel"] { visibility: hidden !important; }',
    '[class~="persistent-player"]:has([data-a-player-type="channel_home_carousel"]) { visibility: hidden !important; }',
    '[data-a-player-type="channel_home_carousel"] { visibility: hidden !important; }'
  ].join("\n");
  prehideInstalled = true;
};

const clearPrehideStyles = (): void => {
  if (!prehideInstalled) {
    return;
  }

  const prehideStyle = document.getElementById(PREHIDE_STYLE_ID);
  prehideStyle?.remove();
  prehideInstalled = false;
};

const queryExists = (selector: string, root: ParentNode = document): boolean => {
  try {
    return Boolean(root.querySelector(selector));
  } catch {
    return false;
  }
};

const findCarousel = (): HTMLElement | null => {
  const selector = getSelector("mainCarousel");
  const candidates = [selector.primary, ...selector.fallbacks];
  for (const candidate of candidates) {
    const matched = document.querySelector<HTMLElement>(candidate);
    if (matched) {
      return matched;
    }
  }

  return null;
};

const findChannelHomeCarousel = (): HTMLElement | null => {
  const player = document.querySelector<HTMLElement>('[data-a-player-type="channel_home_carousel"]');
  if (!player) {
    return null;
  }

  return player.closest<HTMLElement>('[class~="persistent-player"]') ?? player;
};

const applyMainFeedBelowCarouselTag = (settings: Settings, url: URL): void => {
  const existingTagged = document.querySelectorAll<HTMLElement>(
    `[${TAG_ATTRIBUTE}="${MAIN_FEED_BELOW_CAROUSEL_TAG}"]`
  );
  for (const tagged of existingTagged) {
    tagged.removeAttribute(TAG_ATTRIBUTE);
  }

  if (!settings.declutter.mainFeed.hideRecommendedStreams || url.pathname !== "/") {
    return;
  }

  const carousel = findCarousel();
  if (!carousel) {
    return;
  }

  const carouselContainer = carousel.closest<HTMLElement>("section, article, div");
  const feedColumn = carouselContainer?.parentElement;
  if (!feedColumn || !carouselContainer) {
    return;
  }

  let seenCarouselContainer = false;
  for (const child of Array.from(feedColumn.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    if (child === carouselContainer) {
      seenCarouselContainer = true;
      continue;
    }

    if (!seenCarouselContainer) {
      continue;
    }

    child.setAttribute(TAG_ATTRIBUTE, MAIN_FEED_BELOW_CAROUSEL_TAG);
  }
};

const applyGlobalGetAdFreeButtonTag = (settings: Settings): void => {
  const existingTagged = document.querySelectorAll<HTMLElement>(
    `[${TAG_ATTRIBUTE}="${GLOBAL_GET_AD_FREE_BUTTON_TAG}"]`
  );
  for (const tagged of existingTagged) {
    tagged.removeAttribute(TAG_ATTRIBUTE);
  }

  if (!settings.declutter.global.hideGetAdFreeButton) {
    return;
  }

  const labelNodes = document.querySelectorAll<HTMLElement>('[data-a-target="tw-core-button-label-text"]');
  for (const labelNode of labelNodes) {
    if (labelNode.textContent?.trim() !== "Get Ad-Free") {
      continue;
    }

    const button = labelNode.closest<HTMLElement>("button, a");
    if (!button) {
      continue;
    }

    button.setAttribute(TAG_ATTRIBUTE, GLOBAL_GET_AD_FREE_BUTTON_TAG);
  }
};

const suppressCarouselMediaPlayback = (settings: Settings, url: URL): void => {
  if (!shouldSuppressCarouselMedia(settings, url)) {
    return;
  }

  const carousel = findCarousel();
  if (!carousel) {
    return;
  }

  suppressMediaInContainer(carousel);
};

const suppressChannelCarouselMediaPlayback = (settings: Settings, url: URL): void => {
  if (!shouldSuppressChannelCarouselMedia(settings, url)) {
    return;
  }

  const channelCarousel = findChannelHomeCarousel();
  if (!channelCarousel) {
    return;
  }

  suppressMediaInContainer(channelCarousel);
};

const onPlayCapture = (event: Event): void => {
  if (!currentSettings) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  const suppressMainCarousel = shouldSuppressCarouselMedia(currentSettings, currentUrl);
  const suppressChannelCarousel = shouldSuppressChannelCarouselMedia(currentSettings, currentUrl);
  if (!suppressMainCarousel && !suppressChannelCarousel) {
    return;
  }

  if (!(event.target instanceof HTMLMediaElement)) {
    return;
  }

  if (suppressMainCarousel) {
    const carousel = findCarousel();
    if (carousel?.contains(event.target)) {
      suppressMediaInContainer(carousel);
      return;
    }
  }

  if (suppressChannelCarousel) {
    const channelCarousel = findChannelHomeCarousel();
    if (channelCarousel?.contains(event.target)) {
      suppressMediaInContainer(channelCarousel);
    }
  }
};

const applyDeclutter = (): void => {
  if (!currentSettings) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  applyMainFeedBelowCarouselTag(currentSettings, currentUrl);
  applyGlobalGetAdFreeButtonTag(currentSettings);

  const css = buildDeclutterCss(currentSettings, currentUrl);
  ensureStyleElement().textContent = css;
  suppressCarouselMediaPlayback(currentSettings, currentUrl);
  suppressChannelCarouselMediaPlayback(currentSettings, currentUrl);
};

const reportSelectorMiss = (selectorId: string): void => {
  const key = `${window.location.pathname}:${selectorId}`;
  const now = Date.now();
  const lastReportedAt = reportedMisses.get(key);
  if (typeof lastReportedAt === "number" && now - lastReportedAt < REPORT_COOLDOWN_MS) {
    return;
  }

  reportedMisses.set(key, now);
  void sendMsg<{ ok: boolean }>({
    type: "reportSelectorMiss",
    id: selectorId,
    url: window.location.href
  }).catch(() => undefined);
};

const runWatchdog = (): void => {
  if (!currentSettings) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  const activeRules = getActiveDeclutterRules(currentSettings, currentUrl);
  const misses = evaluateSelectorMisses(activeRules, (selector) => queryExists(selector));
  for (const miss of misses) {
    reportSelectorMiss(miss);
  }
};

const scheduleRefresh = (): void => {
  if (scheduledRefresh !== null) {
    return;
  }

  scheduledRefresh = window.setTimeout(() => {
    scheduledRefresh = null;
    applyDeclutter();
  }, 50);
};

const handleStorageChange = (
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string
): void => {
  if (areaName !== "sync" || !changes.settings) {
    return;
  }

  currentSettings = migrateSettings(changes.settings.newValue);
  applyDeclutter();
};

export interface DeclutterController {
  refresh: () => void;
  dispose: () => void;
}

export const initDeclutter = async (): Promise<DeclutterController> => {
  installPrehideStyles();
  try {
    currentSettings = await loadSettings();
    applyDeclutter();
  } finally {
    clearPrehideStyles();
  }

  browser.storage.onChanged.addListener(handleStorageChange);

  mutationObserver = new MutationObserver(() => scheduleRefresh());
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  watchdogTimer = window.setInterval(() => runWatchdog(), WATCHDOG_INTERVAL_MS);
  runWatchdog();

  if (!playListenerAttached) {
    document.addEventListener("play", onPlayCapture, true);
    playListenerAttached = true;
  }

  return {
    refresh: () => applyDeclutter(),
    dispose: () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }

      if (watchdogTimer !== null) {
        window.clearInterval(watchdogTimer);
        watchdogTimer = null;
      }

      if (scheduledRefresh !== null) {
        window.clearTimeout(scheduledRefresh);
        scheduledRefresh = null;
      }

      if (playListenerAttached) {
        document.removeEventListener("play", onPlayCapture, true);
        playListenerAttached = false;
      }

      clearPrehideStyles();
    }
  };
};
