# Twitch Declutter & Watch Heatmap — Architectural Specification

**Target:** Chrome (primary) + Firefox, Manifest V3, TypeScript.

Two-part browser extension:

- **Part 1 — Declutter:** Hide non-followed-channel recommendation modules on main feed and channel pages via user-configurable toggles.
- **Part 2 — Watch Heatmap:** Track watched segments of Twitch VODs *and of live streams*, map live-viewing to the resulting VOD, render a multi-segment heatmap bar on VOD thumbnails and in the VOD player, plus a "watched" indicator when a configurable completion threshold is reached or the user marks it manually.

---

## 1. Tech stack & tooling

- **Manifest V3**, cross-browser via `**[wxt](https://wxt.dev)`** (handles MV3 quirks, per-browser manifest generation, HMR).
- **TypeScript** everywhere.
- **React** in the options page only.
- **Vanilla DOM + CSS** for content-script injected UI (heatmap bar, buttons). No framework overhead in the hot path.
- `**webextension-polyfill`** for `browser.*` in Chrome (wxt wires this up).
- **Storage:**
  - `browser.storage.sync` — settings only.
  - **IndexedDB** via `[idb](https://github.com/jakearchibald/idb)` — watch history, live-session records.
- Testing: **Vitest** + `**fake-indexeddb`**. No E2E in v1.

### Cross-browser notes

MV3 service workers differ slightly between Chrome (true SW, short-lived) and Firefox (event page with longer lifetime). `wxt` + `idb` (which reopens lazily) handle both. Cost of Firefox support is negligible.

---

## 2. Directory layout

```
twitch-decluttered/
├─ wxt.config.ts
├─ tsconfig.json
├─ package.json
├─ entrypoints/
│  ├─ background.ts                # service worker: owns IDB, GC, broadcast
│  ├─ content/
│  │  ├─ index.ts                  # bootstrap + SPA route observer
│  │  ├─ declutter/
│  │  │  ├─ index.ts               # style rule orchestrator
│  │  │  └─ rules.ts               # DeclutterRule[] definitions
│  │  ├─ tracker/
│  │  │  ├─ index.ts               # page-type dispatch (vod|live|other)
│  │  │  ├─ vodTracker.ts          # VOD watch-session sampler
│  │  │  ├─ liveTracker.ts         # live-stream sampler
│  │  │  ├─ segmentBuffer.ts       # samples → ranges, flush to background
│  │  │  ├─ playerProbe.ts         # finds <video>, exposes state
│  │  │  └─ streamMetadata.ts      # reads Apollo cache / GQL responses
│  │  ├─ heatmap/
│  │  │  ├─ index.ts               # MutationObserver for VOD tiles
│  │  │  ├─ tileRenderer.ts        # injects heatmap + watched-indicator on tiles
│  │  │  ├─ playerBarRenderer.ts   # injects heatmap on VOD player scrub bar
│  │  │  ├─ markWatchedButton.ts   # hover button on tile + player-page button
│  │  │  └─ styles.css             # scoped (.td-*) styles
│  │  └─ injected/
│  │     └─ mainWorld.ts           # main-world bridge for window.__APOLLO_CLIENT__
│  └─ options/                     # React options page
│     ├─ index.html
│     ├─ main.tsx
│     └─ components/...
├─ lib/
│  ├─ db/
│  │  ├─ schema.ts                 # IDB schema + migrations
│  │  ├─ repo.ts                   # typed CRUD
│  │  └─ gc.ts                     # garbage collection
│  ├─ selectors.ts                 # single source of truth for DOM targets
│  ├─ messaging.ts                 # typed message passing
│  ├─ settings.ts                  # schema, defaults, storage adapter
│  └─ util/
│     ├─ ranges.ts                 # merge/query watched-range arrays (pure, tested)
│     ├─ throttle.ts
│     └─ log.ts
└─ tests/
   ├─ ranges.test.ts
   ├─ repo.test.ts
   └─ linking.test.ts
```

---

## 3. Data model

### 3.1 Settings (stored in `storage.sync`)

