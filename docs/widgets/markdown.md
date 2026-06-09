# Markdown, SME doc (master of destiny)

Tier: Strong. People won't pick Haptyx because of the markdown widget, but they
will lose trust fast if writing in it feels worse than the editor they already
use, so it has to be quietly excellent and never get in the way.

## The use case

Someone on the canvas needs to write more than a sticky note holds but less than
a full document deserves. A short spec, a meeting agenda, a checklist with some
formatting, a snippet of notes they want to keep as real markdown rather than
plain text. They reach for it because they think in markdown, they want headings
and lists and links and code to render as they type, and they want the result to
stay as portable `.md` they could copy out to anywhere. The moment of use is "I
have a paragraph or two of structured thinking to capture next to everything else
on this desk, and I want it to look right while I type it, not after."

## Current state

Implemented as a TipTap editor in
`src/renderer/src/components/widgets/MarkdownWidget.tsx`. The document is stored
as a markdown string in `widget.content` through the widgets store
(`useWidgetStore().update`), so there is no separate table, the whole widget is
one serialised markdown blob. Serialisation in and out of TipTap goes through the
`tiptap-markdown` extension configured with `html: false`, tight lists, `-`
bullet markers, and linkify on.

What works today:
- True in-place WYSIWYG. You type `# ` and get a heading, `- ` gives a list,
  `[ ] ` gives a task item, and it renders as you go rather than in a split
  preview pane. This is the Typora-style experience, not a raw-text box.
- A formatting toolbar (the `TOOLBAR` array) covering bold, italic, strike,
  inline code, heading 2, bullet and numbered lists, task lists, quote, code
  block, link, and a divider, each with the active state reflected from the
  editor.
- Task lists with nested items via `TaskList` + `TaskItem`, so checklists are
  real checkboxes, not text.
- Links that autolink, open in the external browser, and carry
  `rel="noopener noreferrer"`.
- Paste handling that transforms pasted text into markdown
  (`transformPastedText: true`), so dropping markdown in mostly does the right
  thing.
- AI can create the widget. The Anthropic and voice command paths
  (`src/main/ai/anthropic.ts`, `voiceCommand.ts`, `agentDispatcher.ts`,
  `voiceNote.ts`) all know `markdown` as a creatable kind whose `content` is
  markdown, so "make me a markdown note about X" spawns a populated widget.
- It participates in wiring. The right-click menu opens `ConnectedToolMenu` with
  the selected text, desk agents can target it as an output (the format hint in
  `src/main/ipc/index.ts` tells an agent to produce "Markdown"), and its body is
  passed through to widget summaries (`src/main/ai/widgetSummary.ts`).
- The save path is hardened. The debounced `onUpdate` and the unmount flush both
  guard against two real bugs that used to wipe content, the markdown serializer
  not being ready on first parse and `getMarkdown()` briefly returning empty, so
  AI-generated checklists no longer auto-delete themselves.

Rough edges (honest):
- No export. There is no "copy as markdown", no export to PDF, HTML, or Word.
  The content is portable in principle but there is no one-click way to get it
  out.
- The toolbar stops at heading 2. There is no H1 or H3, no text colour or
  highlight, no table insertion, and no image embedding inside the body.
- No slash menu. Everything is either a markdown shortcut you have to remember or
  a toolbar button, there is no `/` command palette to insert blocks.
- No tables inside the markdown, no math, no Mermaid or any diagram block, and no
  syntax highlighting inside code blocks.
- No find and replace, no word or character count, no outline of the headings.
- No focus or typewriter mode, so as a writing surface it is plainer than the
  apps people compare it to.
- It overlaps confusingly with the sibling `PageWidget.tsx`, the Notion-style
  document. The boundary between "markdown" and "page" is not obvious to a user,
  and nothing in the UI explains when to pick which.

## Best-of-breed landscape

Obsidian is the centre of gravity for markdown in 2026. It is a local-first
knowledge base built on plain `.md` files, and it wins on `[[wikilinks]]` and
backlinks, the graph view, live preview that renders inline while letting you
edit raw syntax, and a community plugin ecosystem in the thousands covering
everything from kanban to dataview queries. Its weakness is that it is a vault,
not a surface you drop one note onto, and its proprietary syntax does not travel.

Typora owns the pure writing experience. It pioneered the seamless in-place
WYSIWYG that our widget imitates, and it goes much further with built-in Mermaid
diagrams, flowcharts and Gantt, LaTeX math rendered inline and in blocks, custom
CSS themes, and export to PDF, HTML, Word, ePub, LaTeX and more via pandoc.
Export is the thing Typora makes effortless that we simply do not have.

iA Writer is the benchmark for focused writing. Focus Mode dims everything except
the sentence under the cursor, syntax highlighting draws attention to adjectives
and adverbs so you can tighten prose, and its AI Authorship tracking colours what
was typed versus pasted versus AI-written. It is minimal on purpose and beautiful,
and it makes our toolbar-and-render approach feel utilitarian by comparison.

Bear is the Apple-native favourite for beauty and quick capture, with polished
themes, tags as organisation, and a clean editor. It wins on feel and on being
the nicest place to jot something, which is close to our widget's actual job.

StackEdit and HackMD round out the web side, where the wins are live split
preview, instant export and publishing, and in HackMD's case real-time
collaboration on a markdown doc. They show that "write markdown, get it out
somewhere useful immediately" is a job people pay for.

