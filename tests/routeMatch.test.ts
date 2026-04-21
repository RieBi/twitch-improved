import { describe, expect, it } from "vitest";

import {
  getChannelLoginFromPathname,
  isChannelPagePath,
  isLiveChannelSurfacePath,
  parseTwitchVodIdFromPathname
} from "../entrypoints/content/declutter/routeMatch";

describe("routeMatch live tracker paths", () => {
  it("isLiveChannelSurfacePath accepts channel subpages Twitch uses while live", () => {
    expect(isLiveChannelSurfacePath("/shroud")).toBe(true);
    expect(isLiveChannelSurfacePath("/shroud/")).toBe(true);
    expect(isLiveChannelSurfacePath("/shroud/home")).toBe(true);
    expect(isLiveChannelSurfacePath("/shroud/about")).toBe(true);
    expect(isLiveChannelSurfacePath("/shroud/schedule")).toBe(true);
  });

  it("isLiveChannelSurfacePath rejects channel VOD index and reserved roots", () => {
    expect(isLiveChannelSurfacePath("/shroud/videos")).toBe(false);
    expect(isLiveChannelSurfacePath("/directory")).toBe(false);
    expect(isLiveChannelSurfacePath("/videos/123")).toBe(false);
  });

  it("isChannelPagePath stays stricter than live surface (root + /home only)", () => {
    expect(isChannelPagePath("/shroud")).toBe(true);
    expect(isChannelPagePath("/shroud/about")).toBe(false);
    expect(isLiveChannelSurfacePath("/shroud/about")).toBe(true);
  });

  it("getChannelLoginFromPathname reads first segment when present", () => {
    expect(getChannelLoginFromPathname("/x/schedule")).toBe("x");
  });
});

describe("parseTwitchVodIdFromPathname", () => {
  it("parses VOD player path and optional trailing segment", () => {
    expect(parseTwitchVodIdFromPathname("/videos/123")).toBe("123");
    expect(parseTwitchVodIdFromPathname("/videos/123/")).toBe("123");
    expect(parseTwitchVodIdFromPathname("/videos/123/extra")).toBe("123");
  });

  it("returns null when not a VOD player path", () => {
    expect(parseTwitchVodIdFromPathname("/shroud")).toBeNull();
    expect(parseTwitchVodIdFromPathname("/shroud/videos")).toBeNull();
    expect(parseTwitchVodIdFromPathname("/videos/abc")).toBeNull();
  });
});