```ts
interface Settings {
  declutter: {
    mainFeed: {
      hideCarousel: boolean;              // top autoplaying carousel
      hideRecommendedStreams: boolean;    // "Live channels we think you'll like"
      hideMobileGames: boolean;
      hideRecommendedCategories: boolean; // "Recommended Categories"
      hideCategoriesYoullLike: boolean;   // "Categories we think you'll like"
    };
    channel: {
      hideOfflinePreview: boolean;        // "Check out this Valheim stream from X hours ago"
      hideViewersAlsoWatch: boolean;      // sidebar "Viewers also watch"
    };
    sidebar: {
      hideRecommendedChannels: boolean;   // "Live Channels" (non-followed) block
      hideRecommendedCategories: boolean; // "Recommended Categories" block
    };
    global: {
      hideGetAdFreeButton: boolean;       // optional QoL
    };
  };
  heatmap: {
    enabled: boolean;
    bucketSeconds: number;                // default 5
    watchedThresholdPct: number;          // default 85
    showOnTiles: boolean;                 // default true
    showOnPlayerBar: boolean;             // default true
    indicatorStyle: 'grayout' | 'border' | 'both';  // default 'both'
    indicatorColor: string;               // default '#9147ff'
    trackLiveStreams: boolean;            // default true
    pauseWhenTabUnfocused: boolean;       // default true
    minWatchSecondsToRecord: number;      // default 10; drop drive-by glimpses
  };
}
```

Settings have a central `defaultSettings` const and a `migrateSettings(old, version)` function for forward compat.

### 3.2 IndexedDB (`twitch-decluttered`, v1)

**Store `vods`** — keyed by `vodId`.

```ts
interface VodRecord {
  vodId: string;                  // Twitch video ID, e.g. "1234567890"
  channelId: string;
  channelLogin: string;
  durationSeconds: number | null; // filled when first known
  createdAt: number | null;       // VOD publish epoch ms, for live-session linking
  ranges: [number, number][];     // VOD-relative seconds, sorted non-overlapping
  totalWatchedSeconds: number;    // cached sum
  markedWatched: boolean;         // manual flag
  lastUpdated: number;
}
```

**Store `liveSessions`** — keyed by `sessionId` = `${channelId}:${streamStartedAt}`.

```ts
interface LiveSessionRecord {
  sessionId: string;
  channelId: string;
  channelLogin: string;
  streamStartedAt: number;        // epoch ms, reliable anchor
  ranges: [number, number][];     // seconds-since-stream-start
  linkedVodId: string | null;     // set once matched
  lastUpdated: number;
}
```

**Store `channels`** — keyed by `channelId`, lightweight metadata cache (login, displayName, lastSeen).

**Indexes:**

- `vods.by_channel` on `channelId`
- `vods.by_lastUpdated` on `lastUpdated` (GC)
- `liveSessions.by_channel_startedAt` compound `[channelId, streamStartedAt]` (VOD linking)
- `liveSessions.by_linked` on `linkedVodId`

All writes go through the background service worker. Content scripts only message.

---

## 4. Part 1 — Declutter

### 4.1 Strategy

**CSS, not DOM removal.** Twitch re-mounts React subtrees frequently; removing nodes just triggers re-adds. Inject a single `<style id="td-declutter">` whose content is generated from active settings; toggling a setting rewrites the stylesheet.

### 4.2 Rule shape

```ts
interface DeclutterRule {
  id: string;               // matches a leaf path in Settings.declutter
  pageMatch: (url: URL) => boolean;
  selector: SelectorDef;    // from lib/selectors.ts
  css: string;              // template; selectorDef.primary is substituted in
}
```

### 4.3 Selector targets (starting hypothesis — verify at build time)

Twitch ships hashed CSS classes; **prefer `data-a-target` and `data-test-selector`**, fall back to ARIA role + heading text matching with `:has()`. Never use hashed class names.


