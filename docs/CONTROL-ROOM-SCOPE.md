# Control Room — Scope and Build Plan

Status: scoped, ready to build. Author handoff for the next session.

## 1. The idea in one paragraph

Today a portal is a read-only window: it shows a live miniature of another desk
and lets you dive in. The control room turns portals into live data sources in
the same wire graph everything else already uses. A portal exposes the whole
content of the desk it points at, so wiring a portal into an agent feeds that
agent the entire desk. Portals can also be wired into each other, so one portal
inherits everything another portal carries, which lets you build a rollup: three
project desks feed three portals, those portals feed a single "Today" portal or
agent, and the agent reasons over all of it at once. The point is that a desk
becomes a first-class, composable unit of information you can pipe around the
canvas, not just a place you visit.

## 2. What exists today (grounding)

- `PortalWidget.tsx`: content is `{ targetTaskId }`. It fetches the target
  desk's widgets every 4s and on focus, renders them with `DeskMiniature`, and
  clicks through with `useNodeStore.setActive`.
- `DeskMiniature.tsx`: spatial, content-aware miniature of any widget array
  (reused by the minimap). Already cross-desk capable.
- Wires are kind-agnostic. `LinkOverlay` draws a wire between any two widgets by
  `data-widget-id`, and `WidgetFrame` gives portals a `data-widget-id`. So you
  can already draw a wire from or to a portal. Nothing interprets it yet.
- Content resolution for wiring lives in two places:
  - Main: `src/main/ai/agentInputs.ts` `describeWidgetForAgent(widget, liveText?)`
    — per-kind. Used for agent inputs (`agents:run`) and transform wires
    (`wires:runTransform`). There is no `portal` case, so a portal resolves to
    its raw JSON.
  - Renderer: `src/renderer/src/lib/wireEngine.ts` `effectiveContent(widget)` —
    used by the mirror/deliver path. Handles `agent` (its last output) and falls
    back to `content`. No portal case.
- Cross-desk reads exist in main: `listWidgetsByTask(taskId)`, `getWidget(id)`,
  `listLinksByTask(taskId)`. So main can read any desk and any desk's link graph.
- Delivery (`coerceToWidgetContent`) already treats `portal` as a structured
  config widget and refuses to overwrite it with text. Good. A portal must stay
  a SOURCE, never a write target.

## 3. The two new capabilities

### 3a. Portal as a wire source (feeds its target desk)

Wiring a portal into an agent (or a transform wire) makes the portal resolve to
an aggregated text representation of its target desk: a header with the desk
title, then one compact block per non-archived top-level widget on that desk
(kind, title, and content rendered the way `describeWidgetForAgent` already does
per kind — table rows, page text, card title/body, sticky text, browser URL,
etc.). The agent then reasons over the whole desk.

### 3b. Portal-to-portal inheritance (rollup)

A portal also inherits from anything wired INTO it. Its effective content is its
own target-desk aggregation plus the effective content of each incoming wired
source, recursively. So:

```
Desk A ─▶ Portal A ─┐
Desk B ─▶ Portal B ─┼─▶ Portal "Today" ─▶ Agent
Desk C ─▶ Portal C ─┘
```

The Today portal carries A + B + C (plus its own desk if it has one), and the
agent wired to Today gets everything. A portal with no `targetTaskId` becomes a
pure aggregator: it carries only what is wired into it. This is the "inherit all
information in one portal for use into another" the request asked for.

## 4. Data model and semantics

No schema change is strictly required. A portal stays `{ targetTaskId }`. The
new behaviour is computed, not stored.

Define an aggregator (main process, the single source of truth):

