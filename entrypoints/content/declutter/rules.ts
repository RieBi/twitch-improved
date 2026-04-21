import type { Settings } from "../../../lib/settings";
import { getSelector, type SelectorDef, type SelectorId } from "../../../lib/selectors";
import { isChannelScopedPath, isMainFeedPath, isVodPagePath } from "./routeMatch";

const allPages = (): boolean => true;

const mainFeedOnly = (url: URL): boolean => isMainFeedPath(url.pathname);
const channelScopedOnly = (url: URL): boolean => isChannelScopedPath(url.pathname);
const channelScopedOrVodOnly = (url: URL): boolean =>
  isChannelScopedPath(url.pathname) || isVodPagePath(url.pathname);

export interface DeclutterRule {
  id: SelectorId;
  selector: SelectorDef;
  pageMatch: (url: URL) => boolean;
  isEnabled: (settings: Settings) => boolean;
}

const makeRule = (
  id: SelectorId,
  pageMatch: (url: URL) => boolean,
  isEnabled: (settings: Settings) => boolean
): DeclutterRule => ({
  id,
  selector: getSelector(id),
  pageMatch,
  isEnabled
});

export const declutterRules: DeclutterRule[] = [
  makeRule("mainCarousel", mainFeedOnly, (settings) => settings.declutter.mainFeed.hideCarousel),
  makeRule("mainRecommendedStreams", mainFeedOnly, (settings) => settings.declutter.mainFeed.hideRecommendedStreams),
  makeRule("channelOfflinePreview", channelScopedOnly, (settings) => settings.declutter.channel.hideOfflinePreview),
  makeRule(
    "channelViewersAlsoWatch",
    channelScopedOrVodOnly,
    (settings) => settings.declutter.channel.hideViewersAlsoWatch
  ),
  makeRule(
    "sidebarRecommendedChannels",
    allPages,
    (settings) => settings.declutter.sidebar.hideRecommendedChannels
  ),
  makeRule(
    "sidebarRecommendedCategories",
    allPages,
    (settings) => settings.declutter.sidebar.hideRecommendedCategories
  ),
  makeRule("globalGetAdFreeButton", allPages, (settings) => settings.declutter.global.hideGetAdFreeButton)
];

const createHideRule = (selector: string): string => `${selector} { display: none !important; }`;

export const getActiveDeclutterRules = (settings: Settings, url: URL): DeclutterRule[] =>
  declutterRules.filter((rule) => rule.isEnabled(settings) && rule.pageMatch(url));

export const buildDeclutterCss = (settings: Settings, url: URL): string => {
  const activeRules = getActiveDeclutterRules(settings, url);
  if (activeRules.length === 0) {
    return "";
  }

  return activeRules
    .map((rule) => [rule.selector.primary, ...rule.selector.fallbacks].filter(Boolean))
    .flat()
    .map((selector) => createHideRule(selector))
    .join("\n");
};
