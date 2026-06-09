# Page, SME doc (master of destiny)

Tier: Hero. The page is where people write, so it is judged on feel as much as
features, and at launch it has to read and edit like a serious document tool, not
a textarea with a slash menu bolted on.

## The use case

Someone needs to write something longer than a sticky note while the rest of the
work sits around them. A meeting agenda, a spec, a running set of decisions, a
research write-up, a checklist that turns into prose and back. They reach for the
page because it holds structured text with headings, lists, todos, code, and
quotes, and because it lives on the same canvas as the browser tab they are
reading from, the voice note they just recorded, and the table they are tracking
against. The defining moment is "I need to think on the page, right next to
everything this thought is about, and I would rather an AI draft the boring scaffold
than face a blank document." The living-page variant has a second moment, which is
"I do not want to write this at all, I want it to keep itself current from the rest
of the desk while I work."

## Current state

Backed by Tiptap (`@tiptap/starter-kit` plus TaskList, TaskItem, Placeholder, and
Link), rendered by
`src/renderer/src/components/widgets/PageWidget.tsx`. Content is the editor's JSON
serialization stored in `widget.content`, persisted through the widget store's
`update` on a 250ms debounce in `schedulePersist`. The two AI paths live in
`src/main/ai/anthropic.ts`, where `suggestPageContent` drafts insertable content
for the manual editor and `regenerateLivingPage` rebuilds a living page from the
other widgets in the task. Both convert model markdown into a Tiptap doc through
`src/main/ai/markdownToTiptap.ts`. The living-page auto-refresh is driven outside
React by `src/renderer/src/lib/livingPageScheduler.ts`, with IPC wired in
`src/main/ipc/index.ts` (`livingPage:regenerate`, `ai:suggestPageContent`).

What works today:
- A real block editor. Headings 1 to 3, bullet and numbered lists, todo lists with
  nesting, code blocks, quotes, and dividers all work out of the box through
  StarterKit, with markdown input rules so typing `#` or `-` produces the block.
- A slash menu at the caret. Press `/` and a positioned menu offers the common
  blocks plus an AI prompt entry, anchored to the cursor's screen rectangle.
- In-place AI drafting that stages before it lands. `suggestPageContent` returns
  markdown for a preview panel and Tiptap JSON for the real insert. Nothing enters
  the document until the user clicks Insert, and they can re-prompt or discard.
- Living pages. A page can carry a `livingQuery` and regenerate its whole body from
  the rest of the canvas, with a header showing the query, a freshness badge, and
  regenerate, pause, and convert-to-manual controls. The scheduler debounces 45s,
  enforces a 90s minimum gap, skips paused pages, and never loops on its own writes.
- A first-class canvas object. It is resizable, wireable, shareable, has a
  right-click connected-tool menu over the current selection, and survives reload
  through the JSON persist with a backward-compatible plain-text fallback in
  `tryParseContent`.

Rough edges, honestly:
- No backlinks and no `[[wikilink]]` page-to-page linking. The page cannot
  reference another page by name, so a set of pages is a pile of documents, not a
  connected wiki.
- No in-page search or find-and-replace, and no outline or table-of-contents view,
  so a long page is hard to navigate.
- No images, no file or attachment embeds, and no inline embed of another widget.
  Link is configured but `openOnClick` is false, so even plain links are inert in
  the editor.
- No tables inside the page, no toggles or collapsible sections, no callouts, and
  no nested sub-pages.
- Formatting is mouse-and-slash driven. There is no floating selection toolbar for
  bold, italic, link, and the like, and no markdown export back out of the page.
- The AI assistant drafts from the prompt alone. The manual `suggestPageContent`
  path does not read the rest of the canvas the way the living path does, so "draft
  this from my notes" is only available in living mode, which then takes the page
  out of the user's hands.
- Living mode is all-or-nothing. The whole body is system-owned and rewritten, so a
  user cannot have a living summary section sitting inside a page they also edit.

## Best-of-breed landscape

Notion owns the all-purpose page. Nestable blocks for everything including
sub-pages, databases, and embeds, automatic backlinks on any page that gets
referenced, a deep slash menu, and an AI layer that, in the 3.0 generation, drafts
in place, edits selections, builds databases and views from a sentence, and runs
agents across the whole workspace. It is the tool people mean when they say
"a page," and the bar our slash menu and AI are measured against.

Craft wins on writing feel and polish. A native, fast block editor with beautiful
typography, document-level structure with backlinks, and AI for generation,
rewriting, and smart formatting. Where Notion can feel like a database that learned
to write, Craft feels like a document tool first, which is exactly the register a
Hero page should hit.

Obsidian and Logseq own connected local-first knowledge. Plain-text markdown on
your own disk, `[[` to link and an instant backlinks panel, graph view, and an
enormous plugin ecosystem. They are the closest neighbours to our local-first
stance and the reason "your pages stay on your machine" is table stakes rather than
a differentiator unless we add the linking they have.

Anytype is the local-first Notion. A block editor with pages, relations, and
databases, stored locally and synced peer to peer with end-to-end encryption. It
proves that local-first and a rich block model can coexist, which is the exact
combination we are claiming.

Coda treats the doc as a programmable surface. Tables, formulas, buttons, and
automations as first-class citizens inside the document, with AI woven into the
formula and automation layer. It is overkill for a single page, but it sets the
ceiling for "a document that does things."