| Setting                                | Starting selector                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Main carousel                          | `[data-a-target="front-page-carousel"]`                                                                                  |
| "Live channels we think you'll like"   | section containing `h2` with matching text; attribute probably `data-target="directory-first-rec-shelf"`                 |
| Mobile Games shelf                     | section whose heading text matches `/^Mobile Games$/`                                                                    |
| Recommended Categories (main)          | section whose heading text matches `/^Recommended Categories$/`                                                          |
| Categories "we think you'll like"      | section whose heading text matches `/Categories.*you'?ll like/i`                                                         |
| Offline preview on channel page        | `[data-test-selector="video-player__video-layout-offline"]`; also the recommendation-banner variant seen in screenshot 2 |
| Sidebar recommended channels           | `nav` section with heading `Live Channels` or aria-label `Recommended Channels`                                          |
| Sidebar recommended categories         | nav section with heading `Recommended Categories`                                                                        |
| "Viewers also watch" (channel sidebar) | section with heading `Viewers Also Watch`                                                                                |
| Get Ad-Free button                     | `button[aria-label*="Ad-Free" i]`                                                                                        |


For heading-based matches where a stable attribute is missing, CSS4 `:has()` works in all modern Chromium and Firefox releases:

```css
section:has(> h2[data-testid="card-heading"]:first-of-type:--matches-text("Mobile Games")) { display: none; }
```

`:--matches-text` isn't native — use a tiny JS pass instead: on each MutationObserver tick, walk candidate sections and add a `data-td-hide="mobile-games"` attribute; CSS hides by that attribute. This keeps the fast path CSS-only while letting JS do text matching where needed.

### 4.4 Selector resilience

`lib/selectors.ts` holds one entry per target:

```ts
interface SelectorDef {
  id: string;
  primary: string;
  fallbacks: string[];
  health: 'required' | 'optional';
}
```

A 30-second watchdog verifies the `primary` element exists on the relevant page. Misses are reported via `runtime.sendMessage` to background, buffered in a ring buffer (last 100), surfaced in **Options → Diagnostics**. This is the single most important defense against Twitch markup churn.

---

## 5. Part 2 — Watch heatmap

### 5.1 Page-type detection

