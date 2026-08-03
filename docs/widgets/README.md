# Widget SME docs, the master of destiny

Every widget in Haptyx is treated as its own product with its own use case. Each
has a subject-matter-expert (SME) document in this folder that is the single
source of truth for what that widget is for, how good it is today, who the
best-of-breed competitors are, and the plan to make ours beat every one of them
at that widget's job. The SME doc is not a description written after the fact. It
leads. We implement against it, and we update it as we ship, so the doc and the
widget never drift.

The bar is deliberately high. For each widget the target is not "good enough for
a launch checklist" but "a person who lives in the best-in-class tool for this
one job would switch to ours for that job." A note widget should make someone
leave Apple Notes. A table should make someone leave Airtable for this use. The
SME doc is where we prove, concretely and with named competitors, that we have a
real path to that.

## How an SME doc is structured

Each `docs/widgets/<kind>.md` follows the same shape so they're comparable and so
an agent or a human can pick one up cold and know exactly what to build next.

1. **The use case.** Who reaches for this widget, the job they're hiring it to
   do, and the moment of use on the canvas. One honest paragraph, not marketing.
2. **Current state.** What the widget actually does today, grounded in the real
   code (file paths, capabilities, and the rough edges). Honest about what's
   missing or broken.
3. **Best-of-breed landscape.** The three to six products that own this job, each
   named, with the specific things they do better than us and the one or two
   things we already do better or could uniquely do because we live on an
   infinite canvas with AI and local-first storage.
4. **Gap analysis.** Where we lose today, ranked. Each gap ties to a named
   competitor and a concrete user moment.
5. **The supersonic plan.** Prioritised, phased work to close the gaps and then
   pull ahead, split into launch-blocking, launch-polish, and post-launch tiers.
   Every item is specific enough to implement and has an acceptance line that
   says what "we now beat X at Y" means in testable terms.
6. **The unfair advantage.** The one or two things only Haptyx can do for this
   widget because of the canvas, the wires, the desk agents, or local-first
   privacy, the reason ours is not just a clone but better in kind.
7. **Implementation log.** Dated entries as we ship against the plan, so the doc
   stays the master of destiny rather than a stale spec.

## The widget roster (32 use cases)

Grouped by family. Status tracks the SME doc, not the implementation.

### Capture and writing
- [Sticky](sticky.md), fast, disposable thought capture
- [Note](note.md), durable rich-text note
- [Markdown](markdown.md), markdown-native editing
- [Page](page.md), Notion-style long-form document
- [Scratchpad](scratchpad.md), freehand / infinite ink surface
- [Card](card.md), titled snippet / index card

### Structured data
- [Table](table.md), Airtable/Notion-style typed database, **flagship example, written**
- [Field](field.md), a single typed field on the canvas
- [Mind map](mindmap.md), branching idea tree with AI expand
- [Diagram](diagram.md), node-and-edge diagramming

### Media
- [Image](image.md), image display + annotation
- [Video](video.md), video playback
- [Voice note](voice-recorder.md), record → transcribe → summarise
- [PDF](pdf.md), PDF viewing + markup

### Web and integrations
- [Browser](webview.md), embedded live web view
- [Doc](gdoc.md), Google Docs embed
- [Sheet](gsheet.md), Google Sheets embed
- [Slides](gslide.md), Google Slides embed
- [Email](email.md), email surface
- [File or link](file.md), unified file / link object

### Utility and focus
- [Timer](timer.md), countdown / pomodoro
- [Calculator](calculator.md), on-canvas calc
- [Color](color.md), colour swatch / picker
- [Shape](shape.md), geometric shape / annotation
- [Section](section.md), grouping container with layouts
- [Task link](task-link.md), link to another task/desk
- [App launcher](local-app-launcher.md), launch / mirror native apps

### Power and AI
- [SpeedDeck](streamdeck.md), Elgato-style macro button grid
- [Desk agent](agent.md), an embedded AI agent on the canvas
- [Custom block](custom-block.md), user-defined widget block
- [Portal](portal.md), live window into another desk
- [Minimap](minimap.md), canvas overview + navigation

## Launch tiers

Not every widget needs to win before launch. The SME docs assign each widget a
tier so the implementation effort is spent where it converts:

- **Hero**, the widgets people will judge the product on (Table, Page, Note,
  Mind map, Voice note, Browser, Desk agent). These must clearly beat best of
  breed for their core job at launch.
- **Strong**, widgets that need to be obviously good, not category-leading
  (Sticky, Markdown, Field, Timer, Section, File, Image, Diagram, Scratchpad).
- **Sufficient**, utility and embeds where parity or a clean integration is
  enough at launch (Calculator, Color, Shape, Task link, Minimap, Portal, the
  Google embeds, Email, PDF, App launcher, Custom block, Card).

The flagship `table.md` shows the full quality bar. The rest are generated and
then implemented against, hero widgets first.
