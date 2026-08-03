# Mind map, SME doc (master of destiny)

Tier: Hero. This is one of the widgets people will judge Haptyx on, so it has to
clearly beat best of breed for its core on-canvas job at launch, and our version
carries extra weight because it is the widget that turns thinking into action
through agents and child canvases.

## The use case

Someone has a tangle in their head and wants to think it out, not just store it.
A feature they are scoping, a launch they are planning, a research question they
are pulling apart, a decision with five branches they cannot hold in working
memory at once. They want to drop a root idea on the canvas and pull it apart
into branches, let an AI push each branch forward instead of staring at a blank
node, and then turn the good branches into real work without leaving the surface.
The moment of use is "I have one fuzzy idea and I want to explode it into a
structure I can act on, right here next to the notes and tabs and timer for the
same piece of work." The thing that makes ours different from a whiteboard map is
that a node is not just a label, it can become a task, spawn its own canvas, carry
attached widgets, and be handed to an agent that proposes the next moves.

## Current state

Rendered by `src/renderer/src/components/widgets/MindMapWidget.tsx` (a large
single file, roughly 2500 lines), with the AI pipeline in
`src/main/ai/mindMap.ts` and a node-canvas onboarding panel in
`src/renderer/src/components/MindmapStartingKit.tsx`. The widget is registered in
`src/renderer/src/lib/widgetCatalog.ts` as kind `mindmap` and is snapshot-aware in
`src/renderer/src/lib/canvasSnapshot.ts`. There is no dedicated database table.
The entire map persists as a JSON blob in `widget.content`, parsed and written
back on every mutation through the `persist` function. That is simple and
local-first, and it is also a real ceiling we should be honest about.

What works today is more than a toy. The tree is laid out by a custom recursive
walker (`layoutTree`) into an SVG with curved edges, where each node is a rounded
rectangle coloured by kind (idea, task, question, tool, agent). AI Expand sends
the path from the root down to the selected node to Claude (`expandMindMapNode`,
Sonnet) so the model follows the thread of thought rather than treating a node in
isolation, and it returns as many or as few branches as the idea genuinely
warrants rather than padding to a quota. Those branches do not just appear, they
land as pending children with a dashed outline and per-node accept and reject
buttons drawn right in the SVG, plus bulk accept-all and reject-all in the side
panel, so the user triages before anything is committed. Double-clicking a node
drills the view into that subtree with a breadcrumb to climb back out, which keeps
a big map legible.

Beyond drawing, the widget reaches into the rest of the app in ways no normal mind
mapper can. A node can be converted to a real sidebar task, or "explored" into its
own task plus a fresh canvas, with a breadcrumb origin recorded
(`lib/nodeCanvasOrigin`) so the new canvas can climb back to the map, and the
starting-kit panel then offers AI-suggested widgets and browser tabs for that
node's goal. A node can have real canvas widgets attached to it through a tool
picker, with the back-link stored on the node. And the agent layer is genuinely
deep: the widget scans `.claude/agents/*.md`, asks Claude (Haiku) to pick the one
to three agents that best fit a node, runs a chosen agent as a capped multi-turn
conversation, renders the returned ActionProposals as per-card apply, dismiss, and
undo, records every outcome to a history table, and shows per-agent apply-rate
stats. There is even an in-app wizard to author a brand new agent `.md` from the
node.

Rough edges, honestly. The map is layout-only and left-to-right, there is no free
node dragging, no radial or org-chart or fishbone structures, and no manual
re-parenting by dragging a node under a different parent. Styling is fixed, there
are no colours, icons, images, emphasis, or notes you can attach to a node beyond
its label and an AI rationale. There is no outline or text-editor view of the
tree, which is the fast way most people actually build a map. Export is nonexistent,
you cannot get the map out as an image, PDF, Markdown, OPML, or a slideshow.
Persisting the whole tree as one JSON string in `widget.content` and rewriting it
on every keystroke-level mutation will not scale to large maps and has no
real-time multi-user story. There is no search or filter across nodes, no
collapse and expand of branches to tame a big tree, and no import of an existing
outline or document into a map. The agent and explore machinery is the richest
part of the widget, while the plain craft of laying out and styling a map, the
thing every competitor nails, is the thinnest part.

