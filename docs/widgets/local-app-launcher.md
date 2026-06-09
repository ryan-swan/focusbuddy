# App launcher, SME doc (master of destiny)

Tier: Sufficient. This widget does not need to beat best of breed at the global
launcher game. It needs to do its one on-canvas job, getting the user back into
the right native app for the task in front of them, cleanly enough that nobody
reaches for a real launcher to do it.

## The use case

Someone is deep in a task on the canvas, with the notes, the browser tab, the
timer, and a table for the work all sitting next to each other. Part of that task
lives in a native Mac app: the design happens in Figma, the writing in Ulysses,
the editing in Final Cut, the chat in Slack. They do not want to hunt the Dock or
hit a global launcher and break the spatial frame of the desk they have built.
They want a tile right there, next to everything else for this task, that shows
the app's real icon, tells them at a glance whether it is already open, and
brings them back into it with one click. The moment of use is "the next step is
in that app, and I want to jump into it without leaving the desk I set up for
this."

## Current state

The tile is `LocalAppLauncherWidget` at
`src/renderer/src/components/widgets/LocalAppLauncherWidget.tsx`. It binds to a
local Connected App through `widget.sourceAppId`, resolving the app from
`useConnectedAppsStore` (`src/renderer/src/stores/connectedApps.ts`). The
main-process work lives in `src/main/localApps.ts`, and the binding is created in
`Canvas.tsx` around line 1539 when a Local app is dragged from the sidebar onto
the canvas, mapping `kind: 'local'` apps to a `local-app-launcher` widget. The
catalog entry is in `src/renderer/src/lib/widgetCatalog.ts`, and the app records
themselves are stored in SQLite via `src/main/db/connectedApps.ts`.

What works today:
- One-click launch and re-focus. `launchLocalApp` in `localApps.ts` opens by
  bundle id when known, falls back to the app path, then runs AppleScript to
  unhide and unminimise the window so a click always brings the user back to the
  app whether it was closed, hidden, minimised, or just in the background.
- A live running indicator. The widget polls `localApp.isRunning` every four
  seconds and shows a green dot plus a "click to focus" versus "click to launch"
  hint, so the tile reflects reality without a global broadcast.
- Real app icons. At create time `captureAppIcon` grabs the icon macOS would show
  in Finder (QuickLink thumbnail first, then a `sips` conversion of the bundle's
  .icns) and caches it as base64, so the tile looks like the real app rather than
  a generic glyph.
- A friendly broken state. If the bound app is removed from Connected Apps, the
  tile shows a "Linked app was removed" message with a re-bind hint instead of
  failing silently.
- It is a first-class canvas object: resizable, wireable, part of a section,
  shareable, and it feeds the sidebar Favourites sort because a launch calls
  `touch` on the app the same way opening its page does.

Rough edges (honest):
- It launches one app and nothing else. There is no argument, no file to open
  with the app, no deep link, no folder. Compared to a real launcher quicklink it
  is the most basic possible action.
- There is no keyboard path. You cannot type a few letters and launch; the tile
  only responds to a click, and there is no global hotkey to focus it.
- A `mode: 'mirror'` field exists in the widget type (`src/shared/types.ts`) and
  the SQLite schema (`src/main/db/database.ts`), described as a punch-through live
  view of the real native app window. No renderer path implements it. The widget
  only ever draws the launcher tile, so mirror mode is a declared intention, not a
  shipped feature.
- Almost everything rich is macOS only. On Windows and Linux the tile degrades to
  "launcher only" with `shell.openPath`: no real icon, no running indicator, no
  unminimise. The component does not currently signal that degraded state to the
  user, it just shows the fallback glyph.
- Running detection matches on process name derived from the app path basename,
  which can be wrong for apps whose process name differs from the bundle name, so
  the green dot can occasionally lie.
- You create one tile per app by dragging. There is no multi-app tile, no group,
  no "all my apps for this project" cluster, and no in-tile way to swap which app
  it points at.

## Best-of-breed landscape

Raycast is the product most people now mean when they say Mac launcher. It opens
on a global hotkey, launches apps by a few typed letters, and goes far past
launching into clipboard history, window management, snippets, and a large
one-click extension store. Its Quicklinks are the relevant comparison for us: a
Quicklink can open a URL, a file, or a folder, and on macOS it can specify which
application opens the link, so "open this project folder in VS Code" is a single
action. Raycast Pro also puts an AI assistant in the launcher window for
summarising, rewriting, and chat. The thing Raycast does better than us is turn
launching into a rich, parameterised, keyboard-driven action rather than a single
click on a single app.

Alfred is the deep-automation incumbent, around since 2010, built on a visual
workflow editor where a launch can be one node in a chain that passes a selected
file or piece of text into the next step. For raw app launching and file actions
it is still regarded as the fastest keyboard tool. What Alfred does better is let
a launch be the start of a real workflow, not the end of one.

LaunchBar is the speed-and-indexing veteran, keyboard-first, with abbreviations
and its Instant Send feature where you select a file or text anywhere and fire an
action onto it. What it does better is the action-on-a-thing model: the app and
the document you want to open in it arrive together.

The native and Launchpad-replacement tier matters too. macOS Tahoe removed
Launchpad and replaced it with an Apps and Spotlight view, which opened space for
apps like LaunchOS, AppGrid, and Launchie that restore a visual grid of app icons
with pages and folders. These are the closest analog to a grid of launcher tiles.
What they do better is organise the whole machine's app set into a browsable,
folderable visual space, where we only place individual tiles by hand.

