# Shape, SME doc (master of destiny)

Tier: Sufficient. This widget does not need to beat Miro at whiteboarding to ship,
it needs to be a clean, reliable visual primitive that makes a desk look composed
and supports light diagramming, so the bar is correctness and polish rather than
category leadership.

## The use case

Someone is arranging a desk and wants to add visual structure that isn't text and
isn't data. They drop a rounded rectangle behind a cluster of notes to group them,
draw an arrow from a research widget toward a writing widget to show the flow of
work, put a coloured diamond on a decision point, or add a labelled box that reads
"Backlog" over a column of cards. The job is small but constant. People reach for a
shape the way they reach for a highlighter, to make the canvas legible at a glance.
The moment of use is "this area needs a frame, a marker, or a connector, and I want
to draw it in two clicks without leaving my desk or opening a separate diagram app."

## Current state

Implemented entirely in `src/renderer/src/components/widgets/ShapeWidget.tsx`. One
widget renders exactly one vector shape as inline SVG with `viewBox="0 0 100 100"`
and `preserveAspectRatio="none"`, so the shape stretches to fill the frame and
resizing the widget resizes the shape. Config is a small JSON blob persisted into
`widget.content` (shape type, fill, stroke, strokeWidth, label), parsed defensively
by `parse()` with a fallback default, written back on a 250ms debounce. The widget
is registered in `src/renderer/src/lib/widgetCatalog.ts` under the Layout category
with a default 200x160 size, and `widgetContentFormat.ts` lets the AI command bar
set the shape's label text but nothing else about its look.

What works today is genuinely solid for what it is. There are nine shape types
(rect, rounded, ellipse, diamond, triangle, hexagon, star, line, arrow), a hover
toolbar with a shape picker, fill and stroke colour swatches, and a stroke-width
slider. Line and arrow correctly suppress the fill control. There is an optional
centred label with inline editing, a "+ label" affordance on hover, and the label
renders with a drop shadow so it stays readable over any fill. Strokes use
`vectorEffect: non-scaling-stroke`, so a thin border stays thin no matter how far
the shape is stretched, which is a real quality detail many quick implementations
miss. The widget adopts content from a synced sibling without a remount, so a shape
edited on one desk updates live on a mirrored desk.

The honest rough edges are about reach, not bugs. There is no native shape-to-shape
connector binding. The "arrow" shape is a picture of an arrow inside a box, not a
connector that attaches to two widgets and re-routes when they move, so anyone
expecting Excalidraw-style bound arrows will be disappointed. Connecting two
widgets has to go through the generic ghost-line wiring that every widget shares,
which draws a link but is not a diagramming connector with elbows or arrowheads.
There is no z-order control, so a shape cannot be reliably sent behind a cluster of
notes to act as a background frame, which is the single most common reason people
add a rectangle in the first place. There is no rotation, no opacity or fill-style
control (no transparent fill, no dashed stroke, no gradient), no multi-select to
recolour several shapes at once, and no shape library or custom polygon. The AI can
only set the label, so "draw a red diamond labelled Decision" is not yet a single
sentence the command bar can satisfy end to end. The colour pickers are raw native
`<input type="color">` swatches with no desk palette, so shapes drift away from the
workspace's accent colours unless the user matches them by hand.

## Best-of-breed landscape

Excalidraw owns the lightweight-diagram high ground. Its arrows bind to shapes
through a real element-binding system, so a connector stays attached and re-routes
when either end moves, and its newer elbow arrows do orthogonal A*-style routing for
clean flowcharts. It also has a hand-drawn aesthetic, a public shape-library
ecosystem, text inside containers, and dashed or transparent fills. This is the tool
a user mentally compares us to the instant they try to connect two boxes.

FigJam owns the team-diagramming-with-intent ground. Its connectors snap onto shapes
and stickies and follow them when moved, it shipped custom connection points with
hover zones that detect whether you mean a cardinal endpoint, the edge of a shape, or
an arbitrary point, and its AI auto-generates whole diagrams (swimlanes, decision
trees) from a prompt. That last point is the bar our in-place AI is implicitly
measured against.

Miro owns scale and breadth. It has frame management, auto-layout of diagrams,
connectors that automatically attach to objects, and the deepest shape and template
library in the category. For a user who already runs workshops in Miro, our nine
shapes read as a starter set.

tldraw is the developer-grade canvas and sets the polish bar for the primitives
themselves: clean geometric shapes, precise resize and rotate handles, snapping, and
a professional default look. It is what "a shape should feel this good to drag"
points at.

What we already do better or uniquely could is the context. Our shape lives on the
same infinite canvas as the live browser tab, the timer, the table, and the desk
agent for the same piece of work, not on a separate diagram board you switch to. It
can be wired to other widgets through the ghost-line system rather than only to other
shapes, so a shape can be a visual node in a graph of real working tools. Its look
could be driven by the desk's own palette and reshaped by in-place AI, and every byte
stays local. No whiteboard incumbent has the canvas plus in-place AI plus local-first
combination, and none of them treat a shape as a first-class node that can connect to
a functional widget rather than to another drawing.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. No z-order control (Miro frames, every whiteboard). "I dropped a rectangle to
   frame my three notes and it covered them instead of sitting behind them." This is
   the most common reason a shape exists and today it fails the moment of use. Highest
   priority because it breaks the primary job, not an advanced one.
