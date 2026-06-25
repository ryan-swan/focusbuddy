# Plexi Design System — aligning the suite to the aspirational vision

This is the single north star for making every Plexi surface (PlexiDesk, PlexiOffice,
PlexiMail, PlexiTasks, PlexiFlows, PlexiBrain, PlexiMeet, PlexiDraw, PlexiSlides,
PlexiSheets, PlexiDocs, the People Map, the Plexi Home) read as one product. It maps
the aspirational dashboards to what already exists in the codebase, names the shared
component layer, and sets the order we converge.

## The vision in one paragraph

A deep, calm canvas with a single confident indigo/violet accent and per‑product
accent colours. A colourful product wordmark over a sectioned sidebar (nav →
workspaces → tools/views) with a gradient upgrade card and a storage meter pinned
to the bottom. A top bar built around one ⌘K search, with help, settings,
notifications and the user avatar to the right. Pages open with a "Good morning,
Sarah 👋" greeting, then a row of stat tiles with trend deltas, then dense rounded
panels — boards, tables with status pills, charts and sparklines — with a persistent
right rail of Upcoming / Recent Activity / AI Insights. Everything is rounded, hairline
bordered, and quietly glassy.

## What already exists (do not rebuild)

The foundation is in `src/renderer/src/styles/tokens.css` and `globals.css`, and it is
strong. Use it; do not invent parallel colours.

- **Colour** is OKLCH ink / surface / edge ramps with light, `.dark`, `.futuristic`
  and `.atelier` overrides. Text is `--ink-100..--ink-10`; backgrounds are
  `--surface-base/raised/sunken/veil`; borders are `--edge-soft/firm/glow`. The accent
  is `--accent` (an `R G B` triple, set at runtime by `lib/theme.ts`) — use it as
  `rgb(var(--accent) / <alpha>)` or the Tailwind `accent` colour (`text-accent`,
  `bg-accent`).
- **Surfaces / glass**: `.fb-glass-chrome | -panel | -pillow | -soft` for the three
  glass tiers plus the soft dashboard‑card highlight.
- **Shape / motion**: `--radius-xs..2xl`, the `--ease-spring-*` curves and
  `--dur-*` durations, surfaced as `.fb-spring-*`, `.fb-lift`, `.fb-breathing`.
- **Type**: Inter everywhere, with `.fb-display`, `.fb-display-hero`, `.fb-tabular`
  (use for any number that must not jitter), `.fb-mono`.

Status colours (consistent across the suite): online/success = emerald, away/warn =
amber, focus/AI = violet, busy/error = rose, info = sky, accent = brand.

## The missing layer — shared dashboard primitives

The gap between the mockups and the app was never the tokens; it was that every
surface re‑styled its own cards. That layer now lives in
`src/renderer/src/components/plexi/index.tsx` and every product should compose it:

- `DashboardHeader` — the greeting + title + actions row that opens a page.
- `StatTile` — the icon‑chip + big tabular value + label + trend delta tile.
- `RailCard` — a titled, optionally‑actioned panel for the main column or right rail.
- `StatusPill` — the dot + label pill, keyed by the status tones above.
- `PLEXI_CARD` — the canonical card className (rounded‑xl, hairline, glassy).

They are built entirely on the tokens, so they adapt to every theme automatically.
The People Map view (`components/views/PeopleMapView.tsx` + `peopleMap.css`) is the
first reference implementation — its chrome is now token‑driven (theme‑aware) and its
header/stat strip use the primitives.

## How to align a surface (the checklist)

1. Replace bespoke page headers with `DashboardHeader` (greeting on home‑like views,
   plain title elsewhere).
2. Replace hand‑rolled metric cards with a `StatTile` row.
3. Wrap panels in `RailCard` / `PLEXI_CARD`; delete local card CSS.
4. Replace status text/badges with `StatusPill`.
5. Delete hardcoded hex. Chrome uses `--ink-*/--surface-*/--edge-*`; the accent uses
   `--accent`. The only place a fixed colour is acceptable is a "well" that is dark by
   convention (a world map, a video stage) — keep those few and obvious.
6. Numbers use `.fb-tabular`; headings use `.fb-display`.

## Phased rollout (and who owns what)

A second workstream is actively building PlexiOffice, desk, meet, chat, mail and forms.
To converge without collisions:

- **Phase 0 (done)**: ship the primitives kit + this doc + realign the People Map as
  the reference. No other surface touched.
- **Phase 1**: new surfaces adopt the primitives from day one (PlexiSign, and any
  not‑yet‑built product). Cheapest possible alignment — born on‑system.
- **Phase 2**: each owner aligns their live surface to the primitives on their own
  cadence (home, office home, the product dashboards). Whoever owns a component aligns
  it; nobody rewrites someone else's live component underneath them.
- **Phase 3**: fold the per‑product accent colours into the suite catalog
  (`src/shared/plexiSuite.ts` already carries an `accent` per family) so each product
  page can theme its accent from one source.

The rule that keeps this safe: shared primitives and tokens are the contract; surfaces
converge onto them incrementally. Coordinate before committing shared routing or the
catalog, per the concurrent‑work norms.
