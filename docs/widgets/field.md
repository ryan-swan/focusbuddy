# Field, SME doc (master of destiny)

Tier: Strong. A Strong widget does not have to redefine its category the way a
Hero does, but it has to be obviously good at its one job and never the thing
that makes someone doubt the product. For Field that means every type works
cleanly, the value persists, and the widget earns its place next to the heavier
widgets rather than feeling like a leftover primitive.

## The use case

Someone wants a single piece of structured state on the canvas, not a whole
table. A due date for the thing they are working on. A status chip that reads
"blocked / in progress / done". A number they keep nudging. A checkbox that says
"sent". A button that runs a prompt or a command without leaving the desk. They
do not want to build an Airtable base for one value, and they do not want it
buried as a property inside a document they have to open. They want the value
sitting in the open, next to the notes and the timer and the browser tab for the
same task, glanceable and editable in one click. The moment of use is "I have
exactly one fact about this work that I want to see and change in place, and a
table is too much ceremony for it."

## Current state

The Field widget is `kind: 'field'` (declared in `src/shared/types.ts` line 32),
rendered by `src/renderer/src/components/widgets/FieldWidget.tsx`. It stores its
whole state as a single JSON blob in `widget.content` of the shape
`{ def: FieldDefinition, value }`, so the existing widget update path never has
to learn anything about fields. The type system itself lives in
`src/shared/fields.ts` and is shared with the Table widget, which means a
single-select on a standalone field behaves identically to a single-select
column in a table. The actual inputs are rendered by
`src/renderer/src/components/fields/FieldEditor.tsx`, one component used in both
the canvas widget variant and the table cell variant.

What works today is broad. The picker offers eleven types: short text, long
text, rich text, number, checkbox, single select, multi-select, date,
attachment, button, and relation (`FIELD_TYPE_LABELS` in `fields.ts`). Selects
get an inline option editor with a colour palette so you can define chips
without leaving the canvas. The date field honours a with-time toggle and
normalises to UTC. The attachment field ingests a real file through
`window.api.files.ingestBuffer` and stores it as an `fb_files` id, then renders a
chip that opens via the `fb-file://` protocol. The relation field is genuinely
useful: it binds to another on-desk table, lazily loads that table and its rows
through the tables store, and lets you link one or many rows with a chip picker,
with a shared `RelationConfigEditor` used by both the field widget and the table
column header. The AI side is wired too. Claude can spawn a field with a chosen
type and label (`anthropic.ts` line 1122, executed in
`actionExecutor.ts` line 654), and it can read a field's current type, label and
value back into context (`anthropic.ts` line 190), so a desk agent can both
create and reason about fields. The widget is in the catalog
(`widgetCatalog.ts`), in the connected-tool menu (`createConnectedTool.ts`), and
supports right-click create-and-connect through `ConnectedToolMenu`.

The honest rough edges. The button field is half-built. The AI-prompt action
works because it reuses `chat:send`, but the shell action is a stub that returns
"Shell execution not yet enabled, coming soon" (`FieldEditor.tsx` around line
500), so half of the button's advertised power does not exist yet. The button
result is a one-shot string shown inline, with a code comment admitting the
intended design is to stream into a target field, which is not built. There is no
formula or computed type, so a field can hold a value but never derive one. There
is no validation or required state, so nothing stops a number field from sitting
empty when it matters. Rich text falls back to a plain textarea in the cell
variant and the widget variant is not meaningfully richer, so "rich text" is
generous labelling today. A field cannot push or pull its value over a ghost-line
wire, so two fields that hold the same fact stay independent. And the field is a
single value by design, which is correct, but there is no lightweight "small
group of fields" affordance for the common case of three related values that do
not deserve a full table.

## Best-of-breed landscape

The Field widget sits at an unusual intersection, so it is measured against four
different incumbents depending on which of its types you lean on.

Tally and Typeform own the "capture one typed value cleanly" job. Tally builds
forms in a Notion-style block editor and pipes submissions straight into Notion,
Airtable and Sheets through a native integration rather than a third-party
connector, and it does this for free with no submission cap. Typeform owns the
conversational one-question-at-a-time experience that lifts completion, and it
has deep validation, logic jumps and a polished input for every field type.
Against either of them our individual inputs are plainer and we have no
validation, no required state, and no logic.

Notion and Coda own the "one property, but computed and connected" job. Notion's
database button property can run a defined sequence of actions, and its
properties carry formulas, rollups and relations so a single value can be derived
rather than typed. Coda goes further: its buttons reference table columns and
canvas controls, run conditional multi-step logic, and reach external tools
through Packs, so a Coda button on a page is closer to a real automation than our
button is. Both make a standalone control feel like part of a computed system.
Our button runs one prompt or, soon, one shell line, and computes nothing.

FigJam and Miro own the "interactive object living on a shared canvas" job, which
is structurally the closest to what we are. FigJam ships timer, vote, poll and
reaction widgets, and its widget API supports stickable hooks so a widget can
attach to another node on the board. That stickable, attach-to-a-node behaviour
is exactly the kind of canvas-native relationship our fields do not yet express
between each other.

Stream Deck and Apple Shortcuts own the "programmable button that does real work"
job that our button type aspires to. A Stream Deck key is a push-button macro
that can fire an Apple Shortcut, an AppleScript, or a Keyboard Maestro macro, and
Shortcuts can chain dozens of system actions. Our button's shell action, once it
ships, competes here, and right now it is a placeholder while theirs run full
multi-step automations against the whole machine.