`content/index.ts` listens to `popstate` and patches `history.pushState`/`replaceState` (Twitch's SPA router) to re-detect on every navigation. URL → mode:


| URL pattern          | Mode                                                        |
| -------------------- | ----------------------------------------------------------- |
| `/videos/{id}`       | VOD player — start `vodTracker` + render player-bar heatmap |
| `/{login}` (live)    | Live channel — start `liveTracker`                          |
| `/{login}` (offline) | render tile heatmaps on "Recent broadcasts"                 |
| `/{login}/videos`    | render tile heatmaps on VOD grid                            |
| `/directory/...`     | render tile heatmaps on any VOD tiles present               |
| `/search`            | render tile heatmaps                                        |


Reserved words (`directory`, `videos`, `search`, `settings`, etc.) excluded from the `/{login}` match.

### 5.2 VOD tracking (`vodTracker.ts`)

1. Extract `vodId` from URL.
2. Read VOD metadata (duration, channel, `createdAt`) from Apollo cache (see §5.5).
3. Locate `<video>` via `playerProbe` with MutationObserver retry (Twitch lazy-loads).
4. Sampler @ 1 Hz. Each tick, skip if:
  - `video.paused || video.ended || video.readyState < 3`, or
  - `settings.pauseWhenTabUnfocused && document.hidden`.
   Otherwise emit sample `{ wallClockMs, currentTime }`.
5. `segmentBuffer` folds samples into ranges:
  - Consecutive samples where `|Δ currentTime − Δ wallClock / 1000| < 0.5 s` extend the current range.
  - Discontinuities (seek, rewind) close the range and open a new one.
  - Range endpoints quantized to `bucketSeconds` at flush time (not at sample time).
6. **Flush** every 10 s, on `visibilitychange=hidden`, and on `beforeunload`. Flushing sends `{ type: 'flushRanges', kind: 'vod', vodId, ranges }` to background. Background merges into stored `ranges` via `ranges.merge`, recomputes `totalWatchedSeconds`, writes, and broadcasts `vodRecordChanged`.
7. MV3 note: never rely on `pagehide` for async work. Use `visibilitychange=hidden` as the primary flush trigger; unload is best-effort.

### 5.3 Live tracking (`liveTracker.ts`)

**Problem:** watched segments during live must later become VOD-relative timestamps, but the VOD may not exist yet.

**Solution:** record everything as **seconds since stream start**. Match to VOD when it appears.

1. On live channel page load, extract from Apollo cache: `stream.id`, `stream.createdAt` (→ `streamStartedAt` epoch ms), `channel.id`, `channel.login`.
2. `sessionId = \`${channelId}:${streamStartedAt}`.
3. Sampler @ 1 Hz. For each tick, compute stream-relative position:
  ```
   liveEdgeSec   = (Date.now() - streamStartedAt) / 1000
   rewindOffset  = video.seekable.length > 0
                     ? video.seekable.end(0) - video.currentTime
                     : 0
   streamPosSec  = liveEdgeSec - rewindOffset
  ```
4. Feed into `segmentBuffer` as if stream-position were the timeline. Flush into `liveSessions` store.

**Edge cases:**

- **Stream restart within same URL visit:** `streamStartedAt` changes → new `sessionId`. Detect on next metadata sample; start a fresh session.
- **Clock skew:** bounded by the `±10 min` VOD-matching tolerance, so ±few seconds is irrelevant.
- **DVR buffer rollover on very long streams:** irrelevant — math uses only `seekable.end(0) - currentTime`.
- **GQL uptime vs actual stream start:** always use `stream.createdAt` from GQL, never the UI uptime indicator.

### 5.4 VOD ↔ live-session linking

Two triggers:

**(a) When a `VodRecord` is created/updated:**

1. Query `liveSessions.by_channel_startedAt` for same `channelId` with `|streamStartedAt − vod.createdAt| < 10 min` and `linkedVodId == null`.
2. For each match:
  - `offset = (streamStartedAt − vod.createdAt) / 1000` (usually ≈ 0, sometimes small positive).
  - Translate `liveSession.ranges` by `offset` → VOD seconds. Clamp to `[0, durationSeconds]`.
  - Merge into `vod.ranges`; set `liveSession.linkedVodId = vod.vodId`.

**(b) Periodic background sweep (once/hour):**
Scan unlinked sessions older than 30 min against known VODs. Catches the case where the user never revisits the channel after the VOD appears.

Tolerance of 10 min is deliberately loose — Twitch's `vod.createdAt` is usually identical to `stream.createdAt` to the second, but this absorbs any quirk.

### 5.5 Reading Twitch metadata (`streamMetadata.ts` + `injected/mainWorld.ts`)

`window.__APOLLO_CLIENT__` lives in the page's main world; content-script isolated world can't see it directly.

**Bridge:**

- `mainWorld.ts` injected via `scripting.executeScript({ world: 'MAIN' })` (Chrome) / equivalent Firefox path.
- It reads `__APOLLO_CLIENT__.cache.extract()` and also hooks `fetch` to capture Twitch GQL responses (operation names: `UseLive`, `VideoMetadata`, `ChannelRoot_Channel`, `FilterableVideoTower_Videos`).
- Communicates with isolated world via `CustomEvent`s (`td:stream-meta`, `td:vod-meta`, `td:vod-tile-meta`).

**No outbound GQL calls of our own** — would need a client ID and invite rate-limit issues. Piggyback on what Twitch already fetches.

**Fallback when Apollo cache shape changes:** the `fetch` hook is the durable path; Apollo cache access is the fast path.

### 5.6 Ranges utility (`lib/util/ranges.ts`)

Pure, unit-tested:

```ts
type Range = [number, number];  // [start, end), seconds

function merge(existing: Range[], incoming: Range[]): Range[];
function totalDuration(ranges: Range[]): number;
function coveragePct(ranges: Range[], totalDuration: number): number;
function quantize(ranges: Range[], bucketSec: number): Range[];
function offset(ranges: Range[], deltaSec: number): Range[];
function clamp(ranges: Range[], min: number, max: number): Range[];
```

Standard sweep-line merge. Quantization done at store time to cap storage cost.

**Storage cost estimate:** an 8-hour VOD watched in 5 s buckets with 20 viewing sessions → worst case ~5760 range entries, but merging collapses them to ≲ 100 real ranges. Each range is ~24 bytes in IDB → ≲ 3 KB per VOD. Negligible.

### 5.7 Tile heatmap rendering (`heatmap/tileRenderer.ts`)

**Detection:**

- MutationObserver on Twitch's main content root (not `document.body` — too noisy).
- Per candidate added node, find descendant `a[href^="/videos/"]`. Extract vodId from href.
- Dedupe: each tile tagged with `data-td-processed="{vodId}@{lastUpdated}"`; skip if unchanged.

**Batch lookup:**

- Content script accumulates new vodIds for 50 ms, then sends `getVodRecords({ ids })` to background in one batch. Background responds with a map. This avoids N concurrent IDB transactions.

**Render per tile:**

- Inject `<div class="td-heatmap">` absolutely positioned at bottom of thumbnail image (not the tile container — avoids layout shift).
- One child `<div class="td-heatmap-seg">` per range; `left` and `width` as percentages of `durationSeconds`.
- If `durationSeconds` unknown, parse the tile's own `HH:MM:SS` badge (top-left of thumbnail) as fallback and cache back into the record.
- If `markedWatched || coveragePct >= threshold`:
  - `grayout`: add class setting `filter: grayscale(0.7) brightness(0.6)` on thumbnail img.
  - `border`: `box-shadow: inset 0 0 0 2px var(--td-indicator-color)` on thumbnail wrapper.
  - `both`: both.

**Live updates:** on `vodRecordChanged` broadcast, find the matching tile by `data-td-processed` prefix and re-render just that one.

**Styles isolation:** single `styles.css` bundled; all selectors prefixed `.td-`. CSS vars `--td-indicator-color` driven by settings.

### 5.8 Player-bar heatmap (`heatmap/playerBarRenderer.ts`)

Overlay a 3–4 px heatmap strip directly above Twitch's native scrub bar on VOD player pages. Same range data, rendered at player width. Re-attach on fullscreen and resize events (ResizeObserver on the player wrapper).

Do **not** render on live streams — position semantics are muddy and value is low.

### 5.9 "Mark as watched" UX (`markWatchedButton.ts`)

- **On tile hover:** small round button in thumbnail's top-right corner with `✓` icon. Click toggles `markedWatched`. Visible only on hover.
- **On VOD player page:** small button in the metadata area below the player, next to title. Text toggles "Mark watched" / "Unmark watched".
- **No keyboard shortcut** in v1.

### 5.10 Background worker duties

- Sole owner of IDB. All reads/writes go through typed messages.
- Batches tile-record fetches.
- Broadcasts `vodRecordChanged` to all tabs on write.
- **GC** runs on SW startup (throttled to once per 24 h via a timestamp in `storage.local`):
  - Delete `vods` where `lastUpdated` > 60 days ago **and** `!markedWatched`.
  - Delete `liveSessions` linked to a VOD **and** older than 60 days (data already copied).
  - Delete `liveSessions` unlinked and older than 14 days (Twitch's typical VOD retention; if no VOD by now, there never will be one).
- Options page exposes: storage usage, **Clear all**, **Export JSON**, **Import JSON**.
- Export: serialize all three stores → JSON Blob → object URL → `chrome.downloads.download`.
- Import: parse JSON, validate shape, merge (user choice: replace vs merge).

---

## 6. Options UI

Single-page React app, dark theme by default, styled to sit comfortably alongside Twitch (purple accent `#9147ff`). Layout inspiration is DF Tube's compact checkboxed panel, but with proper spacing, section dividers, and clear typography.

Three sections:

1. **Declutter** — grouped checkboxes mirroring `Settings.declutter`. Each has a `(?)` tooltip showing an example of what disappears.
2. **Watch heatmap** — enable toggle, threshold slider (50–100 %), bucket seconds (1/5/10/30), indicator style radio, color picker, toggles for tile/player-bar display, live-tracking toggle, unfocused-pause toggle, min-seconds-to-record input.
3. **Data** — storage usage readout (`navigator.storage.estimate()`), Clear all (with confirm), Export / Import JSON, **Diagnostics** panel (selector health + recent errors).

Settings persist to `storage.sync`; content scripts subscribe via `storage.onChanged` and apply live without page reload.

---

## 7. Messaging contract (`lib/messaging.ts`)

Typed discriminated union:

```ts
type Msg =
  | { type: 'flushRanges'; kind: 'vod'; vodId: string; meta: VodMeta; ranges: Range[] }
  | { type: 'flushRanges'; kind: 'live'; sessionId: string; meta: LiveMeta; ranges: Range[] }
  | { type: 'getVodRecords'; ids: string[] }
  | { type: 'toggleMarkedWatched'; vodId: string }
  | { type: 'reportSelectorMiss'; id: string; url: string }
  | { type: 'settingsChanged' }
  | { type: 'vodRecordChanged'; vodId: string; record: VodRecord };
```

A `sendMsg<T>(msg): Promise<Response<T>>` helper with exhaustive handling on the background side.

---

## 8. Testing

- **Unit tests (Vitest)** for:
  - `lib/util/ranges.ts` — merge, coverage, quantization, offset, clamp, many edge cases.
  - `lib/db/repo.ts` with `fake-indexeddb` — CRUD, indexes, migrations.
  - Live-session ↔ VOD linking — fixture of live sessions + incoming VODs, assert correct merge and offset.
  - Settings migration.
- **Manual QA checklist** in README:
  1. Watch a VOD from 0 to end → bar fills fully, watched indicator applies.
  2. Watch 20 % at start, 20 % at end → tile shows two bars, indicator does NOT apply.
  3. Seek around randomly in a VOD → buffer doesn't over-credit.
  4. Watch a live stream for N minutes → later VOD shows corresponding segment.
  5. Rewind 30 min into live DVR buffer, watch 5 min → correct stream position recorded.
  6. Streamer restarts stream mid-session → new live-session record created.
  7. Close tab mid-watch → last segment persisted within ≤ 10 s of close.
  8. Open 3 channel Videos pages simultaneously → no IDB contention, bars render quickly.
  9. Change indicator color in settings → tiles update without reload.
  10. Export → Clear all → Import → state restored.
- **No E2E in v1.** Playwright-based E2E easy to add later.

---

## 9. Packaging & release

- `wxt build` → `dist/chrome-mv3/` and `dist/firefox-mv3/`.
- README with install steps:
  - Chrome: load unpacked from `dist/chrome-mv3/`.
  - Firefox: `about:debugging` → Load Temporary Add-on → `manifest.json` in `dist/firefox-mv3/`.
- No store publishing in v1.

---

## 10. Explicit non-goals (v1)

- No ad blocking.
- No chat, emote, theme, or follow-list changes.
- No clip tracking.
- No cloud sync. All data local to browser profile.
- No outbound Twitch API calls with our own credentials. Passive observation only.
- No mobile.
- No keyboard shortcuts.

---

## 11. Known risks


| Risk                                                | Mitigation                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Apollo cache shape change                           | Fallback via `fetch` hook in main world.                                                                      |
| Twitch markup churn (selectors)                     | Attribute-first selectors; Diagnostics panel surfaces misses.                                                 |
| MV3 service worker eviction loses in-flight flushes | Flushes are fire-and-forget; background re-opens IDB on demand via `idb`. Client retries on message failure.  |
| Clock skew in live→VOD mapping                      | 10-min match tolerance; quantization to 5 s buckets; realistic skew is < 1 s.                                 |
| Virtualized tile scrollers                          | MutationObserver attached to the specific scroller root, not `document.body`.                                 |
| Fullscreen player reparents DOM                     | ResizeObserver + re-attach on `fullscreenchange`.                                                             |
| `:has()` support regressions                        | Required for text-match declutter; minimum browser versions documented in README (Chrome 105+, Firefox 121+). |


---

## 12. Build milestones (suggested order for the agent)

1. Scaffold `wxt` project, TypeScript, options page shell.
2. `lib/util/ranges.ts` + tests.
3. `lib/db/` + tests with `fake-indexeddb`.
4. Settings schema + storage adapter + options page basic form.
5. Declutter: rules + CSS injection + selector watchdog.
6. Metadata bridge (`injected/mainWorld.ts` + `streamMetadata.ts`).
7. `vodTracker` + `segmentBuffer` + background flush handler.
8. Tile heatmap renderer + background batch fetch + broadcast.
9. `liveTracker` + live-session store.
10. Live ↔ VOD linking on write + periodic sweep.
11. Mark-as-watched UX.
12. Player-bar heatmap.
13. Export / Import / Clear / Diagnostics.
14. Manual QA pass; fix selectors.

