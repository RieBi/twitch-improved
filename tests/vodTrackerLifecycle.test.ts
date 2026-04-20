import { describe, expect, it } from "vitest";

import { createVodTrackerLifecycle } from "../entrypoints/content/tracker/vodTrackerLifecycle";

describe("vodTracker lifecycle", () => {
  it("does not duplicate tracker for same VOD route and stops on route exits", async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createVodTrackerLifecycle(async (vodId) => {
      starts.push(vodId);
      return {
        vodId,
        stop: async () => {
          stops.push(vodId);
        }
      };
    });

    await lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    await lifecycle.sync(new URL("https://www.twitch.tv/videos/100"));
    await lifecycle.sync(new URL("https://www.twitch.tv/videos/200"));
    await lifecycle.sync(new URL("https://www.twitch.tv/some_channel"));
    await lifecycle.stop();

    expect(starts).toEqual(["100", "200"]);
    expect(stops).toEqual(["100", "200"]);
  });

  it("handles rapid sync calls without duplicate same-vod starts", async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    const lifecycle = createVodTrackerLifecycle(async (vodId) => {
      starts.push(vodId);
      await Promise.resolve();
      return {
        vodId,
        stop: async () => {
          stops.push(vodId);
        }
      };
    });

    await Promise.all([
      lifecycle.sync(new URL("https://www.twitch.tv/videos/100")),
      lifecycle.sync(new URL("https://www.twitch.tv/videos/100")),
      lifecycle.sync(new URL("https://www.twitch.tv/videos/200"))
    ]);
    await lifecycle.stop();

    expect(starts).toEqual(["100", "200"]);
    expect(stops).toEqual(["100", "200"]);
  });
});

