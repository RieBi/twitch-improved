import type { BridgeStreamMeta, BridgeVodMeta, BridgeVodTileMeta } from "../../../lib/messaging";
import { getChannelLoginFromPathname } from "../declutter/routeMatch";

const STREAM_EVENT_NAME = "td:stream-meta";
export const VOD_EVENT_NAME = "td:vod-meta";
export const VOD_TILE_EVENT_NAME = "td:vod-tile-meta";
const SHOULD_LOG_METADATA = import.meta.env.DEV;
const isVodPage = (): boolean => window.location.pathname.startsWith("/videos/");

const metadataState = {
  initialized: false,
  latestStream: null as BridgeStreamMeta | null,
  latestVodById: new Map<string, BridgeVodMeta>(),
  latestTileBatch: null as BridgeVodTileMeta | null
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isValidStreamMeta = (value: unknown): value is BridgeStreamMeta => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.streamId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.channelLogin === "string" &&
    typeof value.streamStartedAt === "number" &&
    Number.isFinite(value.streamStartedAt)
  );
};

export const isValidVodMeta = (value: unknown): value is BridgeVodMeta => {
  if (!isRecord(value)) {
    return false;
  }

  const durationIsValid =
    typeof value.durationSeconds === "number" || value.durationSeconds === null;
  const createdAtIsValid = typeof value.createdAt === "number" || value.createdAt === null;

  return (
    typeof value.vodId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.channelLogin === "string" &&
    durationIsValid &&
    createdAtIsValid
  );
};

const isValidTileMeta = (value: unknown): value is BridgeVodTileMeta => {
  if (!isRecord(value) || !Array.isArray(value.vods)) {
    return false;
  }

  return value.vods.every((vod) => isValidVodMeta(vod));
};

const onStreamMeta = (event: Event): void => {
  if (!(event instanceof CustomEvent) || !isValidStreamMeta(event.detail)) {
    return;
  }

  const urlLogin = getChannelLoginFromPathname(window.location.pathname);
  if (
    urlLogin &&
    event.detail.channelLogin.toLowerCase() !== urlLogin.toLowerCase()
  ) {
    return;
  }

  metadataState.latestStream = event.detail;
  if (SHOULD_LOG_METADATA && !isVodPage()) {
    console.info("[td][metadata][live]", {
      streamStartedAt: event.detail.streamStartedAt,
      streamId: event.detail.streamId,
      channelId: event.detail.channelId,
      channelLogin: event.detail.channelLogin
    });
  }
};

const onVodMeta = (event: Event): void => {
  if (!(event instanceof CustomEvent) || !isValidVodMeta(event.detail)) {
    return;
  }

  metadataState.latestVodById.set(event.detail.vodId, event.detail);
  if (SHOULD_LOG_METADATA) {
    console.info("[td][metadata][vod]", {
      vodId: event.detail.vodId,
      channelId: event.detail.channelId,
      createdAt: event.detail.createdAt,
      durationSeconds: event.detail.durationSeconds
    });
  }
};

const onVodTileMeta = (event: Event): void => {
  if (!(event instanceof CustomEvent) || !isValidTileMeta(event.detail)) {
    return;
  }

  metadataState.latestTileBatch = event.detail;
  for (const vod of event.detail.vods) {
    metadataState.latestVodById.set(vod.vodId, vod);
  }
};

export const initStreamMetadata = (): void => {
  if (metadataState.initialized) {
    return;
  }

  metadataState.initialized = true;
  document.addEventListener(STREAM_EVENT_NAME, onStreamMeta);
  document.addEventListener(VOD_EVENT_NAME, onVodMeta);
  document.addEventListener(VOD_TILE_EVENT_NAME, onVodTileMeta);
};

export const getLatestStreamMeta = (): BridgeStreamMeta | null => metadataState.latestStream;

export const getLatestVodMeta = (vodId: string): BridgeVodMeta | null => {
  return metadataState.latestVodById.get(vodId) ?? null;
};

export const getLatestTileMeta = (): BridgeVodTileMeta | null => metadataState.latestTileBatch;

