<!-- VERBATIM CAPTURE — received 2026-08-24 late evening, pasted by operator.
     Source: operator-generated synthesis of Plexi bugs/UX pains from recent transcripts
     (rooms, desks, navigation, deletion/archive, memory, tasks, command-center).
     ⚠️ COMPLETENESS NOTE (intake): the paste's section numbering runs
     1,2,3,4,5,6,9,10,11,12,15,16,18,19,20 — sections 7, 8, 13, 14, 17 are ABSENT.
     Flagged as intake question IQ-1: deliberately trimmed, or lost in paste?
     Citation markers (⁠⁠) from the source tool survive as empty glyphs. -->

# Bug/UX Synthesis (operator-supplied, verbatim)

Below is a comprehensive synthesis of the Plexi bugs, product problems, UX pains, and unresolved design questions surfaced across the recent transcripts around rooms, desks, navigation, deletion/archive behavior, memory, tasks, and command-center intelligence.

## Executive synthesis

Across the transcripts, the core issue is not just that Plexi has a few isolated bugs. The deeper pattern is that Plexi's object model, navigation model, memory model, and task model are all converging around rooms and desks, but the product has not fully resolved how those layers should behave together.

The most important pain cluster is this:

Users can create and accumulate rooms, desks, widgets, documents, browser sessions, chats, and AI-generated workspaces, but Plexi does not yet have a clean lifecycle for those objects: how to navigate into them, return from them, archive them, delete them, remember them, hide them, summarize them, or surface them later when they become relevant again.

That creates several downstream problems:

Rooms and desks feel glitchy or unreliable. / Deleting desks/rooms does not work cleanly. / Archiving vs. deleting is conceptually unresolved because memory persists in the brain. / Navigation between rooms and desks is not intuitive enough yet. / Desks multiply quickly, creating object-permanence problems. / Completed or abandoned desks risk cluttering active views. / But hard-deleting desks risks losing useful memory, context, and project history. / Tasks are still conceptually tangled with desks. / The command center / task layer is needed precisely because users forget about active desks and open loops.

The highest-level product problem is that Plexi wants desks to be living workspaces, memory containers, task contexts, collaboration surfaces, and AI-action targets all at once. That is powerful, but it requires very clear rules for navigation, lifecycle, state, and recall.

## 1. Desk / room deletion is a confirmed bug and an unresolved product model

The transcripts explicitly call out a desk/room deletion bug as something that needs to be fixed. The same notes list desk/room deletion not working under known bugs and remaining issues. Separately, the Aug 24 Plexi strategy session says desk archiving/deletion is a needed feature and that desks currently cannot be deleted.

A. Functional bug — At the application level, users need the basic ability to remove a desk or room from their workspace. Right now, that path is either broken, incomplete, or not exposed clearly enough.

B. Product semantics problem — Even after the button works, Plexi still needs to define what deletion actually means. The transcripts surface a major complication: desk information still lives in the brain / memory layer. So "delete desk" could mean: remove from active UI only; archive but keep searchable; delete the desk object but preserve its memory; delete both; preserve only a summary; remove from command-center/task surfaces but keep in long-term recall; hide from default search unless explicitly included. The product has not yet resolved that distinction, and that ambiguity is one of the biggest pains.

## 2. Archive vs. delete needs to become a first-class lifecycle model

The strongest direction from the transcripts is that archive should probably be the default desk lifecycle action, while hard delete should be more deliberate. The command-center overview frames the desired behavior clearly: users need to clear completed or irrelevant desks from view while preserving useful memory where needed.

Archive should likely mean: remove from active views; hide from today's command center; preserve searchable memory; preserve links and artifacts; preserve a completion summary or recap; allow future AI recall if relevant; keep historical context available; prevent clutter in active navigation.

Delete should likely mean: remove the desk object; potentially remove associated memory, depending on user intent; potentially offer options (delete desk only / delete desk and memory / archive instead / preserve summary only); require clearer confirmation because it may affect the brain.

The pain is that users want the simple emotional action of "get this out of my way", but Plexi's architecture introduces a deeper question: should this work still be remembered? That is not a bug in the normal sense. It is a product-design problem caused by Plexi's biggest advantage: persistent context.

