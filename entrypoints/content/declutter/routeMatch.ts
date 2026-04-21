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
