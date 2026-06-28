# Plexi UX panel — finding, creating, editing and deleting across the suite

This is a working session of five invited design specialists, convened to look at how clear and
how quick the PlexiDesk app is to actually use. The lens is deliberately narrow and practical.
We are not auditing visual taste or the brand, we are following the four verbs a person performs
all day, finding a thing, creating a thing, editing a thing, and deleting a thing, and asking
where the app adds steps that serve its own structure rather than the person sitting in front of it.

What the panel reviewed is the real shipping UI, not a mockup. We read the navigation shell in
`src/renderer/src/components/Sidebar.tsx`, the central router in
`src/renderer/src/components/MainPane.tsx`, and the view model in
`src/renderer/src/stores/view.ts`, which together define how a person moves between modules. We
read the per-module screens under `src/renderer/src/components/views/`, with PlexiReports
(`views/PlexiReportsView.tsx`) and PlexiForms (`views/PlexiFormsView.tsx`) as the representative
pattern. We read the newly added shared `ModuleHome` dashboard at
`src/renderer/src/components/ModuleHome.tsx`, the global command surface at
`src/renderer/src/components/CommandCenter.tsx`, the home dashboard's create card at
`src/renderer/src/components/dashboard/QuickStartCard.tsx`, the delete-and-undo behaviour in
`src/renderer/src/stores/nodes.ts`, and the aspirational target in `DESIGN_SYSTEM.md`. Every
observation below cites what is on disk today.

The five voices are Mara Quist, an interaction designer who counts clicks and cares about task
flow, Dev Okonkwo, an information architect who cares about navigation and findability, Lena
Hoffmann, a UI-systems designer who cares about consistency and the design system, Theo Bautista,
a product designer who owns the create, edit and delete ergonomics, and Priya Raman, an
accessibility and clarity specialist who cares about whether all of this works for someone who
is not a power user.

## The shape of the app, as the panel found it

Dev opened by laying out the map, because everyone needs to agree on the terrain. The sidebar is
the only way between modules and it is long. Counting the navigation rows in `Sidebar.tsx`, there
are roughly twenty-three destinations grouped under nine collapsible section headers, Workspace,
Knowledge, Create and meet, Work, Add-ons, Files, Team, Inbox, and then the Projects tree,
Templates and Connected Apps below that. The `View` union in `stores/view.ts` confirms the same
breadth, more than thirty distinct view kinds route through the single `MainPane` switch. "This
is a genuine workspace OS now," Dev said, "and the grouping into labelled sections is the right
instinct. But a person does not navigate by section header, they navigate by the thing they are
trying to do, and right now the answer to almost every 'I want to make a new X' is the same,
find the right module in a list of twenty-three, click into it, then find the create button
inside it."

Mara agreed and reframed it as a cost. "Every module is its own destination, so creating
anything starts with a navigation act. The structure is exposed to the user as a tax. They pay it
before they have done anything."

Priya added the clarity angle. The sidebar does a lot of good accessibility work, there is a real
WAI-ARIA tree implementation in `Sidebar.tsx` with roving tabindex and full arrow-key navigation,
which is genuinely strong and rare. "But strength in the tree does not rescue the breadth. A
screen reader user, or anyone who is not steeped in the product, still has to know that a report
lives under Work and a form lives under Create and meet. The vocabulary of the section headers is
ours, not theirs."

## The redundant "start a new ..." screen, diagnosed

This is where the panel converged, and it converged hard, because the operator's specific
complaint is correct and the code shows exactly why.

Theo walked everyone through the actual pattern. Open PlexiReports. The view is a left list rail
about three hundred pixels wide with a "New report" button at the top, and a right pane. When
nothing is selected, the right pane now renders the shared `ModuleHome` component, which shows
overview tiles, a recent-items grid, and a prominent create action. PlexiForms is the same shape
with "New form", PlexiBuild, PlexiMeet, PlexiFlow, PlexiSign and PlexiProjects all repeat it.
"So the person sees a dedicated screen whose entire job is to say 'you have not made one of these
yet, here is a button to make one'," Theo said. "That screen is a landing pad for the module, not
a step the user asked for. They came here to create. We answered with a place that is about
creating, and made them click again."

Mara put numbers on the top journey. To create a report from a cold start, a person clicks the
Work section if it is collapsed, clicks PlexiReports, lands on the ModuleHome screen, clicks New
report, and only then is a report created and selected. That is three to four interactions and
two full screen changes before the first real act of work. "The dedicated empty-and-create screen
is the navigation step we should be deleting. It exists because the app is organised as a set of
modules and each module needs a front door. The front door serves the architecture. It does not
serve the person."

Dev named the deeper cause. "Every module reinvents the same left-list-plus-new-button. There is
no single, shared notion of 'create a thing of type X'. `CommandCenter.tsx` proves the app could
have one, the palette already aggregates navigation and a generic 'New folder or task' across the
whole app, but it stops at the node tree. The modules each grew their own create surface in
isolation, so the redundancy is structural, not cosmetic. Fixing one view does not fix it, you
have to give the whole suite one way to start a thing."

