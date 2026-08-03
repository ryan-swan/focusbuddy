# Section, SME doc (master of destiny)

Tier: Strong. A Strong widget does not have to win its category outright at
launch, but it has to feel deliberate and solid for its core on-canvas job, so
that grouping things on a Haptyx desk is clearly nicer than leaving them loose
and never feels like a half-built afterthought.

## The use case

Someone has been working on a task for a while and the desk is getting busy.
There is a cluster of notes for the research phase, a couple of browser tabs and
a table for the build phase, and a timer and a todo list floating off to one
side. They want to draw a boundary around the related things, give that boundary
a name and a colour, and from then on treat it as one unit they can move, tidy,
collapse out of the way, or hand to someone. The moment of use is "these five
things belong together, let me wrap them so the desk reads as phases of work
rather than a pile." Section is the widget people reach for when the canvas has
earned some structure and they want a container that organises without forcing
them into a rigid template.

## Current state

Section is a real canvas object backed by the same `widgets` table as every
other widget. Its container nature lives in two columns, `parent_section_id` and
`layout`, defined in `src/shared/types.ts` (the `SectionLayout` union is
`free | grid | stacks | icons | list`) and persisted through
`src/main/db/widgets.ts`. A widget belongs to a section when its
`parentSectionId` points at the section's id; the section itself never stores a
child list, membership is always derived by filtering. The component is
`src/renderer/src/components/widgets/SectionWidget.tsx` and all of its geometry
maths lives in `src/renderer/src/lib/sectionGeometry.ts`.

What works today is more than it looks. A section auto-sizes to its contents.
`computeSectionFrame` measures the children under the current layout and grows or
shrinks the frame to fit, so there is no manual resize handle and there is never
a mismatch between the visible card and what it holds. Five layouts actually do
different things. Free preserves each child's stored relative position, grid
tiles them into a square-ish arrangement capped at four columns, stacks fans them
with a fixed offset, and icons and list collapse children into compact tiles or
rows that no longer render the full widget, computed in `computeLayoutCells`.
Membership has three honest entry points. You can drop a widget onto a section
and `findHoveredSection` in `WidgetFrame.tsx` claims it, you can marquee-select
loose widgets and wrap them in a new enclosing section (the wrap path in
`Canvas.tsx` around line 878 that converts each child's world coordinates into
section-local ones), and the AI Smart Stacking flow in `src/main/ai/anthropic.ts`
reads the unsectioned widgets on a task and proposes named semantic groups that
`SmartStackModal.tsx` turns into real coloured sections. Getting things back out
is equally deliberate. Compact children can be dragged off the card and land on
the desk at the drop point via the `useEjectDrag` gesture, there is a per-child
eject button, and removing or archiving a section ejects its children back onto
the canvas with their coordinates translated rather than silently losing them.
Sections also rename, recolour from a six-swatch palette, pin to the screen,
duplicate as an empty copy, promote to a task, link to other widgets through the
hub button, and share through `ShareDialog`. The reverse-magnetic non-overlap
logic in `findNonOverlapPosition` keeps a dropped section from landing on top of
its neighbours.

The honest rough edges are real. There is no collapse. A section is always
expanded to its full footprint, so the icons and list layouts are the only way to
shrink a busy group, and even those still occupy space rather than folding to a
title bar. Sections cannot be nested, a section is excluded from
`findHoveredSection`, so you cannot build phases-within-phases the way every
serious canvas tool allows. There is no manual resize and no fixed-size mode, the
frame is entirely content-driven, which is elegant but means you cannot reserve
empty space or set a deliberate shape. View configuration is thin, layout is a
single five-way switch with no control over columns, gap, sort order, alignment,
or which field drives anything, and the grid column cap of four is hard-coded.
There is no lock to protect a section and its contents from accidental moves or
edits, no presentation or step-through ordering, and no way to collapse every
section at once to get an overview. The AI only ever creates sections through
Smart Stacking, it cannot move an existing widget into an existing section or
rename and recolour one on request, because the action vocabulary in
`actionExecutor.ts` has no membership verb.