What we already do better or uniquely could: every one of those tools is a global
overlay that floats over whatever you happen to be doing and then disappears. Our
tile is spatial and persistent, it lives on the specific desk for the specific
task, next to the notes and browser and timer for that work, so the apps you need
for this project are simply present rather than recalled from memory. None of the
incumbents can sit a launcher inside a task context, wire it to other widgets, or
let a desk agent reason about which app belongs to which piece of work, and none
of them keep that arrangement local to the machine as a side effect of being a
desktop-first product.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. Launch is a bare app open, not a parameterised action (Raycast Quicklinks,
   LaunchBar Instant Send). "Open this project folder in VS Code" or "open this
   PDF in Preview." Today the tile can only open the app with no target, so the
   user still has to find the file once the app is up. This is the single biggest
   gap versus a real launcher.
2. No keyboard path (Raycast, Alfred, LaunchBar). "I want to launch without
   reaching for the mouse." Every incumbent is keyboard-first; our tile is
   click-only, which feels slow to power users who live on a launcher.
3. Mirror mode is promised in the schema but does not exist (no direct
   competitor, it would be a Haptyx original). "I want the real app window living
   inside my canvas, not just a button that opens it elsewhere." The field is
   there, the feature is not, which is a thread left dangling.
4. No multi-app grouping or grid (LaunchOS, AppGrid, Launchie). "Give me the five
   apps for this project as one cluster." We only place tiles one at a time by
   hand, so a desk with many apps gets cluttered.
5. Cross-platform degradation is silent and thin (all native launchers ship a
   real experience per platform). "On my Windows machine the tile is just a
   button with a generic icon and no running dot, and nothing tells me why." The
   degraded path works but does not explain itself.
6. Running detection can be wrong (any tool that shows app state). "The dot says
   running but the app is closed." Name-based matching on the path basename
   misfires for apps whose process name differs from the bundle name.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")
- Parameterised launch target. Let a tile optionally carry a file or folder to
  open the app with, captured when a file is dropped onto the tile or set from a
  small inline field, launched via `open -a <appPath> <target>` on macOS and the
  equivalent elsewhere. Acceptance: dragging a PDF onto a Preview tile makes the
  tile open Preview on that PDF in one click, which is the Raycast Quicklink
  "open with application" behaviour scoped to a single tile.
- Honest cross-platform state. When the tile is on a non-mac platform or the app
  has no icon and no running detection, show a small, plain note that running
  state and the real icon are macOS only, rather than silently drawing the
  fallback glyph. Acceptance: a Windows user sees why the dot and icon are absent
  and the tile still launches; we no longer hide the degradation.
- Fix or qualify the running dot. Resolve the process name from the bundle id
  when one exists (the code already does this for the unminimise step in
  `resolveProcessName`) and only fall back to the basename when it does not, so
  the green dot matches reality far more often. Acceptance: for a representative
  set of apps whose process name differs from the bundle name, the dot is correct
  where a bundle id is known.

### Launch-polish
- A keyboard path to focus and launch. Give the selected tile an Enter-to-launch
  affordance and a per-canvas quick-jump so a user can reach an app tile without
  the mouse. Acceptance: with a launcher tile selected, Enter launches it, closing
  the most obvious gap versus keyboard-first launchers for the on-canvas case.
- Multi-app tile or app group. A single widget that holds several bound apps as a
  small grid, created by dropping multiple apps or by grouping existing tiles,
  so "the apps for this project" is one tidy object. Acceptance: five apps live in
  one tile that a user can launch any of, matching the visual-grid value of
  AppGrid and Launchie inside a task instead of across the whole machine.
- Swap and rebind in place. Let the user repoint a tile at a different app, and
  repair a broken link without deleting and redragging. Acceptance: the broken
  state offers a rebind action that fixes the tile without losing its position or
  wires.

### Post-launch (pull ahead)
- Ship mirror mode for real. Implement the punch-through live window the type
  already promises, positioning the real native app window behind a transparent
  region of the canvas so the app is interactive in place. Acceptance: a Figma or
  terminal window appears live inside the canvas and accepts clicks, delivering
  something no launcher does because none of them own a canvas.
- Wire-driven launch. A wire from another widget triggers the launch with the
  wired widget's content as the target, so a file widget wired to an editor tile
  opens that file in that editor. Acceptance: dropping a wire from a file widget
  to an app tile makes the tile open that file, using our unique canvas wiring.
- Agent-aware app suggestions. A desk agent proposes the apps a task probably
  needs and offers to drop the tiles, since the agent can already reason about the
  desk's contents. Acceptance: starting a "video edit" task surfaces a suggested
  Final Cut tile, something no global launcher can do because it has no task
  context.

## The unfair advantage

Only Haptyx can put the launcher for an app on the exact surface where the work
for that app is happening, next to the notes and the file and the timer for the
same task, wire it to those other widgets so a launch can carry their content,
and let a desk agent reason about which apps a piece of work needs. A real
launcher is a global overlay that forgets the context the moment it closes. Our
tile remembers, because it is part of the desk. The mirror-mode window goes
further still: a live native app embedded in the canvas is something a launcher
cannot do by definition, because a launcher has no canvas to embed it in. None of
this requires the cloud, so the arrangement of which apps belong to which work
stays on the user's machine.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
