export type SelectorHealth = "required" | "optional";

export type SelectorId =
  | "mainCarousel"
  | "mainRecommendedStreams"
  | "channelOfflinePreview"
  | "channelViewersAlsoWatch"
  | "sidebarRecommendedChannels"
  | "sidebarRecommendedCategories"
  | "globalGetAdFreeButton";

export interface SelectorDef {
  id: SelectorId;
  primary: string;
  fallbacks: string[];
  health: SelectorHealth;
}

export const selectors: Record<SelectorId, SelectorDef> = {
  mainCarousel: {
    id: "mainCarousel",
    primary: '[data-a-target="front-page-carousel"]',
    fallbacks: ['[data-a-target="top-carousel"]'],
    health: "required"
  },
  mainRecommendedStreams: {
    id: "mainRecommendedStreams",
    primary: '[data-td-hide="main-feed-below-carousel"]',
    fallbacks: [],
    health: "optional"
  },
  channelOfflinePreview: {
    id: "channelOfflinePreview",
    primary: '[class~="persistent-player"]:has([data-a-player-type="channel_home_carousel"])',
    fallbacks: [
      '[data-a-target="home-offline-carousel"]',
      '[data-a-player-type="channel_home_carousel"]',
      '[class~="home-video__wrapper"]',
      '[class~="home-carousel-info"]'
    ],
    health: "required"
  },
  channelViewersAlsoWatch: {
    id: "channelViewersAlsoWatch",
    primary: '.side-nav-section ~ .side-nav-section',
    fallbacks: ['[data-td-hide="channel-viewers-also-watch"]'],
    health: "optional"
  },
  sidebarRecommendedChannels: {
    id: "sidebarRecommendedChannels",
    primary: 'nav [aria-label="Recommended Channels"]',
    fallbacks: ['nav [aria-label="Live Channels"]'],
    health: "optional"
  },
  sidebarRecommendedCategories: {
    id: "sidebarRecommendedCategories",
    primary: 'nav [aria-label="Recommended Categories"]',
    fallbacks: ['nav [data-a-target="recommended-categories"]'],
    health: "optional"
  },
  globalGetAdFreeButton: {
    id: "globalGetAdFreeButton",
    primary: '[data-td-hide="global-get-ad-free-button"]',
    fallbacks: [],
    health: "optional"
  }
};

export const getSelector = (id: SelectorId): SelectorDef => selectors[id];
