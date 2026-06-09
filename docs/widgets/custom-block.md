# Custom block, SME doc (master of destiny)

Tier: Sufficient. This widget does not have to beat best of breed at launch, it
has to be genuinely useful and not embarrassing for its core job, so the bar is
a clean freeform form designer that people actually reach for rather than a
feature-complete app builder.

## The use case

Someone wants a small structured form or record that lives on the desk next to
the work it belongs to, and they want to lay it out themselves rather than
accept a stacked column of fields. A coach building an intake card, a researcher
capturing the same five attributes about every paper, a maker logging a daily
check-in with a couple of headings and a divider, a freelancer keeping a tiny
client record. They do not want to leave the canvas and build a Jotform, and
they do not want a full relational table either. They want to drop a few typed
fields, drag them where they look right, flip the block into a fill-in form, and
have it sit beside the notes and timer for the same task. The moment of use is
"I want a tidy little form or record, shaped the way I want it, right here, and I
want to reuse this shape next time without rebuilding it."

## Current state

The widget is `kind: 'custom-block'`, registered in
`src/renderer/src/lib/widgetCatalog.ts` (line 368) and typed in
`src/shared/types.ts` (line 83). The component is
`src/renderer/src/components/widgets/CustomBlockWidget.tsx`, and the template
store is `src/renderer/src/lib/customBlockTemplates.ts`. It also appears in
`Canvas.tsx`, `WidgetFocusMode.tsx`, `nodeCanvasOrigin.ts` and
`widgetContentFormat.ts`, so it is a fully wired first-class canvas object.

What works today is a two-mode freeform designer. In design mode you add fields
from a palette of ten types, text, paragraph, number, date, email, url, select,
checkbox, heading and divider, and you drag and resize each one by absolute
pixel position inside the block over a dotted grid background. Select a field and
a config bar lets you rename its label, set select options as a comma list, and
mark it required, or delete it. Flip to use mode and the same layout becomes a
live data-entry form whose entered values persist. A fresh empty block opens in
design mode and an existing one opens in use mode, which is a nice touch. Layout
and values both live as JSON in `widget.content`, saved on a 300ms debounce, and
the component adopts content pushed in from a synced sibling so a linked copy
updates live without a remount (lines 99 to 107). You can save the current
layout as a personal template, values stripped, and re-insert it later with
fields re-ided so instances stay independent. Templates are stored in
localStorage under `fb.customBlock.templates` with a small subscribe broadcast
so any open menu refreshes.

The honest rough edges are significant for a form tool. There is no submission
and no output of any kind, the entered values just sit inside the one widget's
content, so this is a record you fill in, not a form you collect responses
through. There is no validation beyond the HTML input type and a required flag
that is never actually enforced, nothing stops you saving an empty required
field or a malformed email. There is no AI build path, you cannot describe a
form and have it scaffolded, which is the one thing the rest of the desk does
well and this widget conspicuously does not. There is no conditional logic, no
field-to-field show/hide, no calculated fields. Absolute positioning means no
responsive reflow and no snapping or alignment guides, so tidy layouts are
manual and fiddly, and fields can overlap freely with no guard. Templates are
device-local only, the file comment itself notes cross-device sync is deferred.
There is no multi-record story, one block holds exactly one record, so it cannot
become a list of submissions. And the field drag uses a global pointer listener
without a closing-over of zoom mid-drag edge case, it reads zoom once at
drag start, which is fine but means a zoom change during a drag is ignored.

## Best-of-breed landscape

Jotform owns the general form-builder high ground with a drag-and-drop builder,
over ten thousand templates, conditional logic, payment fields, and widgets that
add behaviours like photo capture and e-signature inside a form. It is the thing
a user who says "I need a form" actually compares us to, and it collects and
stores responses, which we do not do at all.

Typeform owns the conversational, one-question-at-a-time experience plus real
response analytics, completion times, drop-off points and conversion. It is the
bar for a polished public-facing form, a different shape from our quiet on-desk
record but the same word in the user's head.

Google Forms owns frictionless free data collection for anyone in Workspace,
two-minute setup, and now AI smart suggestions that propose follow-up questions
and validation. Its layout is rigid and stacked, which is the one axis where our
freeform placement is genuinely nicer, but it collects responses and we do not.

Coda layouts are the closest neighbour to what this widget actually is, a
draggable, configurable card for every data field that you arrange in rows and
columns, sitting on top of a real table. Coda wins because the layout drives a
backing database with formulas and automations, so the designed card is a view
of structured rows, not an island.

