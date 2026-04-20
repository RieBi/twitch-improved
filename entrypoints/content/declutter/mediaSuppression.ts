import type { Settings } from "../../../lib/settings";
import { isChannelPagePath, isMainFeedPath } from "./routeMatch";

export const shouldSuppressCarouselMedia = (settings: Settings, url: URL): boolean =>
  settings.declutter.mainFeed.hideCarousel && isMainFeedPath(url.pathname);

export const shouldSuppressChannelCarouselMedia = (settings: Settings, url: URL): boolean =>
  settings.declutter.channel.hideOfflinePreview && isChannelPagePath(url.pathname);

export const suppressMediaInContainer = (container: ParentNode): void => {
  const mediaNodes = container.querySelectorAll<HTMLMediaElement>("video, audio");
  for (const media of mediaNodes) {
    media.muted = true;
    media.volume = 0;
    media.removeAttribute("autoplay");
    media.pause();
  }
};
