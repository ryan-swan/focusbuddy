# Minimap, SME doc (master of destiny)

Tier: Sufficient. The minimap is a navigation aid, not a headline feature people
choose Haptyx for, so it has to be reliably good enough that nobody fights the
canvas to find their stuff. It does not have to win an awards category, it has to
disappear into the workflow.

## The use case

Someone has filled a desk with widgets. There are sticky notes off to the right,
a browser tab they parked an hour ago in the top corner, a table and a timer in
the middle, maybe a couple of sections grouping related work. The canvas is
infinite, so it is entirely possible to lose a widget by panning past it. The
minimap is the thing they glance at to answer "where is everything, and where am
I right now", and the thing they click or drag to teleport back to a region
without zooming out, hunting, and zooming back in. The moment of use is "I know I
made that note somewhere up and to the left, take me there", or simply "I have
drifted and I want to see the whole desk at a glance again".

## Current state

The minimap is a first-class widget kind rendered by
`src/renderer/src/components/widgets/MinimapWidget.tsx`. It used to be a hardcoded
fixed-position element drawn by `Canvas.tsx`; it was promoted to a real widget so
it gets the standard chrome, lives in the widget picker
(`src/renderer/src/lib/widgetCatalog.ts`, kind `minimap`), and persists per task
through `fb_widgets` (`src/main/db/widgets.ts`). Auto-create still lives in
`Canvas.tsx`: on opening a task, if no minimap exists for that task and the
`fb-minimap-dismissed:{taskId}` localStorage flag is not set, one is spawned
pinned to the bottom-right. Deleting it writes the dismissed flag so it does not
keep coming back, and the user can always re-add it from the picker.

What works today is genuinely good for a navigation aid. It renders true,
content-aware thumbnails of each top-level widget by drawing the real widget
through `WidgetPreview` scaled down, so the map looks like the desk rather than a
field of grey boxes. It draws a live viewport rectangle showing exactly what
slice of the canvas you are looking at, computed from pan and zoom. Click
anywhere on the map and it pans you there; press and drag to scrub the viewport
around continuously. Clicking a thumbnail calls `zoomToWidget` to fly straight to
that widget. There is a hover magnifier that pops a legible, real-size preview of
a widget beside its thumbnail with a jump-to button and an open-in-focus button,
so you can read or act on a widget without leaving the map. Sections render as
translucent frames using `computeSectionFrame`, a small zoom-percentage badge
sits in the corner, and an empty-canvas state shows a hint so the widget never
looks broken. The bounding box is inflated by half a viewport so panning past the
widget cluster still maps somewhere useful, and the whole SVG re-measures itself
with a `ResizeObserver` so it stays correct as you resize the widget or the
window.

The honest rough edges are these. There is no scroll-to-zoom on the map itself,
so you cannot adjust the canvas zoom level from the minimap, only pan. The
content-aware thumbnails are the expensive part: every visible widget is rendered
a second time through `WidgetPreview` inside a `foreignObject`, and on a busy desk
with heavy widgets (a live browser, a video) that is real work on every store
update, with no virtualization, throttling, or freeze-while-idle. The viewport
rectangle is clamped to the map edges with `Math.max`/`Math.min`, which keeps it
on screen but means it silently misreports when you pan far outside the inflated
bounding box rather than showing an honest off-map indicator. Pinned widgets,
archived widgets, and section children are excluded from the map by design, but
there is no way to toggle them on if you actually want to find a pinned widget.
There is no current-widget or selection highlight on the map, no labels on the
thumbnails, no filtering or search, and no keyboard affordance (Miro's `M` to
toggle has no equivalent here). The map is per-task and does not show anything
about other tasks or the wider workspace.

## Best-of-breed landscape

Miro owns the whiteboard minimap. It sits bottom-right, toggles with the `M`
hotkey, lets you click to move and drag the visible-area frame, and scales
sensibly on enormous boards. It is the reference for "a minimap that just works"
on an infinite collaborative canvas, and it is the thing people will
unconsciously compare ours to.

Figma and FigJam are interesting because they famously do not ship a native
canvas map; the gap is filled by a thriving ecosystem of community plugins like
Minimap, Mini Map Pro, MAPPE, NavJam, and Canvas Map. Those plugins compete on
click-to-pan, zoom-to-layer on click, hover tooltips that name the layer, and
real-time tracking of the viewport. They tell us what users on a design canvas
actually want from a map even when the host app refuses to build one.

tldraw is the closest technical neighbour because it is an infinite-canvas SDK,
and as of version 4.1 it ships minimap filtering, which is exactly the
toggle-what-the-map-shows control we lack. Its camera and navigation controls are
the engineering bar for smooth, correct viewport math on an infinite surface.

VS Code and Sublime Text own the other meaning of minimap, the code overview in
the editor gutter. Sublime's minimap shows a reduced render of the whole file
with the visible portion highlighted and lets you scrub by dragging; VS Code
copied it well. They matter to us because they set the expectation that a minimap
is a faithful, content-shaped reduction you navigate by dragging, not an abstract
schematic, which is precisely the bet our thumbnail approach makes.

