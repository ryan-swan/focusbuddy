# Note, SME doc (master of destiny)

Tier: Hero. The note is the widget people drop on a desk in the first ten
seconds, so it has to feel better to capture into than Apple Notes or Keep, not
merely present.

## The use case

Someone is mid-task on the canvas and a thought arrives that doesn't belong
anywhere else yet. A phone number a client just read out, the three things they
have to remember before the standup, a paragraph they're drafting, the rough
shape of an idea before it becomes a page or a table. They want a blank surface
they can dump it onto without choosing a format, without a toolbar, without
ceremony, right next to the timer and the browser tab and the table for the same
piece of work. The note is the quick-capture primitive of the desk. The moment of
use is "I have a raw thought and I want it down on paper now, here, before it's
gone", and the paper has to stay on the machine and never make them think about
where it went.

## Current state

Rendered by `src/renderer/src/components/widgets/NoteWidget.tsx`. The body is a
single `<textarea>` over `widget.content` (a plain string in the shared
`Widget` type, `src/shared/types.ts` line 181), styled as cream paper with a
serif face. There is no separate notes table; the text lives in the widget row
like sticky and markdown content do.

What works today is the capture loop and the canvas citizenship around it. Typing
saves on a 600ms debounce, and a dedicated unmount-flush effect writes the
un-debounced tail back through the widget store before the component is torn down,
which matters because the canvas remounts every widget when `layoutVersion` bumps
on pin, unpin, group, auto-arrange, or AI-accept. Without that flush the last few
characters you typed would vanish, and the code carries a comment saying exactly
that. The note is a first-class canvas object, so it is resizable, draggable,
pinnable, groupable, sectionable, shareable, and it shows in focus mode inline
(`WidgetFocusMode.tsx`) and in the dock as a content widget (`WidgetDock.tsx`).
Right-clicking the paper opens the create-and-connect menu
(`ConnectedToolMenu.tsx`), so a selection can spawn a wired sticky, markdown,
page, or table with a ghost-line link already drawn, and shift-right-click falls
through to the native cut/copy/paste menu. The note is also visible to the AI:
`canvasSnapshot.ts` includes note content in the context it sends to the model and
gives note-kind widgets a small relevance nudge, so "summarize this note" or "turn
this note into tasks" can find it.

The honest weaknesses are real and they are the whole point of this tier. The note
has no formatting at all, not even the light markdown affordances its sibling
`MarkdownWidget.tsx` gets from Tiptap, so the moment a thought wants a heading or a
checkbox the user has to abandon the note and respawn a markdown widget. There is
no checklist, which is the single most common quick-capture shape and the thing
Keep and Apple Notes lead with. There is no per-note search, no pin-to-top within
a stack of notes, no color or label, and no way to scan a wall of notes at a
glance. There is no image, no scan, no handwriting, no voice capture wired into
the note itself, even though the app already has a whole voice-note transcription
pipeline in `src/main/ai/voiceNote.ts` that the note widget does not call. There
is no AI build path for the note the way `tableAiBuild.ts` scaffolds a table from
a sentence, so the AI can read a note but cannot create or restructure one as a
first-class action. And the textarea does not grow or autosize beyond its frame,
so a long note becomes a small scroll box rather than a sheet of paper.

## Best-of-breed landscape

