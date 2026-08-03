# Working on PlexiDesk together

This is the playbook for two or more people building in the same codebase at the
same time without ending up in a painful integration. It exists because the last
big merge was hard for two avoidable reasons: a branch had been forked off an old
snapshot (v3.3.5) and left to age while `Plexi3.0` moved on, and it rebuilt the
same shared surfaces that had also been rebuilt on the mainline. Everything below
is aimed at never repeating those two things.

For the mechanics of shipping a new capability across the app, signal server and
brochure, see `../NEW_FEATURE_PLAYBOOK.md`. This document is about how to divide
the work and stay mergeable.

## The one rule that matters most

Branch off the current `Plexi3.0`, keep the branch small, and rebase it onto
`Plexi3.0` every day. Merge within a day or two, not weeks. Never work from a zip,
a snapshot, or a fork with its own history, and never squash a large body of work
into a single unrelated commit. Long-lived branches off a stale base are the whole
reason the last integration hurt; a branch that rebases daily only ever meets
conflicts a few lines at a time.

```sh
git switch Plexi3.0 && git pull --rebase        # start from current base
git switch -c your-name/short-feature-name       # small, focused branch
# ...work...
git fetch origin && git rebase origin/Plexi3.0   # do this every morning
```

## Own a surface, stay out of the others

Agree who owns which area before you start, and keep to it. The app is already cut
into modules that barely overlap, so if two people own different areas they rarely
touch the same file.

| Area | Lives in | Owner-agent to consult |
|---|---|---|
| Desk & canvas (widgets, sections, links, focus mode) | `components/Canvas.tsx`, `components/widgets/**`, `components/focus/**`, `stores/widgets.ts` | canvas-camera-owner, section-owner, widget-link-owner, tool-spawn-owner |
| PlexiOffice (Docs / Sheets / Slides / Draw / Design) | `components/office/**`, `components/officeApp/**`, the editors + `shared/*` doc models | plexi-docs / sheets / slides / draw / design-owner |
| PlexiBrain / AI assistant | `components/ChatPanel.tsx`, `lib/assistantContext.ts`, `stores/chat.ts`, `lib/actionExecutor.ts` | ai-proposal-owner, proposal-applier-owner |
| PlexiChat / PlexiCam | `components/views/FlowView.tsx`, `components/views/MessagesView.tsx`, `stores/messaging.ts` | chat-owner, presence-owner |
| PlexiTeam / People Map | `components/views/PeopleMapView.tsx`, `stores/org.ts` | people-map-owner, org-directory-owner |
| PlexiMeet / Mail / Sign | `components/views/PlexiMeetView.tsx`, `MailView.tsx`, `PlexiSignView.tsx` | plexisign-owner |
| Plans & calendar | `components/views/PlexiProjectsView.tsx`, `CalendarView.tsx`, `stores/timeBlocks.ts` | (plan agents) |
| Platform (types, IPC, DB, preload, signal) | `shared/types.ts`, `main/ipc/index.ts`, `main/db/**`, `preload/index.ts`, `focusbuddy-signal/**` | — |

Two people should not both be rebuilding the same surface. If a surface genuinely
needs a rebuild, that is a "let's sync first" conversation, not a surprise branch.

## Add a file, don't edit a hub

Most of the app is built so a new feature is a new file plus one line in a
registry, instead of an edit to a big shared switch. Prefer these seams. They let
two people add different things without ever colliding.

- New widget kind: add the component, add an entry in `lib/widgetCatalog.ts`, and
  a case in `lib/renderWidgetInline.tsx`.
- New right-click action: add a provider in `lib/contextMenu/` (see `registry.ts`
  and `providers.ts`), not the menu component.
- New top-level view: add the component, a `case` in `components/MainPane.tsx`, and
  an entry in `lib/viewCapability.ts`.
- New onboarding tour: append to `lib/onboarding/registry.ts`.
- New store: give the feature its own file under `stores/`. Do not bolt state onto
  another feature's store.

## The hub files are shared property

A handful of files are unavoidable contention points. Touch them additively and in
tiny, self-contained commits so a rebase can merge them automatically, and tell
the other person before any large edit to one:

- `components/Canvas.tsx`, `components/Sidebar.tsx`, `components/MainPane.tsx`
- `shared/types.ts` (append types; never reorder or restructure)
- `main/ipc/index.ts`, `preload/index.ts` (append handlers / bridge methods)
- `main/db/database.ts` (append `CREATE TABLE IF NOT EXISTS` / `ensureColumn`
  migrations at the end; never edit an existing table's DDL in place)
- `stores/widgets.ts`

Rule of thumb: if your change to a hub file is more than a few appended lines, it
belongs in its own commit and probably deserves a heads-up.

## Land continuously, behind a flag if half-built

Prefer merging small pieces to `Plexi3.0` as you go over a big-bang branch. If a
feature is not finished, gate its entry point behind a flag (a capability in
`lib/viewCapability.ts`, or a simple boolean) so it can merge without being live.
A flagged, additive feature merges daily and never conflicts with someone else's
flagged feature. This single habit would have removed the entire last integration.

## The merge gate

`scripts/merge-check.mjs` enforces the three things that keep the shared branch
healthy: the branch is up to date with `Plexi3.0`, typecheck is clean, and unit
tests pass. It runs in two places so "green locally" and "green in CI" mean the
same thing.

Install the local hooks once per clone (adds a pre-push gate alongside the
existing pre-commit capability-drift check):

```sh
npm run hooks:install
```

After that, `git push` runs the check and blocks a stale or broken push. Bypass an
intentional work-in-progress push with `SKIP_MERGE_CHECK=1 git push`.

Run it by hand any time:

```sh
npm run merge-check
```

In CI, `.github/workflows/merge-check.yml` runs the same check on every pull
request into `Plexi3.0`. Make it a required status check in branch protection and
enable "Require branches to be up to date before merging" so nothing stale reaches
the shared branch. For desk or UI changes, also run the plexidesk-tester before
merging; the automated gate does not open the app.

## Quick checklist before you push

1. Rebased onto `origin/Plexi3.0` today.
2. Your change is a new file plus a registry line where possible, not a hub edit.
3. `npm run merge-check` is green.
4. Desk/UI change? The plexidesk-tester says green too.
