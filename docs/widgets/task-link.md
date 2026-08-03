# Task link, SME doc (master of destiny)

Tier: Sufficient. This widget does not have to beat best of breed at launch. It
has to do its one job cleanly and honestly, hold its place next to the heavier
widgets, and not embarrass the canvas. The bar is "small, correct, useful," not
"category-defining."

## The use case

Someone is working on one task at their desk and another task is relevant to it.
Maybe it is the next thing they will do, maybe it is a dependency they keep
glancing back at, maybe it is the parent goal they want kept in sight while they
grind on a sub-piece. They drag that other task from the sidebar onto the canvas
and a small card appears that names it, shows where it sits in the project tree,
shows when it is due, and gives them a one-click way to either jump to it or start
a quick five-minute push on it without leaving the desk they are in. The moment of
use is "this other task matters to what I am doing right now and I want it pinned
here in front of me, not buried in a list I have to go hunting through."

## Current state

The widget is rendered by
`src/renderer/src/components/widgets/TaskLinkWidget.tsx`. It is a thin reference,
not a copy. It stores a single referenced task id in `widget.content` and looks
that task up live from the node store on every render
(`nodes.find((n) => n.id === targetId && n.kind === 'task')`), so the card always
reflects the real task and never drifts out of date. Creation is by drag: the
sidebar sets a `text/fb-task-link` payload when a task row is dragged
(`Sidebar.tsx` around line 207), and the canvas drop handler spawns the widget at
the cursor with the dragged task id as content
(`Canvas.tsx` around line 1560). The catalog entry lives in
`widgetCatalog.ts` and the kind is registered for the right-click create menu in
`createConnectedTool.ts`, gated under the `widget_task_list` capability in
`gating.ts`.

What works today is genuinely solid for what it is. The card shows a status icon
that changes with the task state, the title as a button that opens the task, the
full project breadcrumb path via `projectPath(nodes, task.id)`, and a due chip
that computes days remaining and colours itself red when overdue, amber when due
within a day, and neutral otherwise, with friendly labels like "due tomorrow" and
"3d late." The two action buttons are the real value. "5 min" calls
`startSession(task.id, 5 * 60, '5min')`, flips an open task to in_progress, plays
the power-on sound, and navigates to the task. "Open" just sets it active and
navigates. It renders inline inside focus mode as well as framed on the canvas,
and it degrades honestly: if the referenced task was deleted or moved, it shows a
clear "Referenced task was deleted or moved" state with a broken-link icon rather
than crashing or showing a stale ghost.

The honest weaknesses are about reach, not correctness. The reference is one-way
and invisible from the other side. The task it points at has no idea it is being
referenced, so there is no backlink, no "2 desks reference this task" awareness,
nothing that lets you navigate from the target back to the cards that point at it.
The only way to create one is to drag from the sidebar, so it cannot be created by
typing, by AI, by pasting a task link, or from the right-click create-and-connect
menu even though the kind is technically listed there. It carries no relationship
semantics, so it cannot say this task blocks that one, or depends on it, or is a
duplicate of it. It does not participate in widget wiring, so a ghost-line wire
cannot feed a task reference into an agent or pull the referenced task's state out
into another widget. And it is single-target only. There is no way to pin a small
cluster of related tasks as one object, so a desk that relates to five other tasks
needs five separate cards.

## Best-of-breed landscape

Notion owns the cross-reference and embed end of this job. An @mention drops an
inline link to any page and gives you a backlink for free on the target, a synced
block lets the same content live in many places and update everywhere at once, and
a linked database view shows a filtered slice of tasks somewhere else while staying
the one real dataset underneath. The lesson from Notion is that the value is in the
two-way awareness and the live filtered slice, not in the single card.

Linear owns relationship semantics. It is not enough there to say "these two issues
are connected." You say one blocks the other, or is blocked by it, or relates to
it, or duplicates it, and the parent and sub-issue hierarchy is first class. Those
typed relations drive real behaviour like dependency visibility and ordering. That
is the gap between a decorative reference and a structural one.

Things 3 owns the deep-link mechanic. Every to-do has a stable `things:///show?id=`
URL you can copy from a right-click and paste anywhere, including outside the app,
to jump straight back to that exact item. The lesson is that a task reference is
most useful when it is a portable, copyable address, not only an in-app drag.

Todoist owns frictionless creation and the sub-task break-down flow. You can bulk
paste a list and turn it into sub-tasks, quick-add is everywhere, and breaking a
big task into linked smaller ones is a one-gesture habit. The lesson is that
creation speed and "make this a child of that" are where the daily value lives.