Apple Notes is the default that most users measure quick capture against. It wins
on instant checklists, on a built-in scanner with Live Text, on OCR that makes
text inside images and handwriting searchable, on pin-to-top, on color and label
filtering, on locked notes, and on Apple Pencil sketching inline. Its capture is
fast from a widget and frictionless once you're in the Apple ecosystem
([Apple Notes review, Paperlike 2026](https://paperlike.com/blogs/paperlikers-insights/apple-notes-review)).

Google Keep owns raw capture speed and visual triage. From a cold home screen the
widget drops you into a new note in under a second, notes are color-coded tiles in
a grid you can scan at a glance, camera capture pulls text out of a photo or a
whiteboard, and reminders plus labels make a wall of short notes retrievable
([Apple Notes vs Google Keep, smartremotegigs 2026](https://smartremotegigs.com/apple-notes-vs-google-keep/),
[Google Keep alternatives, Atlas 2026](https://www.atlasworkspace.ai/blog/google-keep-alternatives)).

Bear is the writing-experience leader for plain notes. It is markdown-first with
inline rendering as you type, it has the calmest and prettiest editor in the
category, it organizes by hashtags placed anywhere in the text including nested
tags and pinned tags, it links notes with wikilinks, and it supports inline
sketching ([Bear vs Apple Notes, Atlas 2026](https://www.atlasworkspace.ai/blog/bear-vs-apple-notes),
[bear.app](https://bear.app/)). Bear is the bar for "this is a nice place to think
on paper".

Obsidian and Logseq are the local-first reference points. They store notes as
plain files the user owns forever, they launch without internet, sync is opt-in,
and they carry deep linking and plugin ecosystems on top
([best note apps, Zapier 2026](https://zapier.com/blog/best-note-taking-apps/)).
They are the philosophical neighbours of our local-first stance, and the proof
that ownership of the file is a feature people choose an app for.

What we already do better or uniquely could is the canvas context none of them
have. Our note sits on the same surface as the live browser tab, the timer, the
table, and the desk agents for one piece of work, instead of in a separate notes
silo. It can be wired to other widgets with a ghost line so a selection becomes a
connected page or table. Its text is already in the AI's view of the desk, so a
desk agent can read it and act on it in place. And every byte stays on the machine
without us asking the user to opt into local-first, because that is the default.
No incumbent has the canvas plus in-place AI plus local-first combination.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. No checklist (Google Keep, Apple Notes). "I want a quick to-do I can tick off
   right here." This is the most common quick-capture shape in the category and we
   have zero support for it on the note, which is the most visible gap versus Keep.
2. No light formatting (Bear, Apple Notes). "I just want a bold word and a
   bullet without leaving for a markdown widget." Today the note is raw text and
   the only path to structure is abandoning the note, which breaks the capture
   moment.
3. No autosize / sheet-of-paper growth (everyone). "My note got long and now I'm
   typing into a tiny scroll box." A capture surface should feel like paper that
   extends, not a fixed box.
4. No search across notes (Apple Notes, Keep, Bear). "Where did I write that phone
   number last week?" With many notes on many desks there is no way to find one by
   its text.
5. No pin, color, or label (Keep, Apple Notes). "Keep the important note on top
   and let me color-code by project." We can't triage a wall of notes visually.
6. No capture beyond the keyboard (Apple Notes, Keep). "Snap the whiteboard, drop
   a voice memo, scan the receipt into this note." We have a voice pipeline in the
   codebase that the note never calls, and no image or scan path at all.
7. No AI build for the note (none of them, and us not yet). "Make me a note that
   summarizes this call" should spawn and fill a note the way it scaffolds a table.
   The AI can read notes but cannot create or restructure them as an action.

## The supersonic plan

### Launch-blocking (must ship to clear "Hero")
- Inline checklist mode. A line that starts with a checkbox toggle, ticking
  persists to `widget.content`, and Enter on a checked line starts the next item.
  Acceptance: a user types a three-item to-do and ticks them off without leaving
  the note, matching the Keep and Apple Notes quick-checklist that is the
  category's most-used shape.
- Light formatting without a toolbar. Markdown-style inline cues for bold,
  bullets, and headings rendered as you type, reusing the Tiptap stack already
  proven in `MarkdownWidget.tsx` but kept toolbar-free so the note stays a calm
  capture surface. Acceptance: a thought that grows a heading and a bullet stays in
  the same note instead of forcing a markdown respawn, closing the Bear writing-
  experience gap for the common case.
- Autosizing paper. The note grows with its content up to its frame and scrolls
  cleanly past it, so a long note reads like a sheet rather than a box. Acceptance:
  a 40-line note is comfortable to read and edit, parity with every plain-note app.
- Per-desk and cross-desk note search. A command-bar query finds notes by their
  text and jumps to them. Acceptance: "find the note with the invoice number"
  lands on the right note across desks, matching Apple Notes search.

### Launch-polish
- Pin, color, and label on the note, with a grid scan view in the dock so a wall
  of notes can be triaged at a glance. Acceptance: a user color-codes notes by
  project and pins the active one, matching Keep's visual triage.
- Image and scan into the note. Drop or paste an image inline, and run it through
  the existing OCR-capable pipeline so its text is searchable. Acceptance: a photo
  of a whiteboard becomes a searchable note, matching Keep camera capture.
- Voice capture wired into the note. A record button on the note calls the
  existing `voiceNote.ts` transcribe-and-clean pipeline and drops the text into the
  note. Acceptance: a spoken thought becomes clean note text in place, using
  infrastructure we already shipped and that none of the desktop incumbents do
  inside a freeform canvas note.

### Post-launch (pull ahead)
- AI build and restructure for the note, the equivalent of `tableAiBuild.ts`.
  "Make a note that summarizes this call" spawns and fills a note, and "tidy this
  note" restructures it in place. Acceptance: a note can be created and reshaped by
  a sentence, something no incumbent does because they lack our in-place AI.
- Wire-driven note capture. A wire from a browser or agent widget streams text
  into a note, so research and agent output land as note paragraphs without a
  copy-paste. Acceptance: a research agent's answer flows into a wired note,
  uniquely using our canvas wiring.
- Backlinks between notes and pages, so a note can reference a page or another
  note and the link is navigable, taking the Bear and Obsidian linking ground onto
  the canvas where the link is a visible ghost line, not just text.

## The unfair advantage

Only Haptyx can put the quick-capture note on the same surface as the live browser
tab, the timer, the table, and the desk agents for one piece of work, instead of
in a separate notes app the user has to switch to. The note's text is already in
the AI's view of the desk, so a desk agent can read it, summarize it, and act on
it in place, and a ghost-line wire can turn a selection into a connected page or
table or stream agent output back into it. And the paper stays on the machine by
default, no opt-in, no account, which is the thing Obsidian users choose their app
for. The plan above closes the checklist, formatting, search, and capture gaps the
incumbents lead with. The canvas plus in-place AI plus local-first trio is why,
once at parity, our note is better in kind rather than a free clone of Keep.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
