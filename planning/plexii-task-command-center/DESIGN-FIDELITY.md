# Design Fidelity Standard

Operator directive, 2026-08-24: every UI/UX artifact of this build follows the brand
guidelines and design rules so the result fits seamlessly into Plexii's existing workflows,
design, and experience — "nothing clunky, nothing that feels or looks different." This doc
names the authorities, compresses their laws, and wires enforcement into the gates.

## Authorities (in precedence order)

1. **`DESIGN_SYSTEM.md` (repo root)** — the in-app law, ratified with Caleb 2026-08-23
   ("Edges and glass"). Governs tokens, materials, motion, type, and the shared primitives.
2. **`src/renderer/src/styles/tokens.css` + `globals.css`** — the executable form: OKLCH
   ink/surface/edge ramps, four themes (light / `.dark` / `.futuristic` / `.atelier`),
   runtime accent.
3. **`src/renderer/src/components/plexi/index.tsx`** — the shared primitive kit:
   `DashboardHeader`, `StatTile`, `RailCard`, `StatusPill`, `ListRow`, `Sparkline`,
   `MiniBars`, `Ring`, `PLEXI_CARD`, `spawnSparkBurst`. Reference implementation:
   `PeopleMapView`.
4. **Plexii Brand Guidelines & Design System (PDF, 12pp)** —
   `~/AI/Plexii/Marketing/Plexii Brand Guidelines & Design System.pdf` — brand marks,
   wordmark, brand color story. Consulted if any surface shows brand marks; the in-app
   truth above wins on UI questions.

## The laws, compressed (violations = rubric failures)

**Color & tokens.** No hardcoded hex. Chrome = `--ink-*` / `--surface-*` / `--edge-*`;
accent = `rgb(var(--accent) / a)` or Tailwind `accent`. Semantic status colors are fixed
suite-wide: success/online = emerald · warn/away = amber · **focus/AI = violet** ·
error/busy = rose · info = sky. Literal colors are lawful only in the documented taxonomy
(forced-dark stages, paper materials, swatch containment, handle contrast) **with a comment
saying why** — everything else literal is debt.

**Edges & glass (the ratified law).** Borders are the last resort — whitespace first, then a
luminance step, then a hairline. Hairlines are alpha, never opaque grey. Content is opaque;
at most one floating glass layer, only from the tiers (`fb-glass-chrome` chrome/toolbars ·
`fb-glass-panel` popovers/menus · `fb-glass-pillow` modals); ad-hoc `backdrop-blur` is a
defect. `border border-[var(--edge-soft)]` boxes on filled surfaces are debt (note: the
legacy-branch components predate this law and use exactly that pattern — **any reuse from
`fd12cc2f` gets re-skinned to `fb-card`/hairline material during port**).

**Shape & motion.** Corners rhyme: card 16 / row & field 10 / chip 8 (`--radius-*`); nested
radius = outer minus padding, never a fourth value. Motion uses `--ease-spring-*` /
`--dur-*` via `.fb-spring-*`, `.fb-lift`, `.fb-breathing`, `fb-press`. Feedback on every
control, on nothing else; keyboard focus keeps the global concentric ring — restyling is
fine, `outline-none` is not.

**Type.** Inter everywhere. `.fb-display` for headings, `.fb-tabular` for any number that
must not jitter (Pulse counts, queue counts, timers), `.fb-mono` for code-ish.

**Primitives first.** New surfaces compose the plexi kit before writing any bespoke card:
page opens with `DashboardHeader`, metrics are `StatTile` rows, panels are
`RailCard`/`PLEXI_CARD`, statuses are `StatusPill`, rows are `ListRow`, sparklines from the
kit. Local card CSS on a new surface = defect. Toasts: glass capsule + `ring-1
ring-<tone>/25` — semantics in ring/tint, never a tinted surface.

**Navigation & workflow nativeness.** New views register through the existing seams —
`stores/view.ts` union, `MainPane` switch, Sidebar (both collapsed rail AND expanded nav),
⌘K palette actions, Home widget registry — never a parallel nav pattern. Interactions follow
existing conventions users already know: inline click-to-edit, hover-revealed row actions,
segmented controls, chip toggles, two-step destructive confirms, ⌘K-first for power flows.

## Why this is the sanctioned path (not extra burden)

`DESIGN_SYSTEM.md`'s own rollout plan: **"Phase 1: new surfaces adopt the primitives from
day one. Cheapest possible alignment — born on-system."** This build IS that case. Bonus
alignment: the doc's aspirational vision paragraph — greeting, stat tiles with trend deltas,
status pills, dense rounded panels, right rail of Upcoming / Recent Activity / AI Insights,
notifications in the top bar — *is* a command-center dashboard, and the suite list already
names "PlexiTasks." The design system has been waiting for this feature.

**Concurrent-work norm (from the same doc):** whoever owns a component aligns it; nobody
rewrites someone else's live component underneath them. On the fork this converts to: new
files compose primitives freely; edits to Caleb's live components stay minimal and
mechanical (a render-switch case, a registry entry) — anything more is a crossroads.

## Enforcement wiring

- **Phase 3 (experience design):** every proposed screen/flow names its primitive
  composition and nav registration up front; the audience-calibrator pass includes a
  "native or foreign?" verdict per surface.
- **Phase 4 (architecture):** component inventory maps 1:1 to the primitive kit; any
  genuinely new primitive is proposed to be *added to the kit* (token-built, theme-tested
  across all four themes) rather than built as a one-off.
- **Per Phase-6 stage (rubric "native fit" dimension — scored against this doc):**
  ① zero hardcoded hex outside the lawful taxonomy · ② primitives composed, no bespoke
  cards · ③ corners/motion/type from tokens · ④ all four themes verified live (light,
  dark, futuristic, atelier) · ⑤ nav registered through existing seams · ⑥ focus ring
  intact, `fb-press` feedback on controls. Any ① –⑥ failure = dimension < 4 = stage
  REJECT per QUALITY-FRAMEWORK.
- **Legacy reuse:** anything ported from `fd12cc2f` is re-skinned to current law before
  its stage closes (its `border-[var(--edge-soft)]` boxes and raw framer-motion transitions
  predate the 2026-08-23 ratification).
