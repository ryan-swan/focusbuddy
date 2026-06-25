# Plexi Suite — build roadmap

This is the master plan for building out the whole Plexi suite to the aspirational
vision. It records what each module is, where it stands, how important it is next, and
which owner agent should be consulted (or created) before changing it. The live,
per-product status of record is `src/shared/plexiSuite.ts` (the catalog the suite home
renders); this file adds the engineering view — done / left / priority / ownership.

## The vision

One connected workspace with a single confident indigo/violet accent and per-product
accents, a deep calm canvas, dense dashboards (greeting headers, stat tiles with trend
deltas, rounded glassy panels, status pills, charts, a persistent right rail), and the
People Map as a first-class home element. The look is codified in `DESIGN_SYSTEM.md`; the
shared component layer is `components/plexi`.

## The three build patterns

1. **Local product** (most of the suite): `@shared/<x>.ts` types → `src/main/db/<x>.ts`
   + a `fb_<x>` table in `database.ts` → `<x>:*` IPC → `window.api.<x>` preload →
   `stores/<x>.ts` → `Plexi<X>View.tsx` → routing (view kind + Sidebar + MainPane) →
   catalog entry. PlexiForms and PlexiSign are the reference implementations.
2. **Signal-server feature** (cross-account): a module in `projects/focusbuddy-signal/src`
   + a table + routes + a client in `src/renderer/src/lib`. Presence and the org
   directory follow this.
3. **Design alignment**: compose `components/plexi` on the tokens; never fork colour.

## Status legend

Status: **Shipped** · **In progress** · **Planned**. Priority: **P0** now · **P1** next ·
**P2** later · **P3** someday.

## Modules

### Foundation & cross-cutting

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| Design system (tokens + `components/plexi`) | Shipped (Phase 0) | P0 | `plexi-design-system-owner` |
| Account presence (live who's-online) | Shipped; live 2‑account pass pending | P1 | `presence-owner` |
| Org directory (offices/profiles/hours backend + admin) | Shipped | P1 | `org-directory-owner` |
| Org + identity (org/members/roles, SSO via WorkOS) | Backend + admin slice shipped; SSO planned | P1 | (to create: `org-identity-owner`) |

### PlexiTeam

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| People Map (Offices/Global/Hierarchy + daylight + presence) | Shipped, aligned to aspirational | P1 | `people-map-owner` |
| People Map actions (knock / message / jump-to-meet) | Planned (crosses chat/meet) | P2 | `people-map-owner` + chat/meet owners |
| Suite-home People Map card | Planned | P2 | suite-home owner |

### PlexiOffice (Create anything)

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| PlexiDocs / PlexiSheets / PlexiSlides / PlexiDraw | Shipped | — | (to create: `plexi-office-owner`) |
| PlexiForms (forms over a table) | Shipped | — | (to create: `plexiforms-owner`) |
| **PlexiSign** (e-signature) | **Shipped (this initiative)** | P1 | `plexisign-owner` |
| PlexiSign: cross-account send + external email | Planned | P2 | `plexisign-owner` + `presence-owner`/email |

### PlexiWork (Run the work)

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| PlexiTasks (tasks productized) | Shipped (existing tasks view) | P1 | (to create: `plexitasks-owner`) |
| PlexiProjects (rollup, dependencies, timeline) | Planned | P2 | (to create on build) |
| PlexiCalendar (time-blocking) | Shipped/partial | P1 | (to create on build) |
| PlexiMeet (record → transcript → action items) | Shipped | — | (to create: `pleximeet-owner`) |
| PlexiChat (contextual messages) | Shipped | — | (to create: `plexichat-owner`) |
| PlexiFiles | Shipped/partial | P2 | — |

### PlexiAI (Add intelligence)

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| PlexiBrain (knowledge base, AI grounding) | Shipped | — | (to create: `plexibrain-owner`) |
| PlexiAgents / PlexiFlow (workflow automation — the PlexiFlows dashboard) | Planned | P1 | (to create on build) |
| PlexiAssist / PlexiCommand | Planned | P2 | reuse `ai-proposal-owner` |

### PlexiData (See it. Act on it.)

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| PlexiDash (chart widgets) | Shipped | — | (to create: `plexidash-owner`) |
| PlexiTables | Shipped | — | reuse `tables` store owner |
| PlexiReports | Planned | P2 | (to create on build) |

### PlexiBuild / PlexiConnect / PlexiOps

| Module | Status | Priority | Owner agent |
|---|---|---|---|
| PlexiBuild (apps/widgets/automate/api) | Shipped/partial | P2 | (to create: `plexibuild-owner`) |
| PlexiMail | Shipped (suite) | P1 | (to create: `pleximail-owner`) |
| PlexiDrive / PlexiVault | Vault shipped; Drive planned | P2 | reuse vault owner |
| PlexiOps / PlexiAdmin | Planned | P3 | (to create on build) |

## What this initiative delivered

- The shared design foundation (`components/plexi`) + `DESIGN_SYSTEM.md`, on the existing tokens.
- The People Map brought fully to the aspirational two-column dashboard (greeting header, stat tiles, live right rail), theme-aware.
- The Organizations console realigned (greeting header + stat strip + card primitive).
- **PlexiSign** built end-to-end on the local product pattern + the primitives.
- Owner agents for the five modules above.

## What's left (priority order)

1. **P0 / coordinated**: flip `plexisign` in `src/shared/plexiSuite.ts` from `'soon'` to
   `'ready'` and add `launch: 'sign'`, plus the `case 'sign'` in `launchProduct`
   (`PlexiSuiteHome.tsx`). Left to the suite-catalog owner to avoid clobbering their
   in-flight edits — a two-line change.
2. **P1**: live two-account presence pass against the deployed signal server; align the
   PlexiWork/PlexiAI dashboards (Tasks, Flows, Brain, Meet) onto the primitives — each by
   its owner; build the PlexiFlows automation product.
3. **P1**: org-identity SSO (WorkOS) + unified `authorize()`.
4. **P2**: People Map actions (knock/message/meet) once chat/meet land; PlexiSign
   cross-account send; PlexiProjects; PlexiReports.
5. **P3**: PlexiOps / PlexiAdmin.

## Owner-agent index

Created this initiative: `people-map-owner`, `presence-owner`, `org-directory-owner`,
`plexisign-owner`, `plexi-design-system-owner` (in `.claude/agents/`). Existing reusable
owners: `canvas-camera-owner`, `widget-link-owner`, `section-owner`, `tool-spawn-owner`,
`proposal-applier-owner`, `ai-proposal-owner`, and `plexidesk-tester` (self-test gate).
Each "to create" above should get an owner `.md` the first time real work lands on that
module, following the same format.

## Coordination model

Shared primitives + tokens are the contract; surfaces converge onto them incrementally.
Owners align their OWN live surfaces; nobody rewrites another owner's component
underneath them. Coordinate before committing shared routing (`view.ts`, `MainPane.tsx`,
`Sidebar.tsx`) or the suite catalog. New surfaces are born on-system.
