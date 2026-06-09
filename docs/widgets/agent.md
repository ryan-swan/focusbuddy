# Desk agent, SME doc (master of destiny)

Tier: Hero. A desk agent is the widget that turns the canvas from a place you
arrange things into a place that does work for you, so it has to feel like a real
standing worker and clearly beat the agent builders people already know at the
on-canvas job.

## The use case

Someone has a small, recurring piece of thinking they would rather not do by hand
every time. Keep a running summary of three notes and a browser tab as they
change. Watch a research page and pull the new facts into a list. Turn a messy
pile of inputs into a prioritized plan whenever the inputs move. They don't want
to open Lindy or Gumloop in another tab and rebuild the context that already sits
on their desk, and they don't want a workflow they have to babysit. They want to
drop a worker next to the widgets it should read, wire those widgets into it, give
it one plain instruction, choose how it should think, and have it run, on a
button, on a timer, or whenever its inputs change. The moment of use is "this
little job keeps coming back and I want a standing hand on the canvas that just
does it, right here, without my data leaving the machine."

## Current state

The widget is `src/renderer/src/components/widgets/AgentWidget.tsx`. Its editable
config and run log are serialised into the widget content by
`src/renderer/src/lib/deskAgent.ts`, the run engine that fires it lives in
`src/renderer/src/lib/deskAgentEngine.ts`, the model call is `runDeskAgent` in
`src/main/ai/anthropic.ts`, the IPC entry point is the `agents:run` handler in
`src/main/ipc/index.ts`, inputs are resolved to readable text by
`src/main/ai/agentInputs.ts`, and the role library is
`src/renderer/src/lib/agentProfiles.ts` plus `agentProfileLibrary.ts`.

What works today:
- An agent reads the widgets wired INTO it as its inputs. The engine resolves
  each input to real text, a note becomes its text, a browser becomes its live
  rendered page or a server-side fetch, a portal aggregates the whole desk it
  points at, so the agent reasons over the actual content on the canvas, not a
  stale copy.
- Three triggers exist and all work. A manual Run button, an interval that ticks
  only while the widget is mounted, and an onChange trigger that re-runs the
  agent when any wired input changes. onChange is debounced per agent and guarded
  by a self-write cooldown so an agent writing its own log cannot loop.
- A profile system gives the agent a "job description" that shapes how it
  reasons. Six built-in roles ship (generalist, research analyst, project
  manager, copywriter, data wrangler, critic), a larger library is imported, and
  the user can create custom roles. A local, free recommender suggests a
  better-fitting role as you type, and an AI path can design a brand-new
  specialist persona for the exact instruction and either replace this agent or
  spin up a linked one wired into the same flows.
- When a browser is wired in, the agent can actually drive it. `runDeskAgent`
  runs a bounded tool loop with read_current_page, open_url, and web_search
  (`src/main/ai/agentBrowser.ts`), so a research agent gathers sources itself
  rather than asking the user to paste pages.
- Everything runs against the user's own Anthropic key and the canvas data never
  leaves the machine.

Rough edges, honestly:
- The headline gap is outgoing delivery. The widget shows "feeds N" for its
  outgoing wires and the system prompt promises the app will write the output
  into the linked page, note, table, or field. The formatter that would shape the
  output per target kind exists at
  `src/renderer/src/lib/widgetContentFormat.ts` (`coerceToWidgetContent`), but
  it is imported nowhere and never called. So today an agent logs its result to
  its own body and downstream onChange agents can re-run, but the promised
  auto-delivery into a linked note or table does not actually happen. This is the
  single most important thing to fix before this reads as a Hero widget.
- A run is one single message exchange. There is no multi-step plan, no tool use
  beyond the wired browser, and no memory of prior runs other than a short capped
  history shown on the widget. The agent cannot decide to fetch one more thing,
  call another widget, or carry a learned fact forward.
