export type IndicatorStyle = "grayout" | "border" | "both";

export interface Settings {
  declutter: {
    mainFeed: {
      hideCarousel: boolean;
      hideRecommendedStreams: boolean;
      hideMobileGames: boolean;
      hideRecommendedCategories: boolean;
      hideCategoriesYoullLike: boolean;
    };
    channel: {
      hideOfflinePreview: boolean;
      hideViewersAlsoWatch: boolean;
    };
    sidebar: {
      hideRecommendedChannels: boolean;
      hideRecommendedCategories: boolean;
    };
    global: {
      hideGetAdFreeButton: boolean;
    };
  };
  heatmap: {
    enabled: boolean;
    bucketSeconds: number;
    watchedThresholdPct: number;
    showOnTiles: boolean;
    showOnPlayerBar: boolean;
    indicatorStyle: IndicatorStyle;
    indicatorColor: string;
    trackLiveStreams: boolean;
    pauseWhenTabUnfocused: boolean;
    minWatchSecondsToRecord: number;
  };
}

interface PersistedSettingsPayload {
  version: number;
  settings: unknown;
}

export interface SettingsStorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface BrowserLike {
  storage?: {
    sync?: SettingsStorageArea;
  };
}

interface CallbackStorageArea {
  get(
    keys: string | string[] | null | undefined,
    callback: (items: Record<string, unknown>) => void
  ): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
}

interface ChromeLike {
  runtime?: {
    lastError?: {
      message?: string;
    };
  };
  storage?: {
    sync?: CallbackStorageArea;
  };
}

const STORAGE_KEY = "settings";
export const SETTINGS_VERSION = 1;
const ALLOWED_BUCKET_SECONDS = new Set([1, 5, 10, 30]);
const ALLOWED_INDICATOR_STYLES = new Set<IndicatorStyle>(["grayout", "border", "both"]);

export const defaultSettings: Settings = {
  declutter: {
    mainFeed: {
      hideCarousel: false,
      hideRecommendedStreams: false,
      hideMobileGames: false,
      hideRecommendedCategories: false,
      hideCategoriesYoullLike: false
    },
    channel: {
      hideOfflinePreview: false,
      hideViewersAlsoWatch: false
    },
    sidebar: {
      hideRecommendedChannels: false,
      hideRecommendedCategories: false
    },
    global: {
      hideGetAdFreeButton: false
    }
  },
  heatmap: {
    enabled: true,
    bucketSeconds: 5,
    watchedThresholdPct: 85,
    showOnTiles: true,
    showOnPlayerBar: true,
    indicatorStyle: "both",
    indicatorColor: "#9147ff",
    trackLiveStreams: true,
    pauseWhenTabUnfocused: true,
    minWatchSecondsToRecord: 10
  }
};