Lena, watching from the design-system seat, agreed and then complicated it usefully. "I want to
defend `ModuleHome` for a second, because it is the best version of the wrong idea. Look at it,
it is honest, it derives every stat from real data and never invents a count, it has an empty
state with a clear next step, it is configurable, and it composes the shared primitives,
`DashboardHeader`, `StatusPill`, `PLEXI_CARD`, exactly as `DESIGN_SYSTEM.md` asks. As a module
overview it is good craft. The problem is not the component, it is that we route to it as a
mandatory waypoint. A dashboard you chose to look at is useful. A dashboard you are forced
through on the way to making one item is a toll booth with nice paint."

Theo built on that. "Right. So the fix is not 'delete ModuleHome'. The fix is 'make ModuleHome a
place you can land and create from directly, and make sure you never have to pass through a
separate create-only screen to get there'. The create action already lives on it. The redundancy
is the extra navigation, not the dashboard."

Priya closed the diagnosis with the clarity point everyone had been circling. "There is also a
naming and consistency cost. The create button says 'New report' here, 'New form' there, 'New'
with a folder icon in the sidebar header, and a 'New folder or task' in the palette. Same verb,
five labels, five locations, different affordances. For a confident user that is friction. For a
non-technical user it reads as five different features. The honest truth is that creation in this
app has no single, learnable gesture."

## Where finding, editing and deleting stand

Before the panel turned to fixes, Dev insisted on giving credit where the app already does well,
because the recommendations should preserve those wins.

Finding is in good shape at the global level. `CommandCenter.tsx` gives a real Cmd+K palette that
works from anywhere, ranks by substring and recency, and runs an async deep content search across
notes, document bodies, table cells, file names and node descriptions through
`window.api.search.query`. "This is the strongest single piece of findability in the product,"
Dev said. "The irony writes itself. The app already has a fast, global, do-anything surface, and
yet creation still routes people through twenty-three modules and a per-module landing screen.
The palette is the proof that the better pattern is already in the building."

Editing is mostly direct and in place, which the panel liked. In the sidebar tree a double-click
renames inline, the row context menu offers Rename, and edits to a node go through the store with
proper undo. In PlexiReports the editor is the right pane, the title is an inline editable field
that saves on blur, and there is even an unmount flush so switching away does not lose an edit.
"That is careful work," Theo said. "Editing rarely sends you to a separate screen, and when it
does it is the natural detail pane. Keep that."

Deleting is the strongest area for forgiveness, and the panel wanted this on the record because it
is easy to lose in a critique. `stores/nodes.ts` records an undo entry for create, for meaningful
field edits, and for delete, and `nodes.delete` returns the trashed ids so `restore` can put them
back exactly, children included. The sidebar's permanent delete is also guarded by a confirm
dialog, and archive is offered as the softer, recoverable default. "This is genuinely good CRUD
hygiene," Theo said. "Delete is reversible at the data layer and the destructive path is gated.
The gap is discoverability and consistency, not safety. The delete and archive controls only
appear on hover in the tree, which fails touch and low-vision users, and the modules do not all
expose the same delete affordance the tree does. Undo exists, but a person has to know the keyboard
shortcut or trust that it is there, because there is no visible 'undone, click to bring it back'
confirmation after the act."

Priya underlined the hover problem. "Controls that only exist on hover are invisible to keyboard
and touch and to anyone who does not move a mouse precisely. The edit, archive and delete buttons
on each tree row are `opacity-0 group-hover` until you hover. The capability is there, the
discoverability is not."

## Recommendations

The panel agreed on five changes, ordered by how much they serve the four verbs against how much
they cost to build. Each names what to change, why it helps the person rather than the structure,
a rough effort, and a priority.

### 1. One global quick-create, reachable from anywhere — P0

Extend the Cmd+K palette so that typing "new" surfaces "New report", "New form", "New flow", "New
document", "New task" and every other createable type, and selecting one creates the thing and
opens it directly in its editor, with no stop at a module landing screen. The plumbing already
exists, `CommandCenter.tsx` aggregates actions globally and each module already has a create
function such as `addReport` in `PlexiReportsView.tsx`. The work is to register every module's
create action into the palette's command list and route the result straight to the new item.

Why it serves the user. It collapses the universal "make a new X" journey from three or four
clicks across two screens down to one gesture from wherever they already are. It gives creation a
single learnable home instead of twenty-three scattered front doors. Effort is medium, the
surface and the per-module create functions both exist, the work is wiring and routing. This is
P0 because it is the highest-leverage answer to the operator's exact complaint and it does not
require touching any module's internal layout.

### 2. Inline create-in-place at the top of every list — P0

Put a persistent "+ New report" affordance at the top of each module's list rail itself, not only
inside the empty-state dashboard, and have it create the item and drop focus straight into its
title field without a screen change. The sidebar tree already proves this works, double-click to
rename is in-place editing today. Reports and Forms already have a list-top "New" button, so for
them this is mostly making sure the create lands you in an editable, focused new row rather than
re-rendering the pane.

