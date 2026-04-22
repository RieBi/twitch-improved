# Twitch Improved

Twitch Improved is a Manifest V3 browser extension that helps clean up Twitch browsing and adds a watch heatmap for VODs.

## Features

- Hide recommendation shelves and UI upsells across Twitch pages.
- Track watched VOD/live segments and map live watch time back to VODs.
- Render heatmap overlays and watched indicators on VOD tiles and player UI.
- Manage/export/import local watch data from the options page.

## Privacy and Data Handling

- No telemetry, analytics, or remote personal-data collection.
- No outbound data uploads to third-party services.
- Settings are stored in `browser.storage.sync`.
- Watch history is stored locally in IndexedDB in your browser profile.

## Permissions Rationale

- `storage`: persist extension settings.
- `scripting`: inject main-world metadata bridge for Twitch data access.
- `alarms`: run periodic background linking/sweep tasks.
- `https://www.twitch.tv/*` host permission: operate on Twitch pages only.

## Prerequisites

- Node.js 20+
- npm 10+

## Development

```bash
npm install
npm run dev
```

Load `dist/chrome-mv3-dev/` as an unpacked extension during development.

## Build

```bash
npm run build
```

Build outputs:

- Chrome MV3: `dist/chrome-mv3/`
- Firefox MV3: `dist/firefox-mv3/`

## Test

```bash
npm run test
```

## Installation (Manual)

### Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select `dist/chrome-mv3/`.

### Firefox

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `dist/firefox-mv3/manifest.json`.

## Release QA Checklist

- Verify declutter toggles apply immediately on Twitch pages.
- Verify heatmap tracking and rendering on VOD tiles/player.
- Verify options autosave and reload behavior.
- Verify export/import/clear workflows in Data section.
- Verify Chrome and Firefox builds complete with no critical warnings.