## Best-of-breed landscape

XMind is the power-user benchmark for the map itself. It ships nine structures in
one tool, including logic chart, org chart, tree table, timeline, fishbone, and
matrix, and lets you mix them in a single map, plus an outliner that flips the
visual map to a structured list and back with one click. Its Copilot generates
branches from a prompt and auto-organizes a cluttered map, and Pitch Mode turns
the map into a slideshow or a PowerPoint deck in one click. It also exports to PDF,
PNG, Word, Excel, Markdown, and OPML, and pushes tasks out to CSV for Jira or ICS
for a calendar. Everything we are thin on, structures, outline view, styling,
export, presentation, XMind owns.

Miro owns team collaboration and is the tool a team compares us to. Real-time
co-editing with live cursors and video chat, three hundred plus integrations, an
effectively infinite shared board, and Miro AI that generates a multi-branch map
from a prompt and expands it with related themes. Their map is one object among
many on a shared canvas, which is philosophically close to us, except theirs is
multiplayer and cloud-native and ours is single-player and local.

MindMeister owns the low-friction beginner experience and the clean default look,
with built-in task assignment and comments, real-time collaboration even on the
free tier, and AI branch generation. It is the answer to "I just want to map
something without learning anything," which is a bar our keyboard and editing flow
does not yet clear.

Whimsical wins on speed and on maps that look good with zero styling work, and on
living in the same product as flowcharts and wireframes so a product person can
move between a mind map and a flow without switching tools. That fast, frictionless,
good-by-default feel is exactly the polish our SVG layout lacks.

Mapify owns the "turn content into a map" job that is now a category of its own. It
converts PDFs, YouTube videos, podcasts, web pages, and meeting recordings into a
structured map in seconds, and for video it timestamps each node back to the moment
in the source. We have an AI that expands a node from its context, but we cannot
yet ingest a document or a URL and produce a map from it, which is the single most
requested AI mind-map behaviour in the market right now.

What we already do better or uniquely could. None of these tools can turn a node
into a real task with its own working canvas, attach live widgets to a node, hand a
node to a domain agent that proposes concrete actions you apply or undo per card,
or author a new agent from inside the map. None of them keep every byte on the
user's machine. And none of them sit on the same infinite canvas as the live
browser tab, the voice note, and the timer for the same piece of work. The map as a
launchpad into agentic execution is genuinely ours.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No outline or text view to build the map (XMind, MindMeister).** "I think in
   sentences and want to type a nested list and watch the map build, then tab and
   shift-tab to restructure." Today the only way to build is clicking Add child
   and editing labels one node at a time, which is the slowest path in the
   category and the first thing a returning mind-mapper will miss.
2. **No export of any kind (XMind, everyone).** "I built the map, now I need it in
   a doc, a deck, or an image to share." Today the map is trapped in the widget.
   This blocks the most common downstream action a mind map exists to enable.
3. **No node styling, notes, icons, or images (Whimsical, XMind, MindMeister).** "I
   want to colour the risky branch red, pin a note to this node, drop an image in."
   Today a node is a label plus an AI rationale and nothing else, so the map cannot
   carry the richness people expect.
4. **No drag to reposition or re-parent, fixed left-to-right layout (XMind,
   Whimsical).** "This branch belongs under a different parent, let me just drag
   it." Today restructuring means delete and rebuild, and the single rigid layout
   cannot express a timeline, an org chart, or a radial map.
5. **Cannot generate a map from a document, URL, or video (Mapify).** "Turn this
   research PDF or this YouTube talk into a map I can explore." Today AI only
   expands an existing node from its label and path, it cannot ingest source
   content, which is the headline AI behaviour of the current market.
6. **No collapse/expand of branches and no search (XMind, Miro).** "My map has
   sixty nodes and I want to fold everything but the branch I am working, or jump
   to the node that mentions pricing." Today every node is always visible and there
   is no find, so large maps get unwieldy despite the drill-in breadcrumb.
7. **Whole-tree-in-one-JSON persistence with no multiplayer (Miro, MindMeister).**
   "My map got big and now every edit rewrites the whole blob, and I cannot share
   it live." This is an architecture ceiling, not a missing button, and it caps how
   far the widget can scale before it needs a real node table.

