import { describe, expect, it } from "vitest";

import { defaultSettings, type Settings } from "../lib/settings";
import { buildDeclutterCss, getActiveDeclutterRules } from "../entrypoints/content/declutter/rules";

const withSettings = (mutator: (settings: Settings) => Settings): Settings =>
  mutator(structuredClone(defaultSettings));

describe("declutter rules", () => {
  it("builds no css when all declutter toggles are disabled", () => {
    const css = buildDeclutterCss(defaultSettings, new URL("https://www.twitch.tv/"));
    expect(css).toBe("");
  });

  it("builds css for enabled main feed selector rules", () => {
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

    const css = buildDeclutterCss(settings, new URL("https://www.twitch.tv/"));
    expect(css).toContain('[data-a-target="front-page-carousel"]');
    expect(css).toContain("display: none !important;");
  });

  it("maps hideRecommendedStreams to hide everything below the carousel", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        mainFeed: {
          ...settings.declutter.mainFeed,
          hideRecommendedStreams: true
        }
      }
    }));

    const css = buildDeclutterCss(settings, new URL("https://www.twitch.tv/"));
    expect(css).toContain('[data-td-hide="main-feed-below-carousel"]');
  });

  it("maps hideGetAdFreeButton to tagged ad-free button selector", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        global: {
          ...settings.declutter.global,
          hideGetAdFreeButton: true
        }
      }
    }));

    const css = buildDeclutterCss(settings, new URL("https://www.twitch.tv/somechannel"));
    expect(css).toContain('[data-td-hide="global-get-ad-free-button"]');
  });

  it("keeps channel-root rules off reserved top-level routes", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        channel: {
          ...settings.declutter.channel,
          hideOfflinePreview: true
        }
      }
    }));

    const reservedActiveRules = getActiveDeclutterRules(
      settings,
      new URL("https://www.twitch.tv/directory")
    );

    expect(reservedActiveRules.some((rule) => rule.id === "channelOfflinePreview")).toBe(false);
  });

  it("maps viewers also watch to structural side-nav selector", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        channel: {
          ...settings.declutter.channel,
          hideViewersAlsoWatch: true
        }
      }
    }));

    const css = buildDeclutterCss(settings, new URL("https://www.twitch.tv/somechannel"));
    expect(css).toContain(".side-nav-section ~ .side-nav-section");
  });

  it("applies viewers also watch rule on VOD pages", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        channel: {
          ...settings.declutter.channel,
          hideViewersAlsoWatch: true
        }
      }
    }));

    const activeRules = getActiveDeclutterRules(settings, new URL("https://www.twitch.tv/videos/123456789"));
    expect(activeRules.some((rule) => rule.id === "channelViewersAlsoWatch")).toBe(true);
  });

  it("activates channel page rules on /home route", () => {
    const settings = withSettings((settings) => ({
      ...settings,
      declutter: {
        ...settings.declutter,
        channel: {
          ...settings.declutter.channel,
          hideOfflinePreview: true
        }
      }
    }));

    const activeRules = getActiveDeclutterRules(settings, new URL("https://www.twitch.tv/somechannel/home"));
    expect(activeRules.some((rule) => rule.id === "channelOfflinePreview")).toBe(true);
  });
});