- There is no human-in-the-loop gate for actions. Because there are no real
  actions today, this is latent rather than broken, but the moment delivery and
  tools land it becomes a requirement.
- The interval only ticks while the widget is mounted, so an agent on a desk you
  are not looking at does not run. There is no true background scheduler.
- There is no run-level audit you can open and inspect, only the last output, a
  last error, and a capped count of recent runs. Cost and token use are invisible.
- Inputs are truncated (each wired input is sliced to about 2000 characters in
  the prompt), so a large note or page is silently clipped.

## Best-of-breed landscape

Lindy owns the always-on standing-worker idea. Its agents run persistently in the
background, trigger on an incoming email or a schedule, and, crucially, carry a
memory of preferences and past runs that makes them self-improving across
executions. That persistence plus memory is exactly the feeling a desk agent
should have and today does not.

Gumloop owns the AI-native canvas for multi-agent work. It gives you a real visual
canvas, access to many models under one subscription, and a Skills system where an
agent updates its own playbook when you correct it so the same error does not
repeat. Its triggers cover schedule, event, and bulk runs.

Relay.app owns human-in-the-loop. You can build a working agent in a few steps,
and its strongest feature is requiring human approval before any consequential
action executes, which is the trust layer a canvas agent that writes into your
other widgets will need.

Zapier owns reach. Its AI agents sit on top of nine thousand-plus app
integrations plus Model Context Protocol support, so the agent can act across the
tools a team already runs, which is breadth we will never match natively.

n8n, Flowise, and Dify own the node-graph builder. They let you drag LLM nodes,
tool nodes, memory nodes, and vector-store nodes onto a canvas and wire how data
flows, with first-class agent nodes, tool calling, and persistent state. They are
the visual mental model people will compare our wiring to.

What we already do better or uniquely could. Our agent is one object on the same
infinite canvas as the live browser tab, the notes, the table, and the timer for
the same piece of work, and you wire those exact widgets into it with a ghost-line
that anyone can see and follow. None of the incumbents put the worker and its
inputs on one spatial surface like this. The instruction is plain language with a
local instant role recommendation and an AI specialist designer, so picking the
right kind of worker takes seconds. The browser the agent drives is a real logged
in tab on your desk, not a headless fetch, so it can read pages behind a login.
And every byte stays on the machine against the user's own key, which none of the
cloud agent builders can claim.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. Output delivery is promised but not wired (Gumloop, n8n, Lindy). "Summarise
   these three notes into that page, and keep the page current." Today the agent
   writes the summary into its own body and the linked page stays empty, even
   though the UI says it feeds that page. This is the biggest gap because the
   product already tells the user it works.
2. No persistent memory across runs (Lindy). "Remember that I prefer short
   bullet summaries and that we already covered the Q2 numbers." Every run starts
   cold, so the agent cannot get better at a recurring job the way Lindy's does.
3. No real background scheduler (Lindy, Gumloop). "Run this every hour even
   when I'm working on another desk." The interval only fires while the widget is
   on screen, so a standing worker stops the moment you look away.
4. Single-shot reasoning, no multi-step tool use beyond a wired browser
   (Gumloop, n8n, Flowise). "Check the page, then update the list, then flag
   anything overdue." One message exchange cannot plan and act in steps.
5. No human-in-the-loop approval on actions (Relay.app). "Show me what you're
   about to write before you change my widgets." The moment delivery lands, an
   agent that mutates other widgets needs a review gate, and Relay has set the
   bar.
6. No inspectable run history or cost (Gumloop, Zapier). "What did it do last
   night and what did it cost me." We keep a capped count and the last output
   only, with no transcript and no token accounting.
7. Inputs silently truncated (n8n, Flowise with chunking and vector memory).
   "It read my whole research note." A 2000-character slice quietly drops the
   rest of a long input.

## The supersonic plan