What we already do better, or uniquely could: our page is one object on an infinite
canvas sitting next to the live browser tab, the voice note, the timer, and the
table for the same task, so writing happens in context instead of in a separate
app. The in-place AI stages every suggestion for approval before it touches the
document. The living page is a genuinely different idea, a document that keeps
itself current from the surrounding work, which none of the incumbents do because
none of them have the surrounding work on the same surface. And every byte stays on
the machine. No incumbent has the canvas plus in-place staged AI plus living
documents plus local-first together.

## Gap analysis (ranked, each tied to a competitor and a user moment)

1. **No selection formatting toolbar (Notion, Craft, everyone).** "I selected a
   phrase and want to bold it or make it a link." Today there is no floating
   toolbar, so the most basic editing gesture in a writing tool is missing. This is
   the first thing that makes the page feel unfinished.
2. **No backlinks or `[[` page linking (Obsidian, Logseq, Notion, Craft).** "I want
   this page to reference the spec page and see what links back here." Today every
   page is an island, so a workspace of pages has no structure.
3. **No images, attachments, or embeds (Notion, Craft).** "Paste a screenshot into
   the spec." The page is text-only, which rules out the most common real document.
4. **Manual AI ignores the canvas (Notion, Craft).** "Draft the summary from my
   notes without handing the page over to living mode." Only living mode reads the
   surroundings, and it then owns the whole body, so there is no in-place,
   context-aware draft that the user keeps control of.
5. **No in-page search, outline, or table of contents (Notion, Craft).** "Jump to
   the Risks section of a long page." Long pages are hard to navigate.
6. **No callouts, toggles, or tables inside the page (Notion, Craft, Coda).**
   "Collapse the appendix, box the warning, drop a small table inline." The block
   palette is shallow next to the incumbents.
7. **Living mode is all-or-nothing (no incumbent, but it is our own rough edge).**
   "Keep this one section current while I write the rest by hand." Today enabling
   living mode rewrites the entire page and locks editing.

## The supersonic plan

### Launch-blocking (must ship to clear Hero)
- **Floating selection toolbar.** On text selection, show bold, italic, code, link,
  and a turn-into-block control, using Tiptap's BubbleMenu. Acceptance: a user can
  bold a phrase and add a link by mouse with no slash menu, matching the basic
  editing feel of Notion and Craft.
- **Page links and backlinks.** Typing `[[` opens a page picker scoped to the
  current task (and optionally the workspace), inserts a link node, and each page
  shows a backlinks panel of pages that reference it. Acceptance: link the spec page
  from the agenda page and the spec shows "linked from Agenda", beating the flat
  pile we ship today and reaching Obsidian and Notion table stakes.
- **Images and pasted screenshots.** A Tiptap image node plus paste and drop
  handlers that store the blob locally and reference it. Acceptance: paste a
  screenshot into a page and it renders and survives reload, matching the most basic
  Notion and Craft document.
- **Canvas-aware in-place draft.** Extend `suggestPageContent` to optionally take
  the task's source widgets the way `regenerateLivingPage` does, so the manual AI
  can draft from the surrounding notes while still staging for approval and leaving
  the page editable. Acceptance: "summarize my notes here" works inside a normal
  editable page, which is the in-place AI promise without the living-mode handover.

### Launch-polish
- **In-page search and an outline panel.** Find within the page, and a heading
  outline or table of contents for quick navigation. Acceptance: jump to any heading
  in a long page in one click, matching Notion's outline.
- **Richer blocks.** Callouts, collapsible toggles, and an inline table block.
  Acceptance: box a warning, collapse an appendix, and drop a three-by-three table
  without leaving the page, narrowing the block-palette gap to Notion and Craft.
- **Markdown and clean export.** A tiptap-to-markdown serializer so a page can be
  copied or exported as markdown, and so paste-in markdown is lossless. Acceptance:
  copy a page out as clean markdown that round-trips back in.
- **Inert links become live.** Make `Link` open on click (or a hover affordance) so
  references and `[[` links are actually navigable.

### Post-launch (pull ahead)
- **Living sections, not just living pages.** A block-level living region inside an
  otherwise hand-edited page, so one section keeps itself current from the canvas
  while the rest stays the user's. Acceptance: a page has a self-updating "what
  changed today" block above text the user wrote by hand, something no incumbent can
  do because none of them have the canvas as the source.
- **Wire-driven pages.** A wire from a browser or agent widget streams content into
  the page, so research a desk agent gathers lands as a drafted section. Uses our
  unique canvas wiring.
- **AI edit-in-selection.** Select a paragraph and ask the AI to rewrite, shorten,
  or change tone, staged before it replaces the selection, matching Notion and
  Craft inline editing while keeping our approve-before-it-lands discipline.
- **Embed another widget inline.** Drop a live reference to the table or timer for
  the same task directly into the page body, which only makes sense because they are
  already on the same surface.

## The unfair advantage

Only Haptyx can put a writing surface on the same canvas as the live browser tab,
the voice note, and the table for the same piece of work, then let an AI draft into
it from a sentence and stage that draft for approval before a word lands, then keep
a section of it, or the whole page, alive so it stays current from the surrounding
work without the user lifting a finger, all with every byte staying on the machine.
The living page and the eventual living section are the sharp edge here. They are
not a feature an incumbent can copy by adding a panel, because they depend on the
rest of the work living on the same surface, which is the one thing a tab in a
browser does not have. The plan above closes the basic-editor and linking gaps that
make us look unfinished next to Notion and Craft. The living document plus canvas
plus staged in-place AI plus local-first combination is why, once at parity on the
basics, the page is better in kind rather than a thinner clone.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