## Best-of-breed landscape

FigJam Sections own the whiteboard-organisation job we are closest to. A FigJam
section is a named, coloured region you draw around content, it can contain other
sections so you get true nesting, and crucially it can be locked so the section
and its contents do not move or get edited by accident, with a background-only
lock that freezes the frame while leaving the content editable. Sections there
also carry into prototyping and presentation flow. That lock and that nesting are
the two things they do that we simply cannot today.

Miro splits the job across Frames and Containers and does both well. Frames are
named parent regions that show up in a Frames panel for quick navigation, can be
hidden to run a workshop step by step, can be presented and exported to PDF, and
can be locked. Containers are the diagramming-oriented variant that nest to form
subsections. The navigation panel, the hide-to-reveal facilitation move, and
present/export are all things our flat, always-visible model has no answer for.

tldraw, which is the closest neighbour to us as an in-app infinite-canvas
engine, separates frames from groups cleanly and supports nesting and hierarchy
in groups. Their 2025 release rewrote alignment, distribution, packing and
stacking so that arranging shapes inside a region is precise, and bring-forward
and send-backward respect only nearby shapes. Our single grid layout is coarse by
comparison, we have no align or distribute and no real packing control.

Apple Freeform is the consumer benchmark for "wrap related things and move them
as one" with almost no ceremony, and it sets the expectation that grouping is
instant, forgiving, and visually clean, which is the exact register our Strong
tier is aiming at.

Mural reframes the region as a facilitation surface. Areas plus the summon
feature let a facilitator pull everyone to a region, an outline steps a group
through the board, and a timer boxes the activity. None of that is grouping per
se, but it is what a named region unlocks once collaboration matters, and it is a
direction our share pipeline could grow into.

Notion is worth naming for the layout-without-a-region pattern, toggles that
collapse a block list and columns that arrange content, because it shows that the
collapse-to-a-heading behaviour we lack is table stakes for "organise a pile."

What we already do better or uniquely could is specific and defensible. Our
section auto-sizes to its contents with zero handles, where most of these tools
make you draw and re-draw the region by hand. Membership can be created by an AI
that reads the desk and proposes named, coloured groups in one move, which none
of FigJam, Miro, tldraw, or Freeform does, because they have no in-canvas model
of your work to reason about. The section is wireable to other widgets and to
desk agents through the ghost-line system, so a region is not just a visual
boundary, it can be a node in a flow. And the whole thing is local-first, the
membership and layout never leave the machine, which is the opposite of the
cloud-board incumbents.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No collapse to a title bar (Notion, FigJam, Miro hide-frame).** "My
   research phase is done, fold it to a labelled strip so the desk shows the
   phases I am still working on." Today the only way to shrink a group is the
   icons or list layout, which still takes space. This is the most felt absence
   for the everyday tidy-up moment, and it is the single thing that makes a
   section feel like a real container rather than a coloured outline.
2. **No nesting (FigJam, Miro Containers, tldraw).** "Wrap the whole project,
   then wrap each phase inside it." A section refuses to join another section,
   so structure stays one level deep and large desks cannot be organised
   hierarchically.
3. **No lock (FigJam, Miro).** "I have arranged this section exactly right, stop
   me dragging it or its contents by accident." There is no way to protect a
   section, so a stray drag reshuffles careful work.
4. **Thin layout configuration (tldraw arrange, Figma auto layout).** "Make it
   three columns with more breathing room, sorted newest first." Layout is a
   five-way switch with a hard-coded four-column grid cap, no gap, alignment,
   sort, or column control, so the auto-arrangement is take-it-or-leave-it.
5. **AI cannot manage membership (our own Smart Stacking, half-built).** "Move
   the timer into the Focus section and rename it Deep Work." The AI can create
   sections from scratch but has no verb to move an existing widget into an
   existing section or to rename and recolour one, so the in-place-AI promise
   stops short exactly where it would be most useful.
