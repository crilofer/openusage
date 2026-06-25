# OpenUsage for Stream Deck

Show your AI coding subscription usage on Elgato Stream Deck dials and keys, powered by the
[OpenUsage](https://openusage.ai) app's local HTTP API.

This plugin is a standalone Node project. It does **not** modify the OpenUsage app — it only reads
the read-only API that OpenUsage already serves on `http://127.0.0.1:6736`
(see `docs/local-http-api.md`). That API is served by both the Tauri and Swift editions, and the
build auto-detects either repo layout, so the plugin works across the rewrite.

## What you get

- **Provider Dial** (Stream Deck +): a provider's usage drawn on the dial screen — provider logo,
  big value, progress bar, and reset countdown, with threshold colors (green → amber → red).
  - Rotate → switch metric (session → weekly → credits …)
  - Push → refresh now
  - Tap screen → open OpenUsage
- **Provider Key** (any Stream Deck): the same, rendered to fit a key face.
  - Press → cycle to the next metric
- **All usage bars (stacked)**: a single metric option that shows all of a provider's progress
  bars at once (e.g. daily + weekly + API), each with its own reset time.

Both actions discover providers and metrics live from the running OpenUsage app — nothing is
hardcoded, so new OpenUsage providers appear automatically.

## Requirements

- Stream Deck app 6.5+
- Node.js 20+ (bundled by the Stream Deck app at runtime; needed locally to build)
- The OpenUsage desktop app running (the local API is enabled by default)

## Build & install (development)

```bash
cd integrations/streamdeck
npm install
npm run build          # bundles src → ai.openusage.streamdeck.sdPlugin/bin/plugin.js
```

Then link the plugin into Stream Deck using the Elgato CLI:

```bash
npx @elgato/cli link ai.openusage.streamdeck.sdPlugin
npx @elgato/cli restart ai.openusage.streamdeck
```

For iterative work, `npm run watch` rebuilds and restarts the plugin on every change.

`npm test` verifies the icon bundle stays in sync — it fails if OpenUsage gains a provider
that has no bundled logo, so the plugin can't silently drift out of date with the app.

## Package for distribution

```bash
npx @elgato/cli pack ai.openusage.streamdeck.sdPlugin
```

This produces `ai.openusage.streamdeck.streamDeckPlugin`, which can be double-clicked to install.

## Configuration

Each action's Property Inspector lets you pick:

- **Provider** — populated live from `/v1/usage`.
- **Metric** — the specific line to show (or leave default and rotate/press to cycle).
- **Refresh** (global) — poll interval in seconds (default 15).
- **OpenUsage API** (global) — base URL, default `http://127.0.0.1:6736`.

A single shared poller makes one request per interval regardless of how many dials/keys you add.
When OpenUsage is closed, the last known values are shown dimmed with an "offline" hint instead of
an error.

## Project layout

```
ai.openusage.streamdeck.sdPlugin/   # the installable plugin bundle
  manifest.json                     # actions, controllers, PI paths
  bin/plugin.js                     # build output (gitignored)
  layouts/full.json                 # full-canvas dial layout (we draw the whole screen)
  imgs/                             # plugin/category PNG (from OpenUsage app icon),
                                    #   action SVGs, providers/ (generated, gitignored)
  ui/                               # Property Inspector HTML (sdpi-components)
scripts/
  bundle-provider-icons.mjs         # copies provider logos + brand colors from ../../plugins
src/
  plugin.ts                         # entry: registers actions, applies global settings
  client/openusage.ts               # typed fetch + status mapping
  poller.ts                         # single shared poller (backoff, offline/stale handling)
  metrics.ts                        # line selection, %/value/reset/color helpers
  property-inspector.ts             # provider/metric dropdown data + push on PI appear
  render/tiles.ts                   # SVG renderers for the dial and key faces
  generated/provider-icons.ts       # AUTO-GENERATED logo data URIs + brand colors
  actions/                          # ProviderDialAction, ProviderKeyAction
```

## Icons

The plugin reuses OpenUsage's own assets:

- **Plugin/category branding** — committed PNGs of the OpenUsage app icon (`imgs/plugin/`).
  Stream Deck requires PNG here; regenerate them if the brand changes.
- **Per-provider logos** — bundled at build time from the OpenUsage repo (tinted white to read on
  the dark dials/keys) and drawn on the dial screen and key face. `npm run bundle:icons` runs
  automatically before every build and auto-detects the source for either edition:
  - Swift: `Sources/OpenUsage/Resources/ProviderIcons/<id>.svg`
  - Tauri: `plugins/<id>/icon.svg`

  The API omits `iconUrl`, so this build step is how logos travel inside the plugin. New providers
  are picked up on the next build with no code changes, and the bundled logo maps to a snapshot by
  matching the provider id (identical across editions).
