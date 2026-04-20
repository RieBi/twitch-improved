import { describe, expect, it } from "vitest";

import {
  defaultSettings,
  loadSettings,
  migrateSettings,
  saveSettings,
  SETTINGS_VERSION,
  updateSettings,
  type SettingsStorageArea
} from "../lib/settings";

class MemoryStorageArea implements SettingsStorageArea {
  private data = new Map<string, unknown>();

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === undefined || keys === null) {
      return Object.fromEntries(this.data.entries());
    }

    if (typeof keys === "string") {
      return { [keys]: this.data.get(keys) };
    }

    return Object.fromEntries(keys.map((key) => [key, this.data.get(key)]));
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.data.set(key, value);
    }
  }
}

describe("settings.migrateSettings", () => {
  it("returns defaults for invalid payloads", () => {
    expect(migrateSettings(undefined)).toEqual(defaultSettings);
    expect(migrateSettings("invalid")).toEqual(defaultSettings);
    expect(migrateSettings(null)).toEqual(defaultSettings);
  });

  it("normalizes partial payloads and out-of-range values", () => {
    const migrated = migrateSettings({
      declutter: {
        mainFeed: {
          hideCarousel: true
        }
      },
      heatmap: {
        bucketSeconds: 17,
        watchedThresholdPct: 150,
        indicatorStyle: "unexpected",
        indicatorColor: " ",
        minWatchSecondsToRecord: -4
      }
    });

    expect(migrated.declutter.mainFeed.hideCarousel).toBe(true);
    expect(migrated.declutter.mainFeed.hideMobileGames).toBe(defaultSettings.declutter.mainFeed.hideMobileGames);
    expect(migrated.heatmap.bucketSeconds).toBe(defaultSettings.heatmap.bucketSeconds);
    expect(migrated.heatmap.watchedThresholdPct).toBe(100);
    expect(migrated.heatmap.indicatorStyle).toBe(defaultSettings.heatmap.indicatorStyle);
    expect(migrated.heatmap.indicatorColor).toBe(defaultSettings.heatmap.indicatorColor);
    expect(migrated.heatmap.minWatchSecondsToRecord).toBe(0);
  });
});

describe("settings storage adapter", () => {
  it("saves normalized settings with version and loads them back", async () => {
    const storage = new MemoryStorageArea();

    const saved = await saveSettings(
      {
        ...defaultSettings,
        heatmap: {
          ...defaultSettings.heatmap,
          bucketSeconds: 10,
          watchedThresholdPct: 75
        }
      },
      storage
    );

    expect(saved.heatmap.bucketSeconds).toBe(10);

    const raw = await storage.get("settings");
    expect(raw.settings).toEqual({
      version: SETTINGS_VERSION,
      settings: saved
    });

    const loaded = await loadSettings(storage);
    expect(loaded).toEqual(saved);
  });

  it("supports updateSettings with current-state callback", async () => {
    const storage = new MemoryStorageArea();
    await saveSettings(defaultSettings, storage);

    const updated = await updateSettings(
      (current) => ({
        ...current,
        declutter: {
          ...current.declutter,
          channel: {
            ...current.declutter.channel,
            hideOfflinePreview: true
          }
        }
      }),
      storage
    );

    expect(updated.declutter.channel.hideOfflinePreview).toBe(true);
    expect((await loadSettings(storage)).declutter.channel.hideOfflinePreview).toBe(true);
  });

  it("supports chrome callback storage when browser storage is unavailable", async () => {
    const storageData = new Map<string, unknown>();
    const previousChrome = (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    const previousBrowser = (globalThis as typeof globalThis & { browser?: unknown }).browser;

    delete (globalThis as typeof globalThis & { browser?: unknown }).browser;
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {},
      storage: {
        sync: {
          get(keys: string | string[] | null | undefined, callback: (items: Record<string, unknown>) => void) {
            if (typeof keys === "string") {
              callback({ [keys]: storageData.get(keys) });
              return;
            }

            if (Array.isArray(keys)) {
              callback(Object.fromEntries(keys.map((key) => [key, storageData.get(key)])));
              return;
            }

            callback(Object.fromEntries(storageData.entries()));
          },
          set(items: Record<string, unknown>, callback?: () => void) {
            for (const [key, value] of Object.entries(items)) {
              storageData.set(key, value);
            }
            callback?.();
          }
        }
      }
    };

    try {
      const next = {
        ...defaultSettings,
        declutter: {
          ...defaultSettings.declutter,
          global: {
            hideGetAdFreeButton: true
          }
        }
      };

      await saveSettings(next);
      const loaded = await loadSettings();
      expect(loaded.declutter.global.hideGetAdFreeButton).toBe(true);
    } finally {
      if (previousBrowser === undefined) {
        delete (globalThis as typeof globalThis & { browser?: unknown }).browser;
      } else {
        (globalThis as typeof globalThis & { browser?: unknown }).browser = previousBrowser;
      }

      if (previousChrome === undefined) {
        delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
      } else {
        (globalThis as typeof globalThis & { chrome?: unknown }).chrome = previousChrome;
      }
    }
  });
});