2. The arrow is a drawing, not a connector (Excalidraw, FigJam). "I want an arrow
   from the research widget to the draft widget that follows them when I move them."
   Today the arrow shape is static and cannot bind to anything.
3. No dashed stroke, transparent fill, or opacity (Excalidraw, FigJam). "I want a
   dashed outline group box with no fill so the notes show through." Today every fill
   is opaque and every stroke is solid, so the framing use case looks heavy.
4. AI can only set the label (FigJam AI, our own table widget). "Draw a red diamond
   labelled Decision." The command bar can place a shape and name it but cannot pick
   the shape type or colours, so the natural-language path stops short.
5. No rotation (tldraw, every whiteboard). "Tilt this arrow to point up-and-right."
   Shapes are axis-aligned only, which the triangle and arrow feel most constrained by.
6. No desk-palette colours (Miro themes). "Make this match my workspace accent." The
   raw colour pickers let shapes drift off-palette, so a desk full of shapes looks
   noisier than the rest of the workspace.
7. No multi-select recolour or shape library (Miro, Excalidraw libraries). "Recolour
   these five boxes at once" and "give me a flowchart shape set." Both are breadth
   gaps that matter once someone diagrams in earnest, lower priority than the basics.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")

Z-order control so a shape can be a background frame. Add send-to-back and
bring-to-front actions wired to the widget store's stacking so a rectangle can sit
behind a cluster of notes, and make the shape widget default to a sensible lower
stack position when it is the rect or rounded type. Acceptance: a user drops a
rounded rectangle over three notes, sends it to back in one action, the notes stay
fully visible and clickable on top of it, and the order survives reload. This is the
moment that beats nobody by name but unblocks the widget's own core job.

Dashed stroke and transparent or no fill. Add a fill-style control (solid, none) and
a stroke-style control (solid, dashed) to the hover toolbar, persisted in the JSON
config. Acceptance: a user makes a dashed-outline box with no fill that shows the
notes underneath, matching the group-frame look Excalidraw and FigJam users expect,
so we now beat a blank "opaque only" experience at the framing job.

Full AI shape creation. Extend `widgetContentFormat.ts` (and the create path the
command bar uses) so the AI can set shape type, fill, stroke, and strokeWidth, not
only the label. Acceptance: "draw a red diamond labelled Decision" produces exactly
that in one sentence, reaching parity with FigJam's prompt-to-element path for the
single-shape case.

### Launch-polish

Real connector mode for the arrow and line. Let an arrow or line bind its two
endpoints to widgets so it follows them when they move, reusing the ghost-line
anchor data rather than inventing a parallel system, and draw a proper arrowhead at
the bound end. Acceptance: an arrow drawn from the research widget to the draft
widget stays attached and re-routes when either is dragged, closing the headline
Excalidraw and FigJam connector gap for the common two-widget case.

Rotation handle. Add a rotation grip to the frame for shape widgets and persist the
angle. Acceptance: a triangle or arrow can point in any direction, matching the
tldraw and Miro baseline for shape manipulation.

Desk-palette colour pickers. Replace the raw native colour inputs with swatches
seeded from the workspace accent and recent colours, keeping a custom picker as a
fallback. Acceptance: a new shape defaults to an on-palette fill and a user can
recolour to a theme colour in one click, so a desk full of shapes reads as composed
rather than noisy.

### Post-launch (pull ahead)

AI diagram from a sentence. "Sketch a three-step approval flow" places three labelled
boxes and connects them with bound arrows on the canvas, the FigJam-AI move but
landing among real working widgets rather than on a separate board. This is only
possible once connector mode and full AI shape creation exist.

Wire-driven shape state. A shape's fill or label reacts to a wire from another
widget or a desk agent, so a status box turns green when a linked task completes,
using our unique canvas wiring to make a shape a live indicator rather than static
decoration.

Multi-select and a small shape library. Recolour or restyle several selected shapes
at once and offer a curated flowchart and annotation shape set, closing the breadth
gap with Miro and Excalidraw libraries for users who diagram in earnest.

## The unfair advantage

Only Haptyx can let a shape be a first-class citizen of a working desk rather than a
drawing on a separate board. The arrow that connects two boxes can instead connect
the live browser tab to the draft document through the same ghost-line wiring every
widget shares, so a shape becomes a visual node in a graph of real tools, not just
other shapes. A desk agent or a wire can drive a shape's colour or label so it
reports live state, and an in-place AI can draw and style it from a sentence while it
sits next to everything else for the task. Add local-first privacy, and the result
is a shape that does the small framing-and-flow job every whiteboard does, but
embedded in the one surface where the actual work already lives, which no incumbent
can match because none of them put functional widgets and drawings on the same
canvas.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
