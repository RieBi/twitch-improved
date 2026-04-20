import type { BridgeStreamMeta, BridgeVodMeta, BridgeVodTileMeta, MetadataSource } from "../../../lib/messaging";

export const installMainWorldMetadataBridge = (): void => {
  const BRIDGE_INSTALLED_KEY = "__tdMainWorldMetadataBridgeInstalled";
  const STREAM_EVENT_NAME = "td:stream-meta";
  const VOD_EVENT_NAME = "td:vod-meta";
  const VOD_TILE_EVENT_NAME = "td:vod-tile-meta";
  const TWITCH_GQL_HINT = "/gql";
  const TARGET_OPERATION_NAMES = new Set([
    "UseLive",
    "VideoMetadata",
    "ChannelRoot_Channel",
    "FilterableVideoTower_Videos"
  ]);

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const readString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  const readEpochMs = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string") {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }

      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return null;
  };

  const walk = (value: unknown, visitor: (node: Record<string, unknown>) => void): void => {
    const stack: unknown[] = [value];
    const visited = new Set<unknown>();

    while (stack.length > 0) {
      const current = stack.pop();
      if (!isRecord(current) && !Array.isArray(current)) {
        continue;
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (Array.isArray(current)) {
        for (const item of current) {
          stack.push(item);
        }
        continue;
      }

      visitor(current);
      for (const next of Object.values(current)) {
        stack.push(next);
      }
    }
  };

  const dispatchBridgeEvent = <T>(eventName: string, detail: T): void => {
    window.dispatchEvent(new CustomEvent<T>(eventName, { detail }));
  };

  const makeStreamSignature = (stream: BridgeStreamMeta): string =>
    `${stream.streamId}:${stream.channelId}:${stream.streamStartedAt}`;

  const makeVodSignature = (vod: BridgeVodMeta): string =>
    `${vod.vodId}:${vod.channelId}:${vod.durationSeconds ?? "na"}:${vod.createdAt ?? "na"}`;

  const extractChannel = (node: Record<string, unknown>): { channelId: string; channelLogin: string } | null => {
    const candidateNodes: unknown[] = [
      node,
      node.channel,
      node.user,
      node.owner,
      node.broadcaster
    ];

    for (const candidate of candidateNodes) {
      if (!isRecord(candidate)) {
        continue;
      }

      const channelId = readString(candidate.id);
      const channelLogin = readString(candidate.login);
      if (channelId && channelLogin) {
        return { channelId, channelLogin };
      }
    }

    return null;
  };

  const extractStreamMetas = (payload: unknown, source: MetadataSource): BridgeStreamMeta[] => {
    const found = new Map<string, BridgeStreamMeta>();
    const observedAt = Date.now();

    walk(payload, (node) => {
      const streamCandidates: unknown[] = [node.stream, node];

      for (const streamCandidate of streamCandidates) {
        if (!isRecord(streamCandidate)) {
          continue;
        }

        const streamId = readString(streamCandidate.id);
        const streamStartedAt = readEpochMs(streamCandidate.createdAt);

        if (!streamId || streamStartedAt === null) {
          continue;
        }

        const channel = extractChannel(streamCandidate) ?? extractChannel(node);
        if (!channel) {
          continue;
        }

        const stream: BridgeStreamMeta = {
          streamId,
          streamStartedAt,
          channelId: channel.channelId,
          channelLogin: channel.channelLogin,
          source,
          observedAt
        };
        found.set(makeStreamSignature(stream), stream);
        break;
      }
    });

    return Array.from(found.values());
  };

  const readDurationSeconds = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }

    return null;
  };

  const extractVod = (candidate: Record<string, unknown>, source: MetadataSource, observedAt: number): BridgeVodMeta | null => {
    const vodId = readString(candidate.id);
    if (!vodId) {
      return null;
    }

    const durationSeconds = readDurationSeconds(candidate.lengthSeconds ?? candidate.durationSeconds);
    const createdAt = readEpochMs(candidate.publishedAt ?? candidate.createdAt);
    const channel = extractChannel(candidate);

    if (!channel || durationSeconds === null) {
      return null;
    }

    return {
      vodId,
      channelId: channel.channelId,
      channelLogin: channel.channelLogin,
      durationSeconds,
      createdAt,
      source,
      observedAt
    };
  };

  const extractVodMetas = (payload: unknown, source: MetadataSource): BridgeVodMeta[] => {
    const found = new Map<string, BridgeVodMeta>();
    const observedAt = Date.now();

    walk(payload, (node) => {
      const candidates: unknown[] = [node.video, node];
      for (const candidate of candidates) {
        if (!isRecord(candidate)) {
          continue;
        }

        const vod = extractVod(candidate, source, observedAt);
        if (!vod) {
          continue;
        }

        found.set(makeVodSignature(vod), vod);
      }
    });

    return Array.from(found.values());
  };

  const isTwitchGqlRequest = (input: RequestInfo | URL): boolean => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : "";

    return url.includes(TWITCH_GQL_HINT);
  };

  const hasTargetOperation = (payload: unknown): boolean => {
    const operations = new Set<string>();

    walk(payload, (node) => {
      const operationName = readString(node.operationName);
      if (operationName) {
        operations.add(operationName);
      }
    });

    if (operations.size === 0) {
      return true;
    }

    for (const operation of operations) {
      if (TARGET_OPERATION_NAMES.has(operation)) {
        return true;
      }
    }

    return false;
  };

  const emitFromPayload = (payload: unknown, source: MetadataSource): void => {
    const streams = extractStreamMetas(payload, source);
    const vods = extractVodMetas(payload, source);

    for (const stream of streams) {
      dispatchBridgeEvent(STREAM_EVENT_NAME, stream);
    }

    for (const vod of vods) {
      dispatchBridgeEvent(VOD_EVENT_NAME, vod);
    }

    if (vods.length > 0) {
      const tileMeta: BridgeVodTileMeta = {
        source,
        observedAt: Date.now(),
        vods
      };
      dispatchBridgeEvent(VOD_TILE_EVENT_NAME, tileMeta);
    }
  };

  const emitFromApolloCache = (): void => {
    const apolloContainer = (window as Window & {
      __APOLLO_CLIENT__?: { cache?: { extract?: () => unknown } };
    }).__APOLLO_CLIENT__;

    const cacheExtract = apolloContainer?.cache?.extract;
    if (typeof cacheExtract !== "function") {
      return;
    }

    try {
      emitFromPayload(cacheExtract(), "apollo");
    } catch {
      // Twitch can change cache shape at any time; fail soft.
    }
  };

  const installFetchHook = (): void => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args: Parameters<typeof window.fetch>): Promise<Response> => {
      const response = await originalFetch(...args);
      const [input] = args;

      if (!isTwitchGqlRequest(input)) {
        return response;
      }

      try {
        const cloned = response.clone();
        const payload = await cloned.json();
        if (hasTargetOperation(payload)) {
          emitFromPayload(payload, "fetch");
          emitFromApolloCache();
        }
      } catch {
        // Non-JSON and opaque responses are expected; ignore.
      }

      return response;
    };
  };

  const bridgeWindow = window as Window & { [BRIDGE_INSTALLED_KEY]?: boolean };
  if (bridgeWindow[BRIDGE_INSTALLED_KEY]) {
    return;
  }

  bridgeWindow[BRIDGE_INSTALLED_KEY] = true;
  installFetchHook();
  emitFromApolloCache();
};