## 3. Memory preservation is both a differentiator and a source of UX confusion

Plexi's memory/brain layer is becoming central to the product. The transcripts say Plexi now reads uploaded files and stores file content/metadata in the brain, enabling memory-based querying without actively rereading files each time.

That creates a powerful experience: a desk can become a remembered work context; uploaded documents can be searchable later; a completed project can still inform future AI responses; the assistant can recall project state, files, decisions, and context; old desks can become useful historical knowledge instead of dead UI objects.

But it also creates UX tension: If a user deletes a desk, does Plexi forget it? If a user archives a desk, does it still appear in search? If a user asks AI about something later, can it reference archived desks? If a desk is completed, should it still generate tasks or notifications? If memory persists after deletion, will users feel like deletion did not really delete? If memory is removed during deletion, will users accidentally lose valuable context?

The key pain: Plexi needs a visible memory contract. Users need to know what happens to memory when a desk is archived, completed, or deleted.

## 4. Rooms/desks interaction is glitchy and unreliable

The Aug 24 Applied AI/Plexi demo notes say that AI-driven room/desk creation was tested, but the rooms feature was still very glitchy. The same meeting says rooms interaction is glitchy and unreliable.

Rooms are supposed to organize projects or broader contexts. Desks are supposed to hold focused work. AI can create desks inside rooms. Users need to navigate between room-level and desk-level views. But the current interaction model is not stable or intuitive enough.

The transcript also notes that AI-created desks were labeled as "tasks", indicating a schema-level mismatch where the product language and data model may still be out of sync.

That is important because it suggests the glitchiness is not purely frontend polish. Some of it may come from underlying conceptual debt: Are desks tasks? Are tasks separate objects? Are rooms projects? Are desks workspaces? Is a desk a task container, a project unit, or the task itself? Is the old schema still treating desks as tasks? Until that model is cleaned up, navigation and lifecycle behaviors will likely keep feeling inconsistent.

## 5. Navigation between rooms and desks is not yet intuitive enough

The Aug 22 Applied AI/Plexi working session gives a very specific action item: fix Plexi navigation so clicking into a room takes the user to the desk, and add a back-to-desk button.

Users click into a room but do not land where they expect. It is unclear how to move from room context to desk context. Once inside a project/page/room, users need a clean way back to the desk. The hierarchy is not yet self-explanatory.

The Aug 20 brainstorm offers a possible redesign: clicking a room should open its desks horizontally to the right, similar to an Apple-style layout, while preserving the feeling of one continuous canvas.

The desired feeling: navigation should feel spatial; rooms and desks should feel like connected surfaces; users should not feel like they are jumping between unrelated pages; the UI should preserve context while moving across the hierarchy; the workspace should feel continuous, not nested in a clunky file-tree model. The pain is that Plexi's current navigation may still be too page/app-like, while the product vision is spatial, fluid, and context-preserving.

## 6. Desks multiply quickly, creating object-permanence problems

Ryan explicitly described a major personal pain: when working in Plexi consistently, many projects and desks accumulate, and if a desk is not looked at, it is easy to forget it exists.

The problem is not simply clutter. It is object permanence for work. In Plexi, desks are powerful because they hold context. But the more powerful they are, the more costly it becomes to forget them. Forgotten desks may contain: unfinished tasks, deadlines, research, browser sessions, notes, uploaded files, AI chats, decisions, client work, follow-ups, open loops, half-built outputs, work that should be archived, work that should be resumed.

This creates a paradox: Plexi encourages users to create rich workspaces → rich workspaces become valuable → valuable workspaces accumulate → accumulation creates clutter and forgotten work → forgotten work creates anxiety and missed commitments → deleting work risks losing memory → keeping everything active creates overload.

That is why the command center is not optional. It becomes the necessary intelligence layer for managing workspace sprawl.

<!-- Sections 7–8 absent from paste (IQ-1) -->

## 9. AI-generated rooms/desks introduce new failure modes

The transcripts describe AI creating a structured room for a new project and attempting to build multiple desks inside it. This is a powerful direction: users can ask Plexi to spin up a workspace from intent.