What we already do better or uniquely could is the content-aware thumbnail
rendered from the real widget rather than a coloured rectangle, combined with the
hover magnifier that lets you preview and act on a widget straight from the map.
Miro shows shapes; we show the actual living sticky, table, or browser. Layered on
top of that we have things no incumbent can reach: the map sits on the same
local-first canvas as in-place AI and ghost-line wires, so the map can become a
control surface for the desk rather than just a viewfinder.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No zoom control from the map (Miro, VS Code, Sublime).** "I want to drag the
   viewport frame smaller to zoom in on that corner." Today you can only pan; you
   cannot change zoom from the map, so the map is a pan tool, not a full camera
   tool. This is the most felt gap because every reference product lets you zoom
   from the overview.
2. **No current-widget or selection highlight (tldraw, Figma plugins).** "I
   selected a widget, now show me where it is on the map." The map never reflects
   what is selected or focused, so it cannot answer "where is the thing I am
   working on right now".
3. **Thumbnail render cost with no throttling (tldraw camera engine).** "My desk
   has a live browser and the whole app feels heavier with the minimap open."
   Re-rendering every widget through `WidgetPreview` on each store update is the
   one place the map can make the app feel slow, and the engineering bar set by
   tldraw is smooth navigation that never taxes the canvas.
4. **No toggle for what the map shows (tldraw 4.1 minimap filtering).** "I pinned
   a reference widget and now I cannot find it on the map." Pinned, archived, and
   section-child widgets are excluded with no way to opt them back in.
5. **No keyboard toggle or hotkey (Miro `M`).** "I want the map out of the way
   most of the time and one keystroke to glance at it." The map is always a
   visible widget or fully gone, with no quick peek.
6. **No labels, search, or off-map indicator (Figma plugins, Miro).** "Take me to
   the note that says draft, and tell me honestly when I have drifted off the
   mapped area." Thumbnails are unlabelled, there is no search, and the clamped
   viewport rectangle hides the fact that you are outside the mapped region.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")

- **Zoom from the map.** Add scroll-to-zoom over the map surface and drag-handles
  on the viewport rectangle so resizing the frame changes canvas zoom, with the
  click-to-pan and drag-to-scrub behaviour preserved. Acceptance: a user can drag
  the viewport frame smaller and the canvas zooms into that region, matching the
  pan-and-zoom-from-overview behaviour people expect from Miro and code-editor
  minimaps.
- **Current-widget and selection highlight.** Draw a distinct ring on the
  thumbnail of the focused or selected widget, driven by the existing focus and
  selection state in the widget store. Acceptance: selecting a widget on the
  canvas immediately marks it on the map, so the map answers "where am I working"
  the way tldraw and the Figma plugins do.
- **Throttle and guard the thumbnail render.** Memoise `WidgetPreview` output per
  widget, skip re-render when only pan or zoom changed (those move the viewport
  rect, not the thumbnails), and cap or simplify thumbnails for heavy live
  widgets when the map is small. Acceptance: opening the minimap on a desk with a
  live browser adds no perceptible frame-time cost during normal panning, closing
  the one place we are slower than tldraw's camera engine.

### Launch-polish

- **Show-what-the-map-shows toggle.** A small control to include pinned and
  archived widgets in the map, matching tldraw 4.1's minimap filtering, so a
  pinned reference is findable. Acceptance: a user with a pinned widget can toggle
  it onto the map and click to jump to it, parity with tldraw filtering.
- **Off-map honesty.** When the viewport sits outside the inflated bounding box,
  draw a directional edge indicator instead of silently clamping the rectangle.
  Acceptance: panning far past every widget shows an arrow pointing back to the
  cluster rather than a misleading frame stuck to the map edge.
- **Keyboard toggle.** A hotkey to peek the minimap and dismiss it, the Haptyx
  answer to Miro's `M`. Acceptance: one keystroke shows the map and the same
  keystroke hides it, without deleting the widget or tripping the dismissed flag.
- **Thumbnail labels on hover and small search.** Show the widget title in the
  existing magnifier header (already partly there) and add a tiny filter box that
  dims non-matching thumbnails. Acceptance: typing a word in the map narrows the
  thumbnails to matches and clicking jumps there, the Figma-plugin tooltip-and-
  find behaviour.

### Post-launch (pull ahead)

- **The map as a control surface, not just a viewfinder.** Let a user act on the
  desk from the map: drag a thumbnail to reposition the real widget, right-click a
  thumbnail to run a desk agent on it, or drop a ghost-line wire from one
  thumbnail to another to wire two widgets without leaving the overview.
  Acceptance: a user wires two widgets together entirely from the minimap, which
  no incumbent can do because none have our wires.
- **AI "take me to" navigation.** Ask in the command bar to jump to "the note
  about pricing" and the map flies there, using in-place AI over the local widget
  contents. Acceptance: a natural-language jump lands on the right widget, a thing
  no minimap anywhere does.
- **Cross-task / workspace overview.** A zoomed-out mode that maps other desks as
  miniatures (the `DeskMiniature` component already renders this) so the minimap
  doubles as a workspace switcher. Acceptance: from one desk you can see and jump
  to another task's desk through the map.

## The unfair advantage

Only Haptyx can make the minimap show the real, living content of every widget
because the thumbnails are the actual widgets rendered small, not abstract
shapes, and only Haptyx can turn that overview into a place you act rather than
just look. Because the map sits on the same local-first canvas as the ghost-line
wires and the desk agents, the post-launch plan can let a user wire two widgets or
fire an agent straight from a thumbnail, and because in-place AI reads the local
widget contents, the map can answer a spoken "take me to the pricing note". A
whiteboard minimap moves a camera. Ours can become the smallest possible control
room for the whole desk, and every byte of it stays on the user's machine.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
