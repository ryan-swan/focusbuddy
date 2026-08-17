# PlexiDesk AI E2E

An AI-driven end-user test suite. A vision LLM (via [Midscene](https://midscenejs.com)) drives the real UI the way a person does: it looks at the screen, finds controls, clicks, types, and creates, then judges in natural language whether each outcome actually happened. It is deliberately separate from the Playwright/vitest `plexidesk-tester`, which asserts against selectors and curls the server. This one replicates the end-user experience and produces both a visual report and an AI diagnosis with improvement recommendations.

## What it drives

It targets PlexiDesk's mobile PWA served by a local, isolated signal (`/m/`), so the run touches none of your real or production data. The native Electron desktop window cannot be driven from a headless CI-style environment, so use this against the web/PWA surfaces here, and point it at the desktop app from a machine with a display if you want native coverage (see "Pointing at other surfaces").

## Requirements

- An LLM key in `projects/focusbuddy/.env`. It uses Anthropic by default (`ANTHROPIC_API_KEY`, model `claude-sonnet-4-5-20250929`). Claude 5 models are rejected because they no longer accept the `temperature` parameter Midscene sends. To use OpenAI instead, set `OPENAI_API_KEY` with credit and export `MIDSCENE_MODEL_NAME=gpt-4o`, then remove the Anthropic block in `run.mjs`.
- `focusbuddy-signal` dependencies installed (the boot script starts the signal with `tsx`).

## Run it

```bash
cd projects/focusbuddy/tools/ai-e2e
npm install
node boot-local.mjs      # start an isolated local signal + seed an account, org, desk and doc
node run.mjs             # AI drives the PWA through end-user journeys, writes results + a visual report
node diagnose.mjs        # AI reads the results + screenshots and writes recommendations.md
node boot-local.mjs stop # tear the local signal down
```

## Outputs (under `.state/`)

- `results.json` — one pass/fail per journey, timing, and the AI's on-screen observations.
- `shots/NN-name.png` — a screenshot after every journey.
- `midscene/report/*.html` — Midscene's visual report: each step with its screenshot and the model's reasoning. Open the newest file.
- `recommendations.md` — the AI diagnosis: ranked functionality problems and prioritised UX improvements.

## The journeys

Signing in, switching org, surveying the home screen, opening the seeded document, typing into it, opening a desk, creating a new item, and a first-time-user UX scan. Edit the `step(...)` calls in `run.mjs` to add flows (sheets, slides, chat, files, sharing). Each step is tolerant: one failure is recorded and the run continues.

## Native desktop pass

`run-desktop.mjs` drives the real Electron app, not the PWA, over the Chrome DevTools protocol. It exercises the full desktop surface the PWA cannot reach, the canvas desk and its widgets.

```bash
# build the app for the local signal once, then run the native pass
VITE_USE_LOCAL_SIGNAL=true VITE_SIGNAL_HTTP_URL=http://localhost:8795 \
  VITE_SIGNAL_WS_URL=ws://localhost:8795/ws npm --prefix ../.. run build
node boot-local.mjs         # signal + seeded account
node run-desktop.mjs        # launches the app with a debug port, drives it via CDP
node diagnose.mjs results-desktop.json
```

Two things this depends on. First, `ELECTRON_RUN_AS_NODE` must be unset, or Electron runs as plain Node with no window and no debug port; `run-desktop.mjs` deletes it from the child env. Second, `out/` must be built for the local signal as shown, because the renderer's signal URL is baked at build time. The app window does appear on screen (macOS needs the window server), but all clicking, typing, and screenshotting go through CDP, so no human interaction is required. Outputs land in `results-desktop.json`, `desktop-shots/`, `midscene-desktop/report/`, and `recommendations-desktop.md`.

## Pointing at other surfaces

`run.mjs` reads the target from `.state/creds.json` (`pwaUrl`). To test the deployed PWA, brochure, or admin instead, change the URL and the sign-in step. The native runner can point at any locally built `out/`; to test a release build, launch its Electron binary with `--remote-debugging-port` and the same CDP connect.

## Cost

Each journey is several vision-model calls. A full run is on the order of a few dozen calls, so it costs real tokens. Keep the journey list scoped for routine runs and expand it for a full audit.