But it also exposes new problems: AI-created rooms may be glitchy; AI-created desks may be mislabeled; the user needs a way to review and accept generated structure; poorly generated desks can create clutter instantly; AI may create multiple desks before the user is ready; if deletion/archive is broken, AI-generated clutter becomes more painful; if memory persists automatically, even a bad generated desk may pollute the brain; if tasks are inferred from generated desks, the command center may become noisy.

This means AI-generated workspace creation must be paired with lifecycle controls: preview before creation; confirm generated desks; rename and reorganize easily; archive/delete generated desks cleanly; avoid adding low-confidence generated content to long-term memory too aggressively; allow "discard generated workspace" behavior; clarify whether discarded work is remembered.

Without that, the AI creation feature can amplify the very clutter and memory problems the command center is supposed to solve.

## 10. Shared desk collaboration has routing, sync, and latency problems

The Aug 20 PlexiDesk check-in captured several collaboration bugs:
- Not all widgets sync live: stickies work, but slide decks and browsers did not update in real time.
- Shared desks received from Michael appear in "All Desks" rather than the "Shared" tab.
- Moving widgets on a shared desk felt sluggish or resistant.
- Collaboration can be delayed by roughly 7–8 seconds in some cases.

Shared desks are part of Plexi's core differentiation. The collaboration pain breaks into four categories:
A. Sync inconsistency — some widgets sync, others do not; users uncertain whether shared work is live.
B. Routing/organization bug — shared desks showing in "All Desks" instead of "Shared" breaks expectations and workspace hygiene.
C. Interaction latency — moving widgets feels sluggish/resistant; collaboration feels less physical and trustworthy.
D. Presence feedback — a subtle collaborator indicator exists; suggestion to make it a subtle blue glow around the widget.

These bugs connect to the larger archive/navigation problem: if desks can be shared, moved, archived, remembered, and surfaced in command centers, each desk needs accurate ownership, visibility, state, and permission metadata.

## 11. "Active" vs. "archived" vs. "shared" vs. "remembered" needs clearer state logic

Desks can exist in multiple overlapping states: active, forgotten, stale, completed, archived, deleted, shared, personal, AI-generated, task-linked, memory-preserved, agent-active, searchable, hidden from command center, visible in all desks, visible in shared desks.

The product pain is that these states are not yet clearly modeled in the user experience. Examples: a shared desk should appear under "Shared," not "All Desks"; an archived desk should not clutter active views; a deleted desk may or may not remain in memory; a stale desk should appear in the command center if it has open loops; a completed desk may generate a summary and then disappear from active workflow; an agent-active desk may need a glow in a dispatch view.

This suggests Plexi needs a robust desk state model, not just UI fixes. Possible desk states: Active, Pinned, Shared, Archived, Completed, Deleted, Draft/generated, Stale, Needs review, Agent active, Memory only. The UI should then decide where each state appears.

## 12. Navigation improvements are happening, but the model still needs consolidation

Already added or proposed: back/forward navigation added to the top bar; top menu pill placement bug confirmed fixed; Plexi Search / intent routing can route navigation, URLs, queries, and AI questions from one command bar; Plexi Search is aware of projects and desks and can navigate directly to content; a room-to-desk horizontal navigation model was proposed; a back-to-desk button was requested.

Risk of too many partial navigation mechanisms: top bar back/forward, breadcrumb/pill, room click behavior, back-to-desk button, left nav, command/search routing, homepage widgets, recent memory chats, desk shortcuts, shared/all desk tabs. The pain is not lack of navigation options. The pain is lack of a single coherent navigation mental model.

Plexi likely needs a unified rule: no matter where users are — room, desk, document, browser, AI chat, shared workspace, archived memory — they should always understand where they are, how they got there, how to return to the source desk, and whether the current object is active, archived, shared, or remembered.

<!-- Sections 13–14 absent from paste (IQ-1) -->

## 15. Completed desks should probably generate summaries

Archiving or completing a desk should not simply hide it. It should probably produce a useful memory artifact. The overview suggests: archive desk if work is done; generate completion summary; preserve links and artifacts; keep searchable memory; update living project table; remove from active queue.

This could solve several pains at once: users can clear clutter; Plexi preserves useful context; the brain retains the project's outcome; future AI queries can use summarized memory rather than noisy raw state; the command center can stop surfacing completed items; users feel safe archiving because the value is not lost.

