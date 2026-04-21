const RESERVED_LOGIN_SEGMENTS = new Set([
  "directory",
  "videos",
  "search",
  "settings",
  "downloads",
  "subscriptions",
  "inventory",
  "wallet",
  "turbo"
]);

const getFirstPathSegment = (pathname: string): string | null => {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ?? null;
};

export const isMainFeedPath = (pathname: string): boolean => pathname === "/";

export const isVodPagePath = (pathname: string): boolean => /^\/videos\/\d+\/?$/.test(pathname);

/** Numeric VOD id from `/videos/{id}` player path (allows trailing segments after the id). */
export const parseTwitchVodIdFromPathname = (pathname: string): string | null => {
  const match = /^\/videos\/(\d+)/.exec(pathname);
  if (!match) {
    return null;
  }

  return match[1] ?? null;
};

export const isChannelScopedPath = (pathname: string): boolean => {
  const segment = getFirstPathSegment(pathname);
  if (!segment || RESERVED_LOGIN_SEGMENTS.has(segment.toLowerCase())) {
    return false;
  }

  return true;
};

export const isChannelPagePath = (pathname: string): boolean => {
  const segment = getFirstPathSegment(pathname);
  if (!segment || RESERVED_LOGIN_SEGMENTS.has(segment.toLowerCase())) {
    return false;
  }

  return pathname === `/${segment}` || pathname === `/${segment}/` || pathname === `/${segment}/home`;
};

export const isChannelOrVodPagePath = (pathname: string): boolean =>
  isChannelPagePath(pathname) || isVodPagePath(pathname);

export const getChannelLoginFromPathname = (pathname: string): string | null => {
  const segment = getFirstPathSegment(pathname);
  if (!segment || RESERVED_LOGIN_SEGMENTS.has(segment.toLowerCase())) {
    return null;
  }

  return segment;
};

const isChannelVideosIndexPath = (pathname: string): boolean => {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length === 2 &&
    !RESERVED_LOGIN_SEGMENTS.has(segments[0].toLowerCase()) &&
    segments[1].toLowerCase() === "videos"
  );
};

/** Channel pages where a live broadcast may be playing (excludes `/login/videos` grid only). */
export const isLiveChannelSurfacePath = (pathname: string): boolean => {
  if (!getChannelLoginFromPathname(pathname)) {
    return false;
  }

  return !isChannelVideosIndexPath(pathname);
};