## The supersonic plan

### Launch-blocking (must ship to clear "Hero")

- **Outline editor for the tree.** A togglable text view of the same tree where
  Enter adds a sibling, Tab indents to a child, Shift-Tab outdents, and editing a
  line edits the node label, kept perfectly in sync with the SVG. Acceptance: a
  user can build a thirty-node map by typing a nested list without ever clicking
  Add child, which is the XMind and MindMeister build speed we currently lose on.
- **Export to image, Markdown, and OPML.** Render the SVG to PNG and serialise the
  tree to a Markdown nested list and to OPML. Acceptance: a finished map leaves the
  widget as a shareable PNG and as a Markdown outline that round-trips back in, so
  the map is no longer trapped, matching XMind's baseline export.
- **Node styling and notes.** A colour per node, a free-text note that opens in a
  small editor, and an optional emphasis flag, all stored on the node. Acceptance:
  a user can colour the risky branch and pin a paragraph of context to a node, the
  table-stakes richness Whimsical and MindMeister have and we lack.
- **Drag to reposition and re-parent.** Pointer-drag a node to a new parent, with
  the tree mutating and re-laying out, plus collapse and expand of any branch.
  Acceptance: restructuring a map is drag, not delete-and-rebuild, and a sixty-node
  map can be folded to the branch in focus, clearing the Miro and XMind bar for
  taming a large map.

### Launch-polish

- **Generate a map from a document or URL.** Feed a pasted document, a file, or a
  URL to the AI and produce a first map the user then triages with the existing
  pending-children flow. Acceptance: dropping a research PDF or a webpage produces a
  usable starter map in one step, taking the Mapify content-to-map job onto our
  canvas where the result is immediately actionable.
- **Search and jump across nodes.** A find box that filters and highlights nodes by
  label and note text and scrolls the match into view. Acceptance: in a large map
  the user types "pricing" and lands on the node, parity with Miro and XMind search.
- **A second layout structure.** At minimum a radial map and an org-chart top-down
  layout selectable per map, reusing the existing walker. Acceptance: the same tree
  can be shown as a left-to-right map or a radial map without rebuilding, a first
  step toward XMind's structure variety.
- **Present mode.** Step through the map branch by branch as a focused slideshow,
  reusing the drill-in machinery. Acceptance: a user can present a map node by node
  without exporting to another tool, matching XMind Pitch Mode for the common case.

### Post-launch (pull ahead)

- **Wire a node into the rest of the canvas.** A ghost-line wire from a browser or
  research widget streams findings in as child nodes, and a wire out from a node
  feeds its subtree to another widget. Uses our unique canvas wiring and is
  something no incumbent can do because their maps are not on a wired canvas.
- **Node table backing for scale and live sync.** Move from one JSON blob to a real
  `fb_mindmap_nodes` table so large maps edit one node at a time and cross-user
  live editing becomes possible, removing the architecture ceiling and opening the
  Miro multiplayer ground on our terms, local-first first.
- **Agent-driven map building.** "Have an agent expand the whole high-priority
  branch and propose tasks for each leaf," with every proposed node and task
  flowing through the existing apply, dismiss, and undo cards. Only we can do this
  because only our map already speaks ActionProposal.
- **Map to canvas blueprint.** Turn an accepted subtree into a laid-out set of real
  widgets and tasks in one move, so the map becomes the literal blueprint for the
  desk that executes it.

## The unfair advantage

Only Haptyx makes a mind-map node a live object in a working system rather than a
drawing. A node here can become a real task, open its own canvas seeded with the
right widgets and tabs by AI, carry attached live widgets, and be handed to a
domain agent that proposes concrete actions you accept or undo one card at a time,
with the whole map sitting on the same infinite canvas as the browser tab, the
voice note, and the timer for the same piece of work, and every byte staying on the
user's machine. XMind draws a better map and Mapify ingests better content, and the
launch-blocking tier closes those craft gaps. But once we are at parity on layout
and export and styling, the map as a launchpad into agentic execution, wired to the
rest of the canvas and private by default, is a different kind of tool, not a
cheaper clone of any of them.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