A strong product pattern: when a desk is archived, Plexi asks whether to create a desk memory summary. Possible summary fields: what this desk was for; key files; key decisions; completed work; open follow-ups; people involved; related rooms/desks; final status; whether to keep searchable; whether to hide from active command center. This could turn archive into a feature, not just a cleanup action.

## 16. Browser/search/AI improvements increase the importance of lifecycle controls

Plexi now has a stronger in-app browser and intent-routing search experience. Users can search, navigate, ask AI, open websites, and stay inside Plexi. That makes the workspace stickier, but it also increases accumulation: more browser sessions, more generated desks, more uploaded files, more AI chats, more memory, more task candidates, more stale objects later.

So as Plexi becomes better at keeping users inside the app, the archive/delete/command-center problem becomes more urgent. The better Plexi gets at creation and capture, the more it needs strong systems for: cleanup, recall, resurfacing, summarization, deletion, archival, search filtering, task prioritization, memory governance.

<!-- Section 17 absent from paste (IQ-1) -->

## 18. Root-cause themes

Theme 1: Object model ambiguity — rooms, desks, tasks, projects, memories, and command-center items still partially overlap; cleaner conceptual boundaries needed.
Theme 2: Lifecycle is underdeveloped — good at creating/capturing; needs robust completing, archiving, deleting, summarizing, resurfacing.
Theme 3: Memory changes everything — because Plexi remembers work, ordinary delete/archive actions become complicated; users need control and clarity.
Theme 4: Navigation must feel spatial and contextual — continuous canvas vision vs. current friction and unclear return paths.
Theme 5: AI creation increases clutter risk — AI-generated desks and invisible tasks are powerful but need lifecycle controls.
Theme 6: The command center is the natural solution — not just a feature idea; the required control layer for accumulated desks, memory, stale work, open loops.

## 19. Recommended product direction

1. Define desk lifecycle states — Active, Pinned, Shared, Stale, Completed, Archived, Deleted, Memory-only, Draft/generated, Agent-active. Each state determines where the desk appears.
2. Split archive and delete clearly — archive default; delete deliberate, explains memory impact. Options: archive desk; archive with summary; delete desk only; delete desk and memory; cancel/keep active.
3. Add archive summaries — purpose, key outputs, decisions, open loops, related people, related files, final status, future relevance.
4. Fix room-to-desk navigation — clicking a room takes users into the relevant desk experience; add a back-to-desk button; consider horizontal layout; preserve spatial continuity.
5. Resolve schema naming — separate "desk" and "task" at the schema level so tasks become a distinct layer across desks.
6. Make command center desk-linked — every task, nudge, stale-work item, or AI suggestion links back to a source desk, room, object, or memory artifact.
7. Keep archived desks out of active surfaces — archived desks appear only when search explicitly includes archived memory, there is an unresolved open loop, a user asks about historical context, or a related active project needs that memory.
8. Add AI task suggestion guardrails — confidence scores; suggest before adding when uncertain; approve/dismiss/merge; learn from dismissals; explain why each item surfaced.
9. Fix shared desk visibility and sync — shared desks under "Shared"; all widget types sync consistently; movement smooth; presence indicators subtle but clear.

## 20. Final synthesis

The transcripts show Plexi reaching an important product inflection point. The product is becoming powerful enough that users can generate desks, search across memory, upload files, work inside browsers, collaborate live, and ask AI to create structured workspaces. But that power creates a new class of problems: workspace sprawl, memory ambiguity, unclear object lifecycle, and navigation complexity.

The bugs around room/desk deletion and navigation are symptoms of a deeper product need: Plexi needs a clear lifecycle and intelligence model for desks — how they are created, entered, remembered, completed, archived, deleted, resurfaced, and connected to tasks.

If solved well, this becomes a major differentiator. Plexi would not just be a canvas or AI workspace. It would become a system that understands the life of work: start a desk → build context → generate artifacts → collaborate → remember → surface open loops → complete the work → archive the desk → preserve the right memory → bring it back only when useful.

That is the throughline: the bug fixes matter, but the real opportunity is turning desk lifecycle, memory, and command-center intelligence into one coherent product system.