```
aggregatePortal(taskId | null, opts, visited, depth) -> string
  - if depth > MAX_DEPTH (3) or taskId in visited: return a short "(cycle/too deep)" note
  - mark taskId visited
  - parts = []
  - if taskId: parts.push(deskBlock(taskId))     // title + per-widget summary
  - for each link where target = THIS portal widget id (its incoming wires):
      source = getWidget(link.source)
      if source is a portal: parts.push(aggregatePortal(source.targetTaskId, ..., visited, depth+1)
                                          + that portal's own incoming inheritance)
      else: parts.push(describeWidgetForAgent(source))   // a normal widget inherited in
  - return parts.join("\n\n---\n\n")
```

Key decisions to lock before building:

- D1. Browser depth. A desk can hold several browsers. Aggregating with a live
  fetch per browser is slow and costly. Decision: aggregation includes each
  browser's URL and title only, not a fetched body. If the user wants a page
  read, they wire that browser straight into the agent (the agent's browser
  tools handle deep reads). Flag a per-portal "include page text" toggle as a
  later option, off by default.
- D2. Size budget. Cap total aggregation at ~8-10k characters, per-widget at
  ~500. Truncate oldest/lowest widgets first and note the truncation (no silent
  drop, per the kit's honesty rule).
- D3. Where it runs. Agent inputs and transform wires already resolve content in
  MAIN via `describeWidgetForAgent`, and main can read any desk and any link
  graph. So the aggregator lives in main and is the canonical path. The renderer
  mirror path (`effectiveContent`) is the only one that resolves content
  client-side; portal-as-mirror-source is rarer, so for v1 either (a) skip
  portal handling in renderer mirror and document that portals feed agents and
  transforms, or (b) add a thin renderer aggregator. Recommend (a) for v1.
- D4. Inheritance edges live on the portal's OWN desk (the control room), so the
  traversal reads `listLinksByTask(controlRoomTaskId)` to find a portal's
  incoming wires, then jumps cross-desk for each source portal's target. Each
  hop may introduce a new desk's link graph; the visited set is keyed by widget
  id AND task id to stop cycles across both.

## 5. Architecture and integration points (file by file)

- `src/main/ai/portalAggregate.ts` (new): `aggregatePortalContent(portalWidget,
  visited, depth)` using `getNode`, `listWidgetsByTask`, `listLinksByTask`,
  `getWidget`, and a light `deskBlock(taskId)` that reuses the per-kind
  formatting from `agentInputs.ts` (extract a shared `summariseWidget(w)` so both
  files use one formatter; do NOT duplicate).
- `src/main/ai/agentInputs.ts`: add a `case 'portal':` to
  `describeWidgetForAgent` that calls `aggregatePortalContent`. Refactor the
  per-kind body text into an exported `summariseWidget(w)` the aggregator reuses.
- `agents:run` and `wires:runTransform` (ipc): unchanged signatures; they already
  call `describeWidgetForAgent`, which now understands portals.
- `src/renderer/src/lib/wireEngine.ts`: leave `effectiveContent` as is for v1
  (mirror from a portal is out of scope for v1). If we add it, route through a
  new `agents:aggregatePortal` IPC rather than re-implementing in the renderer.
- `src/renderer/src/components/widgets/PortalWidget.tsx`:
  - show an "inherits N" chip when the portal has incoming wires (mirror the
    agent's "feeds N" affordance).
  - when `targetTaskId` is null but incoming wires exist, render an "aggregator"
    state (a stack of the inherited desks' names) instead of the empty picker.
  - keep the live miniature for the target desk.
- `src/renderer/src/lib/agentRecommend.ts` / agent suggestion: no change.
- Loop/visited + depth caps implemented in `portalAggregate.ts`.

## 6. UX

- Linking: you already draw a wire from a portal into an agent or another portal
  the same way you wire anything (drag the ghost line). A wire FROM a portal is,
  by definition, "use this desk's information here." A context wire is enough;
  no new wire type required. The portal's outgoing wire should read as "feeds"
  in the wire editor, same vocabulary as agents.
- Aggregator portal: a portal with no target but incoming wires shows a compact
  "Rollup of: Desk A, Desk B, Desk C" header and the live dot. Diving in could
  open a synthetic overview later; for v1 it just lists the inherited desks.
- Control room desk pattern (no code, just guidance in onboarding): a "Today"
  desk holding one portal per active project, optionally a rollup portal and an
  agent that summarises everything into a stand-up note or a status table.
- Staleness: the portal already refreshes its miniature every 4s. Aggregation
  for an agent run reads live at run time in main, so it is never stale at the
  moment of use. Show a subtle "as of run time" note in the agent output area is
  not needed; the run log timestamp covers it.

## 7. Edge cases

- Cycles: Portal A inherits Portal B which inherits Portal A. Visited set keyed
  by (widgetId, taskId) plus a depth cap of 3 stops it; the aggregation notes
  where it stopped rather than failing.
- Self-reference: a portal pointing at the desk it sits on. Detect targetTaskId
  === the portal's own taskId and skip its own desk block to avoid infinite
  self-inclusion.
- Empty or deleted target: aggregation yields "(this portal's desk is empty or
  was removed)"; never throw.
- Archived widgets: excluded, same filter as `DeskMiniature` and agent inputs.
- Cost and latency: caps in D2 plus no per-browser fetch in D1 keep a rollup of
  several desks within a single bounded prompt. If a rollup is huge, truncate and
  say so.
- Delivery safety unchanged: a portal is never a write target;
  `coerceToWidgetContent` already returns null for `portal`.
- Cross-user desks: out of scope (cross-user sync is deferred elsewhere). A
  portal can only aggregate desks in the local workspace.

## 8. Phased build plan (one day)

- P0 Refactor (30 min): extract `summariseWidget(w)` from `agentInputs.ts` so the
  aggregator and the per-kind describer share one formatter.
- P1 Portal as source (core): `portalAggregate.ts` + the `portal` case in
  `describeWidgetForAgent`. Now an agent wired to a portal gets that desk. Test:
  agent wired to a portal pointed at a desk with a known sticky receives that
  sticky's text (hermetic, no key — the describe path is deterministic for
  non-browser widgets).
- P2 Inheritance: portal-to-portal traversal with visited + depth caps in the
  aggregator. Test: Portal A (Desk 1, known marker) wired into Portal B; agent
  wired to B receives Desk 1's marker. Test a cycle terminates.
- P3 Portal UI: "inherits N" chip and the aggregator (no-target) state. Test:
  the chip count reflects incoming wires.
- P4 Polish + docs: wire-editor "feeds" vocabulary for portal sources, an
  onboarding note for the Today-desk pattern, update the demo seeder with a
  control-room rollup so it demos itself.

## 9. Test plan

All hermetic except the live browser path (already covered elsewhere):

- `controlRoomPortal.spec.ts`:
  - agent wired to a portal receives the target desk's content (a marker sticky).
  - Portal A → Portal B → agent: the agent receives Desk A's marker (inheritance).
  - a cycle (A inherits B inherits A) terminates and the agent still produces a
    bounded run, no hang.
  - the portal shows "inherits N" for N incoming wires.
- Regression: deskAgents, formatAwareDelivery, portalWidget remain green.

## 10. Open questions to confirm before/at build

- Q1. Confirm D1 (no per-browser fetch in aggregation; deep reads via direct
  browser wires). Default proposed: yes.
- Q2. Confirm D3 (v1 portals feed agents and transform wires; mirror-from-portal
  deferred). Default proposed: yes.
- Q3. Should a rollup portal also become divable into a synthetic overview desk,
  or just list inherited desks for v1? Default proposed: list for v1.
- Q4. Do we want a per-portal "include page text" toggle now or later? Default
  proposed: later.

## 11. What this unlocks next (not in scope, for context)

Once a portal is a composable desk-source, the same aggregation feeds a
"workspace agent" that watches several desks and posts a daily rollup, and it
pairs naturally with desk time-travel (aggregate a desk as it was at a snapshot).
Neither is in this build; noting the direction so the interfaces stay clean.