Microsoft Power Apps canvas apps and Retool are the freeform, pixel-placement
end of the market, drop controls anywhere and bind them to data and logic. They
win on data binding, scripting, and turning a laid-out screen into a working
internal tool. They are heavyweight and not local, but they are the reference
for "I placed fields freely and now they do something."

What we already do better or uniquely could is the placement of a small typed
record on an infinite canvas right beside the live browser tab, the voice note
and the timer for the same task, with the layout reusable as a one-click
personal template and every value staying on the machine. None of the incumbents
put the form on the same surface as the rest of the work, and none keep the data
purely local by default. The freeform drag, which is a luxury feature in Coda
and Power Apps, is our default.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. No AI build (Google Forms smart suggestions, and the rest of our own desk).
   "Make me an intake form with name, email, goal, and a referral source." Today
   you place all ten fields by hand. This is the most jarring gap because every
   neighbouring widget on the desk can be built from a sentence and this one
   cannot.
2. No submission or output (Jotform, Typeform, Google Forms). "Fill this in and
   send it" or "collect ten of these." The values are trapped in one widget's
   content with nowhere to go, so it is a private record, not a form, and the
   word form sets an expectation we miss.
3. Required and validation not enforced (everyone). "It let me save with the
   email blank and malformed." The required flag and email type are cosmetic,
   which undermines trust the moment a user tests it.
4. No alignment, snapping, or overlap guard (Coda, Power Apps, Retool). "I just
   want these three fields lined up." Absolute pixels with no guides means tidy
   is tedious and fields can sit on top of each other.
5. No conditional logic or calculated fields (Jotform, Typeform, Coda). "Show
   the referral box only if they picked referral." Out of reach today.
6. Templates are device-local (Coda, Notion, all cloud tools). "I built this on
   my laptop, where is it on my desktop." The file comment admits this is
   deferred.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")
- AI build path. Add a `lib/customBlockAiBuild.ts` mirroring the table's
  `tableAiBuild.ts` so the command bar can scaffold a titled block of typed,
  labelled, sensibly placed fields from a sentence. Acceptance: typing "intake
  form with name, email, goal, and a referral select" produces a usable block
  with those four fields placed without overlap, so we match Google Forms smart
  suggestions for the build moment and beat it on freeform placement.
- Enforce required and validate on use. In use mode, flag empty required fields
  and malformed email and url values with an inline marker, and expose a simple
  `isComplete` state. Acceptance: a required email left blank or set to "abc"
  shows an error and the block reports incomplete, so we stop trailing Jotform on
  basic trust.
- Snapping and overlap guard. Snap field drag and resize to the existing 16px
  grid and prevent fields from overlapping more than a small threshold, with an
  optional align-left helper for a selection. Acceptance: dragging three text
  fields produces a clean aligned column without pixel fiddling, closing the
  tidiness gap against Coda and Power Apps.

### Launch-polish
- Output the record over a wire. Let a filled block emit its values to a wired
  table widget or desk agent, one row per submit. Acceptance: a block wired to a
  table appends a row on submit, turning a record into a collectable form using
  our own canvas wiring rather than a cloud backend.
- Conditional visibility. A per-field "show when field X equals Y" rule
  evaluated in use mode. Acceptance: a referral text box only appears when a
  select equals referral, matching the Jotform headline feature at small scale.
- Cross-device templates. Move template storage from localStorage onto the same
  prefs sync the rest of the app uses. Acceptance: a template saved on one device
  appears on another, closing the deferred gap the file comment names.

### Post-launch (pull ahead)
- Multi-record mode. Let a block hold and page through many records, so one
  designed card becomes a small dataset, approaching a Coda layout over a table
  but local-first.
- Calculated and rollup fields over the block's own values, a "total" from a
  quantity and a price, reusing whatever expression evaluator the table grows.
- AI reshape in place. "Add a phone field and group the contact fields" mutates
  an existing block, something no incumbent can do because they lack our in-place
  desk AI.
- Wire-fed prefill. A wire from a browser or agent widget prefills a block from
  upstream data, so the record arrives half-filled from research on the same
  canvas.

## The unfair advantage

Only Haptyx can sit a freeform typed record on the same surface as the live
browser tab, the voice note and the timer for the one task, let a desk agent or
the in-place AI build and later reshape that record from a sentence, wire the
filled values straight into a table or an agent on the same canvas instead of a
cloud inbox, and keep every entered value on the user's machine by default. The
freeform placement that Coda and Power Apps treat as a premium capability is our
starting point, and the local-first, wireable record is a shape no form builder
offers because they are all funnels into someone else's database. Close the AI
build and the output gaps and this stops being a private form sketch and becomes
the only record designer that is also a first-class citizen of the desk.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