What we already do better, or could do uniquely. None of these incumbents put a
single typed value as a free, movable, wireable object on an infinite canvas next
to the live browser tab and the timer for the same task. Tally and Typeform
capture a value and send it away. Notion and Coda bury it inside a doc or a
table. FigJam and Miro have canvas-native widgets but no typed-value model and no
local data. Stream Deck has buttons but no canvas and no state. We have the typed
model, the canvas, an AI that can create and read the field in place, the ghost
wires that could connect it to other widgets and to desk agents, and the fact
that the value never leaves the machine. The combination is ours alone; the
per-type polish is where the incumbents are ahead.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **Button is half-built (Stream Deck, Apple Shortcuts, Coda).** "I want a
   button on my desk that actually runs `git status` or opens my standup doc."
   Today the shell action returns a coming-soon string, so the most exciting type
   does nothing for half its advertised use. This is the single most visible
   broken promise in the widget.
2. **No computed / formula field (Notion, Coda).** "Show me days until this due
   date" or "this field should mirror that one." Every value must be typed by
   hand; nothing derives. Notion and Coda treat a single computed property as
   table stakes.
3. **No validation or required state (Typeform, Tally).** "This number is a
   budget, do not let it sit empty or hold text." A field accepts anything,
   silently, which is fine for a scratch value and wrong the moment the field
   matters.
4. **Fields cannot wire to each other or stream a value (FigJam, Coda, our own
   wires).** "Wire the button's result into this text field" is described in our
   own code comments as the intended design and is not built; two fields holding
   the same fact stay out of sync. FigJam's stickable hooks show the canvas-native
   bar here.
5. **Rich text is rich in name only (Notion, Tally).** "Let me bold a word and
   add a bullet in this note field." The rich-text type falls back to a textarea,
   so it under-delivers against its own label.
6. **No small multi-field grouping (Tally, Notion property stack).** "I have
   three related values, a status, an owner and a due date, that belong together
   but do not deserve a whole table." Today that is three separate widgets to
   place and align by hand.

## The supersonic plan

### Launch-blocking (must ship to clear "Strong")
- **Finish the button shell action.** Wire the shell branch in `ButtonField` to a
  real main-process shell IPC with a confirm-on-first-run guard and the output
  shown inline. Acceptance: a button configured with `say "hello"` or `git
  status` runs and shows real output, so we beat the current stub and reach the
  basic Stream Deck "press to run a command" bar for a single action.
- **Stream a button result into a target field.** Add an optional "write result
  to" target on the button config so the AI-prompt or shell output lands in a
  chosen text field instead of an ephemeral inline box. Acceptance: a button runs
  a prompt and the answer appears, and persists, in a linked text field, matching
  the intent already written in our own code comment and edging past Notion's
  fire-and-forget button.
- **Validation and required state.** Per-type validation (number range,
  non-empty required, select-must-be-set) with a quiet inline warning. Acceptance:
  a required empty field shows a clear unmet state and a number field rejects
  non-numeric input, reaching the Typeform/Tally baseline for a single input.

### Launch-polish
- **Computed field type.** A formula type that evaluates a safe expression over
  named sibling fields and dates, reusing the evaluator the Table widget will need
  anyway. Acceptance: a "days left" field computes `dueDate - today` and updates
  live, matching Notion's and Coda's single computed property.
- **Real rich text.** Promote the rich-text widget variant to a genuine Tiptap
  inline with bold, lists and links, not a textarea. Acceptance: a user formats
  text in a field and it round-trips, so "rich text" stops being a misnomer.
- **Field-to-field wire binding.** Let a ghost-line wire bind one field's value
  to another so they mirror, using the existing widget-link layer. Acceptance:
  wiring field A to field B keeps them in sync both directions, something no
  incumbent does on a free canvas.
- **Field group / mini-stack.** A lightweight container that holds three to six
  fields with shared layout, the gap between a single field and a full table.
  Acceptance: a status-plus-owner-plus-due trio lives in one tidy widget instead
  of three loose ones, covering the Notion property-stack case.

### Post-launch (pull ahead)
- **AI-authored fields from a sentence.** "Add a status field with blocked, doing,
  done and a due date" already half-works through the proposal path; extend it so
  one instruction can scaffold a small field group with options pre-filled.
  Acceptance: one natural-language line produces a configured multi-field group,
  which no form builder or canvas tool does in place.
- **Buttons that trigger desk agents.** Let a button's action target a desk agent
  with a payload, not just a one-shot chat send, so a field becomes a trigger for
  a running agent. Acceptance: pressing a field button hands a task to a named
  desk agent, beating Stream Deck because the target is an autonomous agent, not a
  static macro.
- **Wire-fed fields.** A field that subscribes to a wire from a browser or agent
  widget and updates its value as data arrives (a scraped price, a computed
  count). Acceptance: a research result lands in a field automatically, using our
  unique canvas wiring.

## The unfair advantage

The one thing only Haptyx can do is make a single typed value a live, wired,
agent-aware object that sits in the open on the canvas and never leaves the
machine. A Notion property is trapped in a doc, a Tally field flies off to a
server, a Stream Deck key has no state and no canvas. Ours can be placed next to
the exact work it describes, created and read by an AI in place, and, once the
wire binding ships, connected to another field or piped from a button result or
fed by a desk agent, all locally. The second advantage is the button as an agent
trigger. Because we already have desk agents and an in-process AI, a Field button
can do something no macro key can, which is hand real work to an autonomous agent
rather than fire a fixed script. The per-type polish in the plan brings us to
parity with the form builders and property systems; the canvas, the wires, the
agents and local-first are why a field here is a different kind of thing once it
is at parity.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
