import { describe, expect, it, vi } from "vitest";

import { defaultSettings, type Settings } from "../lib/settings";
import {
  shouldSuppressCarouselMedia,
  shouldSuppressChannelCarouselMedia,
  suppressMediaInContainer
} from "../entrypoints/content/declutter/mediaSuppression";

const withSettings = (mutator: (settings: Settings) => Settings): Settings =>
  mutator(structuredClone(defaultSettings));

describe("carousel media suppression gating", () => {
  it("suppresses only on main feed when hideCarousel is enabled", () => {
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

    expect(shouldSuppressCarouselMedia(settings, new URL("https://www.twitch.tv/"))).toBe(true);
    expect(shouldSuppressCarouselMedia(settings, new URL("https://www.twitch.tv/somechannel"))).toBe(false);
  });

  it("does not suppress when hideCarousel is disabled", () => {
    expect(shouldSuppressCarouselMedia(defaultSettings, new URL("https://www.twitch.tv/"))).toBe(false);
  });

  it("suppresses channel carousel only on channel root/home when hideOfflinePreview is enabled", () => {
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

    expect(shouldSuppressChannelCarouselMedia(settings, new URL("https://www.twitch.tv/somechannel"))).toBe(true);
    expect(shouldSuppressChannelCarouselMedia(settings, new URL("https://www.twitch.tv/somechannel/home"))).toBe(
      true
    );
    expect(shouldSuppressChannelCarouselMedia(settings, new URL("https://www.twitch.tv/directory"))).toBe(false);
  });
});

describe("suppressMediaInContainer", () => {
  it("mutes, pauses, and removes autoplay on every media node", () => {
    const firstPause = vi.fn();
    const secondPause = vi.fn();
    const firstMedia = {
      muted: false,
      volume: 1,
      removeAttribute: vi.fn(),
      pause: firstPause
    };
    const secondMedia = {
      muted: false,
      volume: 0.5,
      removeAttribute: vi.fn(),
      pause: secondPause
    };

    const root = {
      querySelectorAll: vi.fn(() => [firstMedia, secondMedia])
    };

    suppressMediaInContainer(root as unknown as ParentNode);

    expect(root.querySelectorAll).toHaveBeenCalledWith("video, audio");
    expect(firstMedia.muted).toBe(true);
    expect(firstMedia.volume).toBe(0);
    expect(firstMedia.removeAttribute).toHaveBeenCalledWith("autoplay");
    expect(firstPause).toHaveBeenCalledTimes(1);
    expect(secondMedia.muted).toBe(true);
    expect(secondMedia.volume).toBe(0);
    expect(secondMedia.removeAttribute).toHaveBeenCalledWith("autoplay");
    expect(secondPause).toHaveBeenCalledTimes(1);
  });
});