6. **No overview or navigation of sections (Miro Frames panel).** "Show me every
   section on this task and jump to one." On a busy desk there is no list of
   sections and no collapse-all, so the organising structure you built does not
   help you navigate.

## The supersonic plan

### Launch-blocking (must ship to clear "Strong")
- **Collapse to a title bar.** A caret on the section header that folds the card
  to its coloured handle plus a child count, persisted on the widget so it
  survives reload, with the children hidden but their membership intact.
  Acceptance: a user collapses a finished phase to a strip, reloads, and it is
  still collapsed; we now match Notion and FigJam at fold-away-a-finished-group.
- **Section lock.** A lock toggle on the header that freezes the section position
  and blocks its children from being dragged, with a clear locked affordance.
  Acceptance: with a section locked, a drag on the section or any child is a
  no-op and nothing repositions; we now match FigJam and Miro at protect-this-region.
- **Layout configuration for grid and icons.** Expose column count (lifting the
  hard-coded four-column cap), gap, and a simple sort (creation order, title,
  or kind) on the grid and icons layouts, persisted per section.
  Acceptance: a user turns a six-child section into a clean three-column grid
  sorted by title without touching any child; we now beat our own coarse
  auto-arrange and approach tldraw's arrange control for the common case.

### Launch-polish
- **One level of nesting.** Allow a section to be dropped into another section
  and let `findHoveredSection`, `computeSectionFrame`, and the eject paths handle
  a section as a child. Cap depth at two to start so the geometry stays sane.
  Acceptance: a project section contains two phase sections and moving the parent
  moves all of it; we now match FigJam and tldraw at phases-within-phases.
- **AI membership verbs.** Add move-into-section and update-section actions to the
  proposal vocabulary in `actionExecutor.ts` and the Anthropic schema, so the
  command bar can say "put the timer in the Focus section and call it Deep Work."
  Acceptance: a single natural-language command moves an existing widget into an
  existing section and renames it, applied through the normal proposal chain;
  this is a thing no incumbent can do at all.
- **Sections overview and collapse-all.** A small panel or command listing every
  section on the task with jump-to, plus a collapse-all and expand-all toggle.
  Acceptance: on a desk with five sections a user collapses all of them and jumps
  to one from the list; we now match Miro's Frames panel for navigation.

### Post-launch (pull ahead)
- **Section as a flow node.** Lean into the unique wiring so a wire into a section
  routes new widgets into it as members, and a desk agent can target a section by
  name, research results land inside the right region automatically.
  Acceptance: a wire from a browser widget into a section makes captured pages
  appear as members of that section, something no canvas tool can do because they
  have no in-canvas wiring.
- **Facilitation surface on a shared section.** When a section is shared, add a
  summon-and-step-through so a host can walk recipients across the regions of a
  desk, taking the ground Mural owns but on a local-first, per-widget share.
  Acceptance: a host shares a desk and steps a guest through three named
  sections in order.
- **Smart layout suggestions.** Let the AI propose a layout and configuration for
  an existing section from its contents, "these are nine reference links, show
  them as a four-column icon grid," extending Smart Stacking from creation into
  ongoing arrangement.
  Acceptance: a one-click suggestion re-lays-out a section sensibly given what is
  in it.

## The unfair advantage

Two things are ours alone here. The first is AI that already understands the desk
well enough to draw the boundaries for you. Smart Stacking reads the loose
widgets on a task and proposes named, coloured sections in one move, and the
plan above extends that same understanding to moving widgets between existing
sections and arranging them, so on Haptyx a section is something the system can
create and maintain on your behalf, not just an empty rectangle you draw. No
cloud whiteboard has a model of your work to reason about, so none of them can do
this. The second is that a section is a node in the canvas wiring, not only a
visual container. Because the ghost-line system can connect a section to other
widgets and to desk agents, a region can route work into itself, a wire that
feeds it captures, an agent that targets it by name, which turns "a box around
related things" into "a place work flows to." Both of these live entirely on the
user's machine, the membership, the layout, and the AI's reasoning over them
never leave local storage, so the organising structure of your work stays private
in a way the incumbents structurally cannot match.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