### Launch-blocking (must ship to clear "Hero")
- Wire up outgoing delivery. Call `coerceToWidgetContent` from
  `widgetContentFormat.ts` after every successful run, for each outgoing wire,
  shaping the agent's output to the target kind (a page gets a document, a note
  gets text, a field gets the single value, a table gets rows via the existing
  table build path) and writing it non-destructively so existing data is never
  erased. Acceptance: an agent wired into three notes and out to a page keeps
  that page current on every run with no user step, which is the Gumloop and n8n
  promise of an agent that produces a real artifact, and it matches what our own
  UI already claims.
- Stop silently truncating inputs. Replace the flat 2000-character slice in
  `runDeskAgent` with a budget-aware packing that summarises or chunks oversized
  inputs and tells the user when an input was condensed. Acceptance: a long
  research note is fully represented in the run and the widget shows it was
  condensed rather than dropping content, closing the obvious correctness gap
  versus n8n and Flowise.
- A human-in-the-loop guard on destructive-looking deliveries. Before an agent
  overwrites a page or field that already has user content, surface the proposed
  change for one-click accept or reject, reusing the existing ActionProposal
  review flow. Acceptance: an agent never silently replaces something you wrote,
  matching Relay.app's approval-before-action bar for the on-canvas case.

### Launch-polish
- Per-agent memory. Persist a small, user-visible memory of facts and
  preferences the agent carries into every run, editable on the widget and
  cleared on demand. Acceptance: an agent told once to "keep summaries to five
  bullets" honours it on later runs without being told again, matching the core
  of Lindy's memory.
- A real background scheduler. Move interval and onChange firing out of the
  mounted widget and into a task-level service so a standing agent runs even when
  its desk is not open, with a clear active/paused state. Acceptance: an interval
  agent on a closed desk still produces its hourly output, matching Lindy's and
  Gumloop's always-on model.
- An inspectable run log. A panel with the full transcript of recent runs,
  inputs read, output produced, and tokens or cost used. Acceptance: a user can
  open last night's runs and see exactly what each one did and what it cost,
  matching the audit Zapier and Gumloop provide.
- Self-improving correction. When a user edits an agent's output, offer to fold
  the correction into the agent's memory so the same mistake does not repeat,
  the on-canvas version of Gumloop's Skills. Acceptance: correcting an output
  once changes the next run's behaviour.

### Post-launch (pull ahead)
- Multi-step runs on the canvas. Let an agent take a few bounded steps, read a
  wired browser, then update a wired list, then flag a wired table, with a visible
  step trace and a kill switch. Uses our wiring as the action surface no
  node-graph tool has spatially, and takes the multi-step ground from Gumloop and
  n8n.
- Agent-to-agent pipelines as first-class flow. Outputs of one agent already
  feed the next through onChange; make the chain legible, with the ghost-lines
  showing the pipeline and per-stage status, so a research agent feeding a writer
  feeding a critic reads as one visible assembly line.
- Trigger breadth. Add a few high-value triggers beyond manual, interval, and
  onChange, for example "when a wired table gains a row" or "at a clock time",
  narrowing Lindy's and Gumloop's trigger lead for the cases that matter on a
  desk.
- A small, safe local tool set the agent can call without a wired browser, so a
  generalist agent can do basic web search and fetch on its own, reducing the
  setup step versus the incumbents while keeping execution on the user's machine.

## The unfair advantage

Only Haptyx can put the worker, its inputs, and its outputs on one spatial
surface where you can literally see the work flow. You wire the exact notes,
table, and live logged-in browser tab into the agent with ghost-lines anyone can
follow, the agent reasons over that real on-canvas content, and once delivery is
wired its result flows back out along visible wires into the page or list for the
same task, with every byte staying on the machine against the user's own key. The
cloud agent builders have memory, schedulers, and integrations we still need to
build, but none of them have the canvas as the action surface, the ghost-line
wiring as the dataflow, or local-first privacy. Close the delivery and memory
gaps and ours stops being an agent builder you happen to run on a canvas and
becomes the only agent that is part of the canvas.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
