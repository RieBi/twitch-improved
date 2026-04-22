# Privacy Policy for Twitch Improved

Effective date: 2026-04-22

Twitch Improved is a browser extension that helps users reduce distractions on Twitch and visualize local watch progress for VOD content.

## Summary

- We do not collect, sell, or share your personal data.
- We do not run analytics or telemetry.
- We do not operate a backend service for this extension.
- Data used by the extension is stored locally in your browser profile.

## What this extension does

Twitch Improved:

- Hides selected Twitch interface elements based on your settings.
- Tracks watched segments for Twitch VODs (and optional live-session mapping to VODs).
- Renders watch heatmaps on Twitch VOD tiles and player surfaces.
- Provides settings and local data management (export/import/clear).

## Data we collect

We do not collect personal data from users.

The extension does not transmit user watch history, settings, or identifiers to developer-controlled servers.

## Data stored locally on your device

The extension stores data in your browser:

1. `browser.storage.sync`
   - Stores extension settings (declutter and heatmap preferences).
2. IndexedDB (local browser database)
   - Stores local watch-history records used for heatmaps and watched indicators.

This data remains in your browser profile unless you export/import it yourself or remove it.

## Permissions and why they are used

- `storage`: Save user settings.
- `scripting`: Inject extension logic/bridge code required for Twitch-page functionality.
- `alarms`: Run periodic local maintenance/linking tasks in background context.
- `https://www.twitch.tv/*` host permission: Apply extension behavior only on Twitch pages.

## Data sharing and third parties

- No sale of personal information.
- No sharing of personal information with third parties for advertising.
- No developer-operated remote processing of your extension data.

Note: Twitch itself may collect data under its own policies when you use twitch.tv. This policy covers only Twitch Improved.

## Data retention and deletion

- You can remove extension-stored data at any time from the extension's Settings page using the data controls.
- Uninstalling the extension removes extension behavior; browser-managed storage persistence/removal follows browser rules.

## Children

This extension is not specifically directed to children.

## Changes to this policy

If this policy changes, the updated version will be published at this location and the effective date will be updated.

## Contact

For privacy questions, open an issue in the project repository where this policy is published.
