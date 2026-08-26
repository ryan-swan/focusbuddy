<!-- SPEC-044 evidence base — AI-layer vocabulary audit.
     Produced 2026-08-24 night by a dedicated read-only analysis agent (very thorough);
     SPOT-VERIFIED by the orchestrating session: 6/6 load-bearing claims reproduced
     character-for-character (anthropic.ts:5140, :358, :402; mindMap.ts:90;
     actionExecutor.ts:793-800; shared/flows.ts:13/24). Full adversarial re-verification
     of the tables happens at G2 gap-matrix assembly per QUALITY-FRAMEWORK.
     Remediation approach: protocol quarantine per DEC-014 / analysis/09 V2. -->

# Vocabulary Audit — `task` in the AI layer (protocol-quarantine remediation)
Repo `/Users/ryanmcquillan/focusbuddy-plexi`, branch `ryan-command-center`

## (a) Summary counts

Measured, not estimated:

| Metric | Count |
|---|---|
| Occurrences of `task` (case-insensitive substring) in `src/main/ai/` | **286** |
| Lines containing it | **222** |
| Files containing it | **17** (of 51) |
| `anthropic.ts` alone | **197** occurrences / **145** lines |

By disposition, counted by **line**:

| Disposition | Lines | Where |
|---|---|---|
| **MEANS-DESK** (correct; most need an in-prompt definition) | **38** | prompt strings that reach the model |
| **MEANS-TODO-ish** (contaminated) | **9** | prompt strings implying to-do semantics |
| **AMBIGUOUS** | **15** | prompt strings the model could read either way |
| **INERT — identifier** | ~**135** | `taskId`, `listWidgetsByTask`, `BriefTask`, `taskBlock`, `w.taskId` … |
| **INERT — comment** | ~**25** | file headers, PHASE_3 notes |
| **Model-visible total** | **62** | the section that matters |