What we already do better, or uniquely could, is the part none of them have. Our
task link sits on an infinite canvas right next to the live browser tab, the note,
and the timer for the work in front of you, so the reference is spatial and in
context rather than a line of text in a list. The "5 min" button means a reference
is also an action, you can start focused work on the linked task without leaving
your desk, which no incumbent reference offers. And it is local-first, the task and
its whole tree live on the machine, so there is no sync round-trip and no privacy
cost to pinning sensitive work in front of you.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. No backlink or reverse awareness (Notion). "I am looking at this task and I want
   to know which desks and which other tasks point at it." Today the reference is
   invisible from the target side, so you can never navigate or reason backwards.
   This is the single biggest gap because it turns a one-way decoration into a
   real graph.
2. Drag is the only way to create one (Todoist, Things). "I am mid-thought in the
   command bar and I want to pin the task I just named without going to the sidebar
   and dragging." There is no type-to-create, no AI-create, no paste-a-task-link,
   and the right-click create menu lists the kind but cannot actually seed a target.
3. No relationship type (Linear). "This linked task is not just related, it blocks
   me, and I want the card to say so." Without typed relations the card cannot
   express dependency, parent, or duplicate, which is most of why people link tasks
   at all.
4. No portable link (Things). "I want to copy a reference to this task and paste it
   into a note, a doc, or another desk." There is no copyable stable address for a
   task, so references cannot travel.
5. No wiring participation (our own canvas). "I want to wire this referenced task
   into an agent so the agent knows what I am working toward." The widget does not
   act as a wire source or target, so it is cut off from the thing that makes our
   canvas special.
6. Single target only (Notion linked views). "Five tasks feed this one, and I want
   them as one tidy cluster, not five cards." Today that is five separate widgets
   with no grouping.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")

- Type-to-create and AI-create. The command bar and the voice/AI command path
  should both be able to create a task link by name match against existing tasks,
  and the right-click create-and-connect menu should resolve to a real target
  picker instead of seeding an empty card. Acceptance: a user can say or type "link
  the API migration task here" and get a working card without touching the sidebar,
  so we match Todoist on creation friction for the canvas case.
- Graceful empty and ambiguous states. When create-by-name matches zero or several
  tasks, the card should offer a small inline picker rather than spawning a broken
  link. Acceptance: creating a link to a name that matches two tasks shows a choose
  prompt, never a dead card, so the honest broken state only ever appears for true
  deletion.

### Launch-polish

- Backlink awareness on the target. When a task is referenced by one or more
  task-link cards, the task view shows "referenced by N desks" with navigation back
  to each card. Acceptance: opening a referenced task lists every card that points
  at it and clicking one jumps to that desk, matching Notion's free-backlink
  behaviour for the canvas.
- Copyable task link. A right-click "copy link to task" that yields a stable
  internal address which, pasted onto a canvas or into a note, becomes a task-link
  card or an inline reference. Acceptance: a copied task link pasted onto another
  desk recreates the reference, matching the portability Things gives every to-do.
- Relationship type on the card. Let a link carry an optional relation of blocks,
  blocked-by, depends-on, parent, or related, shown as a small labelled chip.
  Acceptance: a card can read "blocks" with the relation visible at a glance,
  giving us the first slice of Linear's typed relations.

### Post-launch (pull ahead)

- Wire participation. Make the task-link card a valid ghost-line source so a wire
  from it into a desk agent hands the agent the referenced task and its tree as
  context, and a valid target so an agent can set the referenced task's status or
  due date. Acceptance: wiring a task link into an agent and asking it to "push
  this forward" updates the real task, which no incumbent reference can do because
  none live on a wired canvas.
- Task cluster card. A single widget that pins a small set of related tasks with
  their status and due chips, created from a multi-select drag. Acceptance: five
  related tasks become one tidy cluster card with per-row open and 5-min actions,
  beating five loose cards on tidiness the way a Notion linked view beats five
  pasted links.
- AI relation inference. When a task is linked, the desk agent can suggest the
  likely relation, for example proposing "this looks like it blocks your current
  task," for one-click confirm. Acceptance: linking a plausibly-blocking task
  surfaces a suggested relation chip, something Linear cannot do because it has no
  in-place desk AI.

## The unfair advantage

Only Haptyx can make a task reference that is also an action and also a wire. On
every incumbent a link to another task is inert, you click it and you go there. On
our canvas the same card can start a five-minute focus session on the linked task
without leaving the desk, and once it participates in wiring it can hand the
referenced task to a desk agent as live context or let that agent push the task
forward, all while the entire task tree stays local on the machine. A reference
that does work, on a surface where it sits beside the live tabs and notes and timer
for the task you are actually doing, is a different kind of object from a backlink
in a list, and it is the one thing none of Notion, Linear, Things, or Todoist can
copy without becoming a canvas.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