const getDefaultStorageArea = (): SettingsStorageArea => {
  const browserLike = globalThis as typeof globalThis & { browser?: BrowserLike };
  const browserStorage = browserLike.browser?.storage?.sync;
  if (browserStorage) {
    return browserStorage;
  }

  const chromeLike = globalThis as typeof globalThis & { chrome?: ChromeLike };
  const chromeStorage = chromeLike.chrome?.storage?.sync;
  if (chromeStorage) {
    return {
      get: (keys) =>
        new Promise((resolve, reject) => {
          chromeStorage.get(keys, (items) => {
            const error = chromeLike.chrome?.runtime?.lastError;
            if (error) {
              reject(new Error(error.message ?? "chrome.storage.sync.get failed."));
              return;
            }

            resolve(items);
          });
        }),
      set: (items) =>
        new Promise((resolve, reject) => {
          chromeStorage.set(items, () => {
            const error = chromeLike.chrome?.runtime?.lastError;
            if (error) {
              reject(new Error(error.message ?? "chrome.storage.sync.set failed."));
              return;
            }

            resolve();
          });
        })
    };
  }

  throw new Error("Extension storage.sync is not available in this runtime.");
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const asFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const asIndicatorStyle = (value: unknown, fallback: IndicatorStyle): IndicatorStyle => {
  if (typeof value === "string" && ALLOWED_INDICATOR_STYLES.has(value as IndicatorStyle)) {
    return value as IndicatorStyle;
  }

  return fallback;
};

const asBucketSeconds = (value: unknown, fallback: number): number => {
  const next = asFiniteNumber(value, fallback);
  return ALLOWED_BUCKET_SECONDS.has(next) ? next : fallback;
};

const asColor = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const readNested = (
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> => {
  const nested = source[key];
  return isObject(nested) ? nested : {};
};

const normalizeSettings = (raw: unknown): Settings => {
  const root = isObject(raw) ? raw : {};
  const declutter = readNested(root, "declutter");
  const mainFeed = readNested(declutter, "mainFeed");
  const channel = readNested(declutter, "channel");
  const sidebar = readNested(declutter, "sidebar");
  const globalSettings = readNested(declutter, "global");

  const heatmap = readNested(root, "heatmap");

  return {
    declutter: {
      mainFeed: {
        hideCarousel: asBoolean(mainFeed.hideCarousel, defaultSettings.declutter.mainFeed.hideCarousel),
        hideRecommendedStreams: asBoolean(
          mainFeed.hideRecommendedStreams,
          defaultSettings.declutter.mainFeed.hideRecommendedStreams
        ),
        hideMobileGames: asBoolean(mainFeed.hideMobileGames, defaultSettings.declutter.mainFeed.hideMobileGames),
        hideRecommendedCategories: asBoolean(
          mainFeed.hideRecommendedCategories,
          defaultSettings.declutter.mainFeed.hideRecommendedCategories
        ),
        hideCategoriesYoullLike: asBoolean(
          mainFeed.hideCategoriesYoullLike,
          defaultSettings.declutter.mainFeed.hideCategoriesYoullLike
        )
      },
      channel: {
        hideOfflinePreview: asBoolean(channel.hideOfflinePreview, defaultSettings.declutter.channel.hideOfflinePreview),
        hideViewersAlsoWatch: asBoolean(
          channel.hideViewersAlsoWatch,
          defaultSettings.declutter.channel.hideViewersAlsoWatch
        )
      },
      sidebar: {
        hideRecommendedChannels: asBoolean(
          sidebar.hideRecommendedChannels,
          defaultSettings.declutter.sidebar.hideRecommendedChannels
        ),
        hideRecommendedCategories: asBoolean(
          sidebar.hideRecommendedCategories,
          defaultSettings.declutter.sidebar.hideRecommendedCategories
        )
      },
      global: {
        hideGetAdFreeButton: asBoolean(
          globalSettings.hideGetAdFreeButton,
          defaultSettings.declutter.global.hideGetAdFreeButton
        )
      }
    },
    heatmap: {
      enabled: asBoolean(heatmap.enabled, defaultSettings.heatmap.enabled),
      bucketSeconds: asBucketSeconds(heatmap.bucketSeconds, defaultSettings.heatmap.bucketSeconds),
      watchedThresholdPct: clampNumber(
        asFiniteNumber(heatmap.watchedThresholdPct, defaultSettings.heatmap.watchedThresholdPct),
        50,
        100
      ),
      showOnTiles: asBoolean(heatmap.showOnTiles, defaultSettings.heatmap.showOnTiles),
      showOnPlayerBar: asBoolean(heatmap.showOnPlayerBar, defaultSettings.heatmap.showOnPlayerBar),
      indicatorStyle: asIndicatorStyle(heatmap.indicatorStyle, defaultSettings.heatmap.indicatorStyle),
      indicatorColor: asColor(heatmap.indicatorColor, defaultSettings.heatmap.indicatorColor),
      trackLiveStreams: asBoolean(heatmap.trackLiveStreams, defaultSettings.heatmap.trackLiveStreams),
      pauseWhenTabUnfocused: asBoolean(
        heatmap.pauseWhenTabUnfocused,
        defaultSettings.heatmap.pauseWhenTabUnfocused
      ),
      minWatchSecondsToRecord: Math.max(
        0,
        asFiniteNumber(heatmap.minWatchSecondsToRecord, defaultSettings.heatmap.minWatchSecondsToRecord)
      )
    }
  };
};

const extractSettingsPayload = (raw: unknown): unknown => {
  if (isObject(raw) && "settings" in raw) {
    return (raw as PersistedSettingsPayload).settings;
  }

  return raw;
};

export function migrateSettings(oldSettings: unknown, _version: number = SETTINGS_VERSION): Settings {
  return normalizeSettings(extractSettingsPayload(oldSettings));
}

export async function loadSettings(
  storage: SettingsStorageArea = getDefaultStorageArea()
): Promise<Settings> {
  const stored = await storage.get(STORAGE_KEY);
  return migrateSettings(stored[STORAGE_KEY], SETTINGS_VERSION);
}

export async function saveSettings(
  settings: Settings,
  storage: SettingsStorageArea = getDefaultStorageArea()
): Promise<Settings> {
  const normalized = migrateSettings(settings, SETTINGS_VERSION);
  await storage.set({
    [STORAGE_KEY]: {
      version: SETTINGS_VERSION,
      settings: normalized
    } satisfies PersistedSettingsPayload
  });

  return normalized;
}

export async function updateSettings(
  updater: (current: Settings) => Settings,
  storage: SettingsStorageArea = getDefaultStorageArea()
): Promise<Settings> {
  const current = await loadSettings(storage);
  const next = updater(current);
  return saveSettings(next, storage);
}