Third and fourth senses of "task" already live in the same prompts: **browsing goal**
(`agent-browse.task`) and **Tiptap/GFM node name** (`taskList`, `taskItem`, "GFM task-list
syntax"). Neither is desk nor to-do.

## (b) Prompt-string table — every model-visible occurrence

### `src/main/ai/anthropic.ts`

| file:line | Context | Text (abridged) | Disposition | Defined as desk? |
|---|---|---|---|---|
| :330 | `taskBlock()` context header | `Task: ${node.title}` | MEANS-DESK | **No** — says "Task" |
| :331 | context header | `Task id: ${node.id}` | MEANS-DESK | **No** |
| :339 | context header | `'Widgets on the desk:'` | MEANS-DESK | Yes (only line in the block that says desk) |
| :355 | `ACTION_KINDS_CATALOG` | `"kind": "agent-browse", "task": "Search this site…"` … `"if the task needs that"` | AMBIGUOUS (browsing sense) | N/A — third sense |
| **:358** | `ACTION_KINDS_CATALOG` | `{ "kind": "create-task", "title": "Q1 rebrand", "notes": "scope notes", "reason": "…" }` | MEANS-DESK | **No — zero definition.** The primary chat + agent-loop catalog |
| :367 | catalog | `{ "kind": "update-task", "taskId": …, "label": "this task", "status": "done", "dueDate": null … }` | MEANS-DESK | **No** — `status:"done"`, `dueDate`, `"this task"` all read to-do |
| :386 | chat system persona | `'…ADHD-friendly task-execution desktop app. '` | AMBIGUOUS | No |
| :387 | chat system persona | `'…complete the task they are currently focused on. '` | MEANS-DESK | No |
| :404 | hard rule 5b | `'…use "agent-browse" with a precise, self-contained task.'` | AMBIGUOUS (browsing) | N/A |
| **:410** | hard rule 7b | `'To change the CURRENT task (mark it done, rename it, move its due date) use "update-task"… status must be one of open\|in_progress\|done\|parked.'` | MEANS-DESK | **No** — the purest to-do framing of a desk in the codebase |
| :1643 | `generateProactiveWelcome` system | `'The user has just started working on a task. '` | MEANS-DESK | No |
| :1645 | same | `'(1) acknowledges the task by name…'` | MEANS-DESK | No |
| :1698 | daily-brief no-key output (user-facing prose) | `'Your workspace is clear — no open tasks or scheduled blocks…'` | MEANS-DESK | No |
| :1705 | daily-brief system | `'…never invent tasks, dates, meetings or documents.'` | MEANS-DESK | No |
| **:2150** | `suggestWorkspaceActions` system | `{"kind":"create-task","title":"short action","notes":"optional detail"…}` | **MEANS-TODO-ish** | **No** — `"short action"` actively teaches to-do |
| :2393 | standup system | `'Never invent a task, a count, a name, or a completion…'` | AMBIGUOUS | No |
| :2447 | setup-widgets system | `'…workspace setup assistant for an ADHD-friendly task app. '` | AMBIGUOUS | No |
| :2448 | same | `'The user is about to start a task — they often find it hard to start…'` | MEANS-DESK | No |
| :2454 | same | `'For checklists use GFM task-list syntax…'` | INERT (markdown syntax) | N/A |
| :2471 | setup-widgets user msg | `Task to set up:` | MEANS-DESK | No |
| :2546 | `generateResume` system | `'…so the user can return to this task tomorrow…'` | MEANS-DESK | No |
| :2615 | session-narrative user | `Activity log for ${taskTitle}…` | MEANS-DESK (interpolated) | N/A |
| :2698 | nudge user | `The user is actively working on ${taskTitle}…` | MEANS-DESK (interpolated) | N/A |
| :2701 | nudge user | `The user was working on ${taskTitle} but has been idle…` | MEANS-DESK (interpolated) | N/A |
| :2776 | Smart Stack system | `'…many widgets on their canvas for an ADHD-friendly task workspace. '` | AMBIGUOUS | No |
| :2789 | Smart Stack user | `Active task: "${node.title}"` | MEANS-DESK | No |
| :2890 | workspace-builder system | `'…orderedList, taskList, codeBlock…'` | INERT (Tiptap node) | N/A |
| **:2903** | workspace-builder rule 1 | `'Prefer "table" for any list-of-records-with-attributes ("clients", "tasks", "trips", "habits")'` | **MEANS-TODO-ish** | N/A — teaches that a "tasks" collection is a *table* |
| :3070 | living-page system | `'…the rest of the widgets in their current task.'` | MEANS-DESK | No |
| :3080 | living-page user | `Task: ${task.title}` | MEANS-DESK | No |
| :3639 | widget-setup guidance (page) | `'…a bullet/todo list that fits the task'` | MEANS-DESK | No |
| :3646 | widget-setup guidance (webview) | `'…the single most useful web address … to open for this task'` | MEANS-DESK | No |
| **:3651** | widget-setup `sticky` noun | `noun: 'tasks'` (rendered into the prompt + the preview header) | **MEANS-TODO-ish** | N/A |
| **:3652** | widget-setup `sticky` guidance | `'a short, actionable checklist task of a few words'` | **MEANS-TODO-ish** | N/A — a genuine to-do sense already ships |
| :3718–3719 | widget-setup user ctx | `Task: ${task.title}` / `Task notes: …` | MEANS-DESK | No |
| :3788 | structured setup system | `'taskList/taskItem (attrs.checked false)…'` | INERT (Tiptap) | N/A |
| :3800–3801 | structured setup user ctx | `Task: …` / `Task notes: …` | MEANS-DESK | No |
| **:4284** | desk-agent action system | `{ "kind":"create-task", "title":"…", "notes":"…" }` | MEANS-DESK | **No — zero definition** |
| :4806 | sheet-formula system | `'Propose "tabsToAdd" ONLY if the task truly needs a separate sheet'` | AMBIGUOUS (job sense) | N/A |
| **:4907–4908** | sheet-fill system | `'…for a project plan, every phase and task with no gaps'` | **MEANS-TODO-ish** | N/A |
| :4968 | sheet-fill user | `'every row the task needs, not a sample'` | AMBIGUOUS (job sense) | N/A |
| **:5133** | `MEETING_END_SYSTEM` | `{ "kind": "create-task", "title": "short task title", "notes": …}` | **MEANS-TODO-ish** | **No** |
| **:5140** | `MEETING_END_SYSTEM` hard rule | `'Use create-task for an action item someone needs to do (each task opens its own workspace).'` | **MEANS-TODO-ish** | **Half** — "opens its own workspace" is the only desk hint anywhere, glued to "action item someone needs to do" |

### Other files

| file:line | Context | Text (abridged) | Disposition | Defined as desk? |
|---|---|---|---|---|
| discoveryMode.ts:29 | discovery creation-gate rule | `'…no create-task, create-widget, create-table, create-todo-list, create-agent…'` | MEANS-DESK | **No** (bare list) |
| **discoveryMode.ts:32** | discovery build rule | `'propose the desk with a "create-task" action and the widgets that fill it…'` | MEANS-DESK | **YES — the only prompt in the entire codebase that defines `create-task` as desk-creation** |
| **agentDispatcher.ts:144** | invocation contract | `{"kind":"create-task","title":"…","notes":"…","reason":"…"}` | MEANS-DESK | **No** |
| voiceNote.ts:352 | voice-note system | `'…propose concrete actions to add to a personal task workspace.'` | AMBIGUOUS | No |
| **voiceNote.ts:356** | voice-note system | `{"kind":"create-task","title":"…","notes":"…","reason":"…"}` | MEANS-DESK | **No** |
| **mindMap.ts:86** | mind-map system | `"kind":"idea"\|"task"\|"question"\|"tool"\|"agent"` | **MEANS-TODO-ish** — separate namespace (`MindMapNodeKind`) | N/A |
| **mindMap.ts:90** | mind-map system | `'- "task" = something the user could do; should fit on a to-do line'` | **MEANS-TODO-ish** — explicit in-prompt definition of bare `task` as a **to-do**, contradicting node-kind `task` = desk | N/A |
| mindMap.ts:98 | mind-map system | `'A node with many "task" children is rarely the best decomposition.'` | MEANS-TODO-ish | N/A |
| dailyBriefContext.ts:121 | brief user content | `'Open and in-progress tasks (most important first):'` + rows `- [open] {title} (importance N, priority N, due X)` | MEANS-DESK | **No** — renders desks in pure to-do notation |
| browserAgentEnvelope.ts:146/:165/:167 | browser system | "the task…" (goal sense) | AMBIGUOUS (browsing) | N/A |
| browserAgent.ts:222/:229 | observation block | `TASK: ${input.task}` / "…if it blocks the task…" | AMBIGUOUS (browsing) | N/A |
| memoryExtract.ts:41 | chat-memory prompt | `"never small talk or one-off task details. "` | AMBIGUOUS | No |
| **mentionResolver.ts:171** | mention resolution reason | `'this desk no longer exists'` | MEANS-DESK | **YES — correctly says desk** |
| **mentionResolver.ts:225** | mention context line | `${c.kind === 'task' ? 'desk' : 'room'}` | MEANS-DESK | **YES — actively translates `task`→"desk" for the model** |
| portalAggregate.ts:29–41 | `deskBlock()` | `Desk "${title}"` | MEANS-DESK | **YES — correct** |

**Three files already do it right** (`mentionResolver.ts`, `portalAggregate.ts`,
`discoveryMode.ts:32`). Everything else leaks.

**Batched INERT identifiers** — no prompt exposure, no fix needed: anthropic.ts 5, 6, 179,
302–328, 378, 458–459, 699–705, 739–744, 857–875, 971, 1108, 1197, 1634–1641, 1682–1695,
1757–1835, 2417–2435, 2536–2544, 2585–2604, 2653–2670, 2738–2744, 2860–2873, 3002,
3049–3052, 3702–3708, 3775–3781; mentionResolver.ts 19, 152, 176, 357; portalAggregate.ts
2–3, 17–22, 30–67; dailyBriefContext.ts 7, 44, 53–117; browserAgent.ts 41, 162–192;
agentHistory.ts 323; markdownToTiptap.ts 129–144; localWhisper.ts 59, 170; modelRouting.ts
9, 13; mindMap.ts 40, 409; actionLabel.ts 116.

## (c) Action-vocabulary map

**Defined in prompt text** (the model's whole world):

| Kind | Prompt definition sites |
|---|---|
| `create-task` | anthropic.ts:358 (shared chat+agent catalog), :2150, :4284, :5133/:5140; agentDispatcher.ts:144; voiceNote.ts:356; discoveryMode.ts:29,:32 |
| `create-todo-list` | anthropic.ts:353, :402 (hard rule 4), :420 (worked example); agentDispatcher.ts:145; voiceNote.ts:357; discoveryMode.ts:29 |
| `create-widget` | anthropic.ts:356; agentDispatcher.ts:146; voiceNote.ts:358 |
| `create-page` | anthropic.ts:357; agentDispatcher.ts:147; voiceNote.ts:359 |
| `create-table` / `add-table-row` | anthropic.ts:359, :360, :405, :407a, :421, :428, :2151, :4271–4272 |
| `create-agent` | anthropic.ts:362, :409 (6b), :429 |
| `create-knowledge-entry` | anthropic.ts:368, :411 (7c), :2152, :4285, :5134 |
| `create-document` / `generate-document` | anthropic.ts:2149, :371, :4275, :5135 |
| `create-field`, `link-widgets`, `update-widget`, `delete-widget`, `start-focus-session`, `update-task`, `edit-document`, `set-cell`, `schedule-event`, `compose-mail`, `post-chat`, `open-url`, `agent-browse` | anthropic.ts:353–373 catalog |
| **Never documented to any model** | `navigate-to`, `toggle-todo-item` (types.ts:891), `create-section` (types.ts:922), `drill-in-widget`, `arrange-widgets` — exist in `ActionProposal` and `assistantCapabilities.ts:64` but appear in no prompt |

**Where parsed** — five independent parsers, no shared kind table:

| Parser | file:line |
|---|---|
| `parseChatJson` (chat + agent loop, shared) | anthropic.ts:627–900 (`create-task` at :739) |
| `suggestWorkspaceActions` | anthropic.ts:2188–2215 (`create-task` at :2194) |
| `parseMeetingDeliverables` | anthropic.ts:5150–5170 (`create-task` at :5156) |
| `agentDispatcher` proposal parser | agentDispatcher.ts:365–390 (`create-task` at :372) |
| `voiceNote` action parser | voiceNote.ts:432–450 (`create-task` at :438) |
| Flow engine (separate namespace) | src/main/db/flows.ts:168 |

**Where gated:** `creationGate.ts:32–43` — `CREATION_KINDS = {create-task, create-widget,
create-todo-list, create-table, add-table-row, create-page, create-field, create-agent,
link-widgets, generate-document}`. Comment at :29 correctly excludes `update-task` as an
*editing* kind.

**Where executed:** `src/renderer/src/lib/actionExecutor.ts` — dispatch at :71–120, appliers
at :793 (`applyCreateTodoList`), :842 (`applyCreateTask`), labels at :1403–1530.

### `create-todo-list` — what it actually creates today

`actionExecutor.ts:793–814`: it creates **a `markdown` widget** whose content is
`# {title}` plus `- [ ] {item}` lines. There is **no todo entity, no todo table, no todo
widget kind** (confirmed: no `'todo'` widget kind in `src/shared/` or widgets/). It requires
an active desk (:797 — "Open a task first — todos need a canvas.").

**Collision risk with `work_item`: high, and it is a naming collision, not a data
collision.** The model sees, in one catalog: `create-todo-list` with example items
("Buy hosting", "Record pilot", :353); hard rule 4 — **"For todo lists: ALWAYS use
`create-todo-list`"** (:402); and `create-task` with no definition at all (:358). Once a
`work_item` tool exists there are **three** plausible destinations for "add buy hosting to
my list," and rule 4's "ALWAYS" will actively fight the new tool. There is also a live
`toggle-todo-item` kind (types.ts:891) — a second to-do-shaped verb the model is never told
about.

## (d) Persistence surfaces — action kinds stored as data

**Confirmed storing kind strings:**

| Store | file:line | Evidence |
|---|---|---|
| **`fb_flows.actions_json`** | database.ts:380–393; flows.ts:57; shared/flows.ts:31,:41 | Each `FlowAction` is `{id, type:'create-task', title}` persisted verbatim in every user-saved automation. **The published protocol — do not rename.** |
| **`fb_flows.trigger_json`** | database.ts:384; shared/flows.ts:13,:18 | `FlowEventName = 'task-completed' \| 'row-added'`. **A second published `task`-word protocol string**, fired when a desk node completes. |
| **`fb_flows.last_log`** | database.ts:387; shared/flows.ts:44–46 | `FlowRunStep.type` is a `FlowActionType` — kind strings in the cached run log |
| **`agent_outcomes.proposal_kind`** | database.ts:793–802 | literal `'create-task'` per applied/dismissed/undone proposal |
| **`agent_outcomes.created_entity_ref`** | database.ts:800–802 | `"<kind>:<id>"`, e.g. `"task:abc"`; read back by agentHistory.ts:341 (`if (kind === 'task')` → `DELETE FROM nodes`) |
| **`agent_invocations.proposals`** | database.ts:781 | full serialized `ActionProposal[]` JSON incl. every `kind` |
| **`ai_chat_messages.proposals_json` / `applied_json`** | database.ts:974–983 | persisted chat proposals + approvals — kind strings at rest |
| **`ai_chat_messages.trace_json`** | database.ts:1005 | retrieval trace rows carry raw `kind` |
| **Seeded template flows** | src/main/templates.ts:86 | `{type:'create-task', title:'Daily standup: {{ai}}'}` written at template install |

**Confirmed NOT storing action kinds:** `wire_runs` (database.ts:451–465 — `task_id` is a
desk FK only) · `canvas_snapshots` (database.ts:437 — FK only).

**Semantic (non-kind) leak:** `fb_meetings.action_items_json` (database.ts:206) is populated
at `stores/wrapup.ts:125` by filtering `p.kind === 'create-task'` and storing titles — desk
titles persisted under the column name **action_items**.

## (e) Human-facing label worklist

| file:line | Current label | Means |
|---|---|---|
| src/main/ai/actionLabel.ts:35 | `'create-task': 'Task'` (trace, completed) | desk |
| src/main/ai/actionLabel.ts:42 | `'update-task': 'Update task'` | desk |
| src/main/ai/actionLabel.ts:65 | `'create-task': 'Creating a desk'` (in-progress) | desk — **already correct** |
| src/main/ai/actionLabel.ts:72 | `'update-task': 'Updating the desk'` | desk — **already correct** |
| lib/actionExecutor.ts:1434 | `verb: 'New task'`, icon `task_alt` (proposal card) | desk |
| lib/actionExecutor.ts:876 / :873 | `Created task "${p.title}"` / `'Could not create task.'` | desk |
| lib/actionExecutor.ts:797 / :826 / (focus) | `'Open a task first — todos/pages/focus…'` (×3) | desk |
| lib/actionExecutor.ts:207 | `'Event references a task that was never proposed alongside it.'` | desk |
| assistant/ProposalPreview.tsx:198–199 | `case 'create-task': return <DeskMini …>` | desk — **already correct** |
| widgets/MindMapWidget.tsx:2484 / :2486 | `New task — ${p.title}` / `Todo list — …` | desk / markdown widget |
| lib/traceView.ts:161–163 | create-task/update-task/create-todo-list → icon `check_circle` | desk gets a checkmark |
| views/PlexiFlowView.tsx:37 / :509 | `'create-task': 'task_alt'` / `placeholder="Task title"` | desk |
| **src/shared/flows.ts:100** | `'create-task': 'Create a task'` (Flow editor step label) | desk |
| **src/shared/flows.ts:24** | `'task-completed': 'When a task is completed'` (trigger label) | desk |
| src/main/db/flows.ts:169 / :171 | `'Untitled task'` / `Created task "${title}".` (persisted run log) | desk |
| src/shared/templates.ts:69 | `'…a create-task step, scheduled daily'` | desk |
| lib/assistantCapabilities.ts:62–65 | `'Plan my tasks'` / `'Help me plan and organise my tasks'` (ChatPanel.tsx:1804) | desk |
| views/AllTasksView.tsx:232 / :277 / :349 | `"All Tasks"` / `"Search tasks…"` / `'No open tasks yet.'` | desk |
| segment/segments.tsx:49 | `label: 'Tasks'`, `'Everything on your plate, in one list'` | desk |
| MakeTaskDialog.tsx:58/:93/:163/:171/:176/:178/:184/:194 | "Make this a task" flow (8 strings) | desk |
| **assistant/tabs/AssistantTasksTab.tsx:37** | `'No open tasks. New desks and tasks show up here.'` | desk — **already self-contradictory** |
| dashboard/TodayTasksCard.tsx:69 · dashboard/Dashboard.tsx:63 · dashboard/WorkspaceHealthCard.tsx:55,101 | "Open tasks…" (orphaned portlet system) | desk |
| dashboard/AIAssistantCard.tsx:29 | starter `'Based on my open tasks and recent activity…'` | desk — **also a prompt string** |
| views/HomeDashboard.tsx:558 | `label: 'open task(s)'` (Pulse) | desk |
| views/homeWidgets.tsx:2002 · suite/HomeDashboardRegion.tsx:164 | `'No open tasks. Enjoy it.'` etc. | desk |
| views/InsightsView.tsx:128 | `'…but no open task fits'` | desk |
| views/MessagesView.tsx:1471 / :1478 | `'Task created.'` / Pulse group `'Action items'` + desk-creating button | desk |
| anthropic.ts:1639, 2422, 2542, 2742, 3050 | `'Task not found'` (×5 IPC errors) | desk |
| anthropic.ts:1698 | `'…no open tasks or scheduled blocks…'` | desk |
| anthropic.ts:1684 | `cleanTitle(n.title, 'Untitled desk')` | desk — **already correct** |

## (f) Riskiest 5

1. **`anthropic.ts:5140`** — *"Use create-task for an action item someone needs to do (each
   task opens its own workspace)."* The only prompt that both defines `create-task` and
   defines it as **an action item** — in the meeting-wrapup system, precisely the surface
   that will produce the most work_item candidates. Compounded by :5133 ("short task title").
2. **`anthropic.ts:358`** — the `ACTION_KINDS_CATALOG` entry with zero definition, shared
   verbatim by the chat prompt AND the agent-loop prompt (:349–352). Highest-traffic
   definition site; a sibling `create-work-item` entry with no distinguishing prose leaves
   the model choosing on one example title.
3. **`anthropic.ts:410` + `:367`** — `update-task`'s vocabulary is entirely to-do ("mark it
   done… due date… status open|in_progress|done|parked") applied to a desk, and it is
   ungated (an editing kind). Once work_items have their own status/due, two "mark it done"
   verbs are distinguished by nothing.
4. **`mindMap.ts:90`** — a prompt that explicitly defines bare `task` as a to-do inside the
   same process where node-kind `task` = desk; `MindMapWidget.tsx:2483–2486` then renders
   both senses side by side under one word.
5. **`anthropic.ts:2150` + `agentDispatcher.ts:144` + `voiceNote.ts:356`** — the three
   undefended bare-JSON sites. Voice capture is the canonical work_item utterance ("remind
   me to call Bob") and today creates a whole desk; the dispatcher ships the same shape into
   every user-authored agent `.md` as a runtime-appended contract, so the leak propagates
   into content the project does not control.

**Honorable mentions:** anthropic.ts:3651–3652 (`noun: 'tasks'` / "a short, actionable
checklist task") — a genuine to-do sense already shipping in sticky-widget setup, direct
terminology collision with work_item; and anthropic.ts:402 hard rule 4's **"ALWAYS use
`create-todo-list`"** — an absolute instruction the new work_item tool must explicitly
override or it loses every routing contest.