Why it serves the user. The most common create happens from inside a module you are already in,
and right now that still routes through the landing dashboard when nothing is selected. Creating
from the list, in place, with the cursor already in the name, is the fastest path that exists in
any tool and it makes the dedicated create screen unnecessary for the in-module case. Effort is
low to medium per module. P0 alongside the first item because together they remove both the
cold-start and the warm-start versions of the redundant screen.

### 3. Make ModuleHome the create surface, and stop routing through a separate "start new" step — P1

Keep `ModuleHome` as a genuinely useful module overview, but treat it as a destination a person
chooses, not a gate they pass through to create. Concretely, ensure that arriving in a module with
existing items shows those items or the last-opened item, not the empty landing pad, and that the
create action on ModuleHome and the create action in the list are the same gesture with the same
label. The component is already good, honest stats, real empty states, configurable sections, and
it composes the design-system primitives per `DESIGN_SYSTEM.md`. The change is about routing and
defaults, not a rebuild.

Why it serves the user. It preserves the value of an at-a-glance module home for the people who
want it, while removing the forced detour for the people who just want to make something. It turns
a toll booth into an optional dashboard. Effort is low, it is mostly default-selection and label
logic in each module view. P1 because items one and two already neutralise most of the pain, and
this is the cleanup that makes the module home defensible rather than redundant.

### 4. One create, edit and delete vocabulary across every module — P1

Standardise the affordances so that every module exposes create, rename, edit, archive and delete
the same way, with the same icons, the same labels, and crucially the same always-visible delete
and edit controls rather than hover-only ones. Lift the sidebar's confirm-on-delete and
archive-as-default into every module, and surface a visible "undone" confirmation after a delete
so the existing undo in `stores/nodes.ts` is something a person can see and trust, not a hidden
shortcut.

Why it serves the user. Right now the same verb wears five labels and the destructive controls
hide on hover, which fails touch, keyboard and low-vision users and makes a consistent app feel
like five apps. A single CRUD vocabulary is learnable once and applies everywhere, and a visible
undo turns good data-layer forgiveness into felt forgiveness. Effort is medium because it touches
many views, but each touch is small. P1, it is consistency and inclusion work that compounds with
every module added later.

### 5. Reduce the navigation depth of the top journeys — P2

Audit the most frequent destinations and lift them out of the nine-section list, for example by
pinning a small set of most-used modules to the top of the sidebar or by remembering and surfacing
the person's actual most-visited views, so the common case is one click rather than expand-section
then click. The data to do this honestly is reachable, the palette already uses recency to rank.

Why it serves the user. Breadth is not going away, the app is a real suite, but the person should
not pay the full breadth cost on every common trip. Promoting frequent destinations keeps the
power of the full list while making the daily path short. Effort is low to medium. P2 because it
is an optimisation on top of a navigation model that the first four items have already made far
less load-bearing, since once create is global the sidebar is for browsing, not for the price of
admission to making something.

## If you fix three things

Fix the global quick-create first. Registering every module's create action into the Cmd+K palette
and routing straight to the new item answers the operator's complaint directly, reuses a surface
that already exists, and gives the whole suite one learnable way to start anything. That is the
single highest-leverage change on this list.

Fix inline create-in-place second. A persistent "+ New X" at the top of every list that creates
and focuses without a screen change removes the redundant landing screen for the in-module case,
which is the most common create of all.

Fix the CRUD vocabulary and visible forgiveness third. One consistent create, edit, archive and
delete gesture across every module, with always-visible controls and a visible undo, turns the
app's already-solid data-layer safety into something users can see and learn once. It also future
proofs every module the suite adds next, because the pattern is decided rather than reinvented.

Do those three and the dedicated "start a new ..." screen stops being a step a person is pushed
through. `ModuleHome` survives as the optional dashboard it deserves to be, the suite gets one way
to find, one way to create, and one way to delete, and the structure stops getting in the way of
the work.

## Confidence

```json
{
  "confidence": 0.86,
  "why_not_higher": "The diagnosis is grounded in the actual shipping source, which is direct primary evidence, but the panel did not run the app to time the click-paths empirically or observe a real user, so the click-cost figures are read from the code rather than measured, and a couple of modules (PlexiBuild, PlexiMeet, PlexiFlow) were confirmed to share the pattern by grep rather than read line by line.",
  "assumptions": [
    "PlexiBuild, PlexiMeet, PlexiFlow, PlexiSign and PlexiProjects follow the same left-rail-plus-New-button plus ModuleHome pattern that PlexiReports and PlexiForms were read to confirm, which grep over the view files supports but full reads of each were not performed.",
    "The Cmd+K command list in CommandCenter.tsx can be extended with per-module create actions without architectural change, which the existing action-registration shape strongly implies.",
    "The hover-only edit/archive/delete controls observed in the sidebar tree are representative of the modules' destructive-action discoverability, rather than each module having its own always-visible controls."
  ],
  "flags": []
}
```
