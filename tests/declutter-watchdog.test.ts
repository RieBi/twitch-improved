import { describe, expect, it } from "vitest";

import { getSelector } from "../lib/selectors";
import { defaultSettings, type Settings } from "../lib/settings";
import { getActiveDeclutterRules } from "../entrypoints/content/declutter/rules";
import { evaluateSelectorMisses } from "../entrypoints/content/declutter/watchdog";

const withSettings = (mutator: (settings: Settings) => Settings): Settings =>
  mutator(structuredClone(defaultSettings));

describe("declutter watchdog", () => {
  it("reports required selector misses when fallback exists", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        mainFeed: {
          ...settings.declutter.mainFeed,
          hideCarousel: true
        }
      }
    }));

    const rules = getActiveDeclutterRules(settings, new URL("https://www.twitch.tv/"));
    const carousel = getSelector("mainCarousel");
    const misses = evaluateSelectorMisses(rules, (selector) => selector === carousel.fallbacks[0]);
    expect(misses).toContain("mainCarousel");
  });

  it("ignores optional selector misses", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        sidebar: {
          ...settings.declutter.sidebar,
          hideRecommendedCategories: true
        }
      }
    }));

    const rules = getActiveDeclutterRules(settings, new URL("https://www.twitch.tv/any-channel"));
    const misses = evaluateSelectorMisses(rules, () => false);
    expect(misses).toEqual([]);
  });
});
