# Twitch Improved

Bootstrap for the Twitch Declutter & Watch Heatmap browser extension.

## Current status

Milestone 1 scaffold is complete:

- WXT + TypeScript project setup
- Background/content/options entrypoints
- React-based options shell with Declutter, Watch heatmap, and Data sections

## Prerequisites

- Node.js 20+
- npm 10+

## Quick start

```bash
npm install
npm run dev
```

Dev mode uses manual loading. After startup, load `dist/chrome-mv3-dev/` as an unpacked extension.

## Build

```bash
npm run build
```

Build output targets:

- Chrome MV3: `dist/chrome-mv3/`
- Firefox MV3: `dist/firefox-mv3/`

These output folders are generated artifacts.

## Test

```bash
npm run test
```