What we already do better or uniquely could: our markdown note is one object on an
infinite canvas sitting next to the browser tab, the table, the timer and the
voice note for the same task, none of these editors live inside that context. An
AI can create and fill it from a sentence in place, it can be wired to other
widgets and to desk agents so a note becomes an input or an output of a flow, and
every byte stays on the machine. Obsidian is local-first too, but it cannot put
the note on a shared spatial surface with live widgets, and it has no in-place AI
that reshapes the note from natural language.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. No export of any kind (Typora, iA Writer, StackEdit). "I wrote the spec here,
   now I need it as a PDF for the email" or even just "copy this as clean
   markdown". Today there is no path out at all. This is the most embarrassing
   gap because the content is already markdown, the work is purely plumbing.
2. No slash command menu (Obsidian, and the sibling page widget). "I want to drop
   in a code block or a divider without remembering the markdown shortcut." Every
   modern editor has a `/` menu and ours does not.
3. Thin block coverage: no tables, no math, no diagrams, no image embeds, no H1
   or H3 (Typora, Obsidian). "I want a small table or a flowchart inline in my
   note." Typora renders Mermaid and LaTeX in place, we render neither.
4. No focus or distraction-free writing mode (iA Writer). "I want to actually
   draft prose in here without the canvas pulling my eye." Our surface is fine
   for capture, weak for sustained writing.
5. No find and replace, word count, or document outline (every serious editor).
   "Where did I write that, and how long is this." Basic writing affordances are
   missing.
6. Unclear identity versus the page widget (self-inflicted). "Do I pick markdown
   or page?" Nothing guides the choice, so users will pick wrong and feel the
   tool is duplicated.

## The supersonic plan

### Launch-blocking (must ship to clear "Strong")
- Export and copy out. Add "Copy as markdown" (the raw `getMarkdown()` string to
  the clipboard) and "Export to PDF" and "Export to HTML" from the widget menu,
  rendering the same `md-rendered` styles. Acceptance: a user writes a note,
  exports a clean PDF and copies portable markdown in two clicks, so we match the
  one thing Typora and iA Writer make trivial and we currently cannot do at all.
- A slash command menu. Typing `/` opens an insert palette for heading levels,
  lists, task list, quote, code block, divider, and link, mirroring the toolbar
  plus the missing H1 and H3. Acceptance: a user inserts a code block and an H1
  without knowing any markdown shortcut, reaching parity with the page widget and
  Obsidian's live-preview insert flow.
- A clear identity versus the page widget. Decide and document the boundary,
  markdown is the portable single-note surface, page is the rich multi-block
  document, and surface a one-line hint in the picker. Acceptance: a first-time
  user can state in one sentence when to pick markdown over page.

### Launch-polish
- Code block syntax highlighting. Wire `@tiptap/extension-code-block-lowlight` so
  fenced code blocks colour by language. Acceptance: a JavaScript block in a note
  is highlighted the way it is in Typora and Obsidian.
- Document affordances. Add a live word and character count in the widget footer,
  a find-and-replace box, and a collapsible heading outline. Acceptance: a user
  drafting a 600-word note can see the count, jump by heading, and replace a term,
  matching the basics every named competitor ships.
- Inline tables and image embeds. Add `@tiptap/extension-table` behind the slash
  menu and allow pasted or dropped images to embed via the files store.
  Acceptance: a user inserts a 3-column table and an image inside one note, a
  thing Typora does and we currently cannot.

### Post-launch (pull ahead)
- Focus mode. Borrow the iA Writer idea, dim everything except the active
  sentence or paragraph, toggled from the widget header. Acceptance: a user can
  draft prose in the widget with the same focus iA Writer is famous for, on a
  canvas no one else has.
- Math and diagrams. Render LaTeX math and Mermaid blocks inline. Acceptance: a
  note contains a rendered equation and a flowchart, matching Typora's headline
  rich blocks.
- AI rewrite in place. Select a paragraph, and a desk agent tightens it,
  summarises it, or expands it directly in the note, with an iA-Writer-style
  colour tag showing which sentences the AI touched. Acceptance: a user selects
  three messy sentences and gets a clean rewrite without leaving the widget,
  something no standalone markdown editor offers because none has our in-place AI.
- Wikilinks across the desk. Let `[[task name]]` or `[[widget title]]` resolve to
  a link that pans the canvas to that object. Acceptance: typing `[[` suggests
  on-desk targets and clicking the link navigates there, the Obsidian backlink
  idea reimagined for a spatial canvas.

## The unfair advantage

Only Haptyx can let an AI write into and rewrite a markdown note in place, on the
same surface as the live browser tab and the timer and the table for the same
piece of work, wire that note as the input or output of a desk agent flow so a
draft becomes something a flow acts on, and keep every byte on the user's machine.
Obsidian is local-first but flat and solitary, Typora and iA Writer are beautiful
but isolated single documents with no AI and no canvas. The plan above closes the
export, slash-menu, and rich-block gaps that make us look thin next to those
editors. The wikilink-that-pans-the-canvas and the select-and-let-an-agent-rewrite
moves are the ones nobody else can copy, because they only exist when the note
lives on a wired, AI-native, local-first canvas.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
- 2026-06-10, Shipped "Copy as markdown" in the toolbar (raw getMarkdown string to the clipboard). The slash-command insert menu and the documented boundary versus the page widget remain open from the launch-blocking tier.
