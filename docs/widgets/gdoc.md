# Doc, SME doc (master of destiny)

Tier: Sufficient. The Doc widget only has to do its narrow on-canvas job well
enough that nobody leaves the desk because of it. It does not have to beat Google
Docs at being Google Docs, it has to make a Google Doc feel like it belongs on
the canvas next to everything else.

## The use case

Someone is working a task and the source of truth for that task is a Google Doc
that already exists. A brief, a spec, a draft, a shared meeting agenda, the doc a
colleague is editing right now. They want it on the desk next to the timer and
the browser tab and the notes, not buried in a Drive tab they have to hunt for.
The moment of use is "the doc for this task lives over there in Google, put it
here so I can see it and edit it without losing my place." They are not trying to
author a document from scratch inside Haptyx, the Page widget is for that. They
want the live, real, collaboratively edited Google Doc, on the canvas, where the
work is.

## Current state

There is no dedicated Doc component. The `gdoc` kind is real and still routed, but
it has been folded into two other widgets, and that fold is the whole story of its
current state.

When a `gdoc` widget already exists on a canvas, `Canvas.tsx` (the `renderWidget`
switch, lines 180 to 186) routes it to `WebViewWidget.tsx`. So an existing Doc
renders as a full live `<webview>` browser pointed at the Google Docs URL, with the
real editing surface, a back/forward/reload toolbar, vault autofill for sign-in
(`lib/vaultAutofill.ts`), and the viewport-preset snapping in `WebViewWidget.tsx`.
This is genuinely good. The doc is live, editable, and collaborative inside the
widget, because it is the actual Google Docs web app running in an embedded
browser.

When a user goes to create a new Doc, though, the path is different. In
`lib/widgetCatalog.ts` (lines 168 to 180) the `gdoc` entry is marked
`hideFromPicker: true`. It was deliberately folded into the universal File widget
along with pdf, gsheet, gslide, email, image, and video (see the comment block at
lines 147 to 154). So a user who pastes a Google Doc link today gets a
`FileWidget.tsx` link card, a favicon and a title that opens the doc in the
external system browser on click (the URL-mode branch, lines 186 to 246), not an
embedded live editor. The live-iframe experience only exists for `gdoc` widgets
that were created before the fold, or that the AI creates directly.

The AI can create a Doc widget from a URL. `main/ai/anthropic.ts` lists `gdoc` as
a valid kind (lines 626, 686, 1125, 1222) and can emit an open-url action pointing
at a docs.google.com URL. So "put my brief doc on the desk" works by voice or
command bar. What the AI cannot do is read the contents of the doc. To every part
of Haptyx the gdoc is an opaque URL. `widgetContentFormat.ts` (lines 153 to 161)
explicitly treats gdoc as typed config that must never be overwritten with text,
and there is no Drive or Docs export path anywhere in `main/` that pulls the
document body out. The desk agents and the in-place AI cannot summarise it, quote
it, search it, or wire its text into another widget.

Honest about what is missing or thin. There is no first-class Doc identity, the
creation path produces a link card rather than a live editor unless you go through
the AI. The widget cannot expose the document's text to the AI or to wires, so the
single most Haptyx-native thing, in-place AI over the content, is impossible today.
There is no notion of which doc, no recent-docs picker, no Drive account
connection, no read-only versus edit awareness, and no offline state. The live
embed depends entirely on being signed in through the embedded browser, and if the
session is not authenticated the user sees Google's sign-in wall inside the widget
rather than their document.

## Best-of-breed landscape

Google Docs itself is the incumbent we are embedding, and that is the honest frame.
It owns real-time collaboration outright, multiple people editing the same document
at once with live cursors, comments, suggestions, and unlimited version history on
every plan. In 2026 it also has Gemini built directly into the editing surface, a
"help me write" and "help me create" bar that drafts and rewrites in place and
pulls context from the user's Gmail, Drive, and Chat. We cannot beat Google at
being Google Docs and we should not try, our job is to host it well and add what
Google cannot, which is the canvas around it.

Notion is the document tool people compare everything to for structure. Its
strength is that a document is also a database, that pages nest into a wiki, and
that Notion AI drafts briefs and SOPs against the workspace's own content. A doc in
Notion is part of a connected knowledge base rather than a single file.

Coda pushes the document furthest as a programmable surface. Tables drive the doc,
buttons and automations run logic inside it, and Coda Packs pull live data from
Jira, Figma, Salesforce, and hundreds of other sources straight into the page. It
is the high ceiling for "a doc that does things."

Craft is the polish and local-leaning benchmark, especially on Apple hardware. It
pairs a calm, beautiful writing surface with a capable AI assistant and is the
thing to beat on how a document feels to read and write, which matters because our
Page widget lives next door.

Slite is the one worth naming for retrieval. Its AI search answers questions across
a whole documentation set rather than making the user open and scan each doc, which
is exactly the capability our local-first, on-canvas position could own across all
the docs pinned to a desk.

What we already do better or uniquely could. None of these tools can put the live
document on the same infinite surface as the timer, the browser tab, the voice
note, and the table for the same task, and wire it to other widgets. None of them
keep the surrounding context on the user's own machine. And none of them can run an
in-place AI that reads the doc and also sees everything else on the desk at once.
The doc itself stays in Google, but the workspace around it is ours, and that is
the seam no incumbent occupies.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. Creating a new Doc gives a link card, not a live editor (Google Docs). "I
   pasted my brief link expecting to edit it here, and instead I got a clickable
   tile that throws me into another browser." The live embed already exists in
   `WebViewWidget`, but the hidden picker entry means new docs never reach it. This
   is the single biggest gap because it breaks the core promise on the most common
   action.
2. The AI cannot read the doc (Notion, Coda, Google Gemini). "Summarise this brief
   into a checklist on a sticky next to it." Today impossible, the gdoc is an
   opaque URL to every AI path. This is the gap that would otherwise be our
   signature move.
3. No doc picker or Drive connection (Google Docs, Notion). "Just show me my recent
   docs and let me drop one on the desk." Today the user must find and paste a raw
   URL by hand.
4. No wiring of doc content into other widgets (Coda Packs). "Wire this doc into a
   table so its action items become rows." The canvas has wires, the doc has no
   text to send through them.
5. No sign-in or read-only awareness (Google Docs). "Why am I looking at a Google
   login screen instead of my document." The embed silently fails to a sign-in wall
   with no explanation or recovery affordance.
6. No first-class Doc identity at all (everyone). "I wanted a Doc, the picker
   doesn't have one." The capability is buried inside File, so users never find the
   live-editor path on purpose.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")
- Restore a real Doc creation path to the live editor. When a user pastes a
  docs.google.com URL, or picks Doc from the catalog, create a `gdoc` widget that
  renders through `WebViewWidget`, not a `FileWidget` link card. Either unhide the
  `gdoc` catalog entry or have `FileWidget` detect a Google Docs hostname and
  hand off to the webview path. Acceptance: pasting a Google Doc link produces a
  live, editable, embedded document on first try, matching the experience an
  AI-created gdoc already gets, so we no longer lose the user to an external
  browser tab the way the File link card does.
- Sign-in clarity in the embed. When the embedded webview lands on Google's
  sign-in wall instead of the document, detect it and show a one-line "sign in to
  Google to load this doc" affordance rather than a bare login page. Acceptance: an
  unauthenticated user understands why the doc is not showing and has an obvious
  next step, closing the silent-failure gap against Google Docs' own seamless load.

### Launch-polish
- A recent-docs picker backed by a Drive connection. Let the user connect a Google
  account once and pick from recent or searched docs instead of pasting URLs.
  Acceptance: a user adds the doc for their task in two clicks without ever copying
  a URL, matching the "open recent" ease Google and Notion give inside their own
  apps.
- Read the doc's text for the AI. Add a Drive or Docs export read path in `main/`
  that fetches the document body as text for a connected account, and expose it to
  the in-place AI and desk agents. Acceptance: "summarise this doc" and "pull the
  action items out of this doc" work from the command bar, which is the Gemini and
  Notion AI capability brought onto our canvas where it can also see the rest of
  the desk.
- First-class Doc identity in the picker and display name. Give Doc its own picker
  entry, icon, and `widgetDisplayName` treatment so it is a thing a user chooses on
  purpose. Acceptance: a new user can find and add a Doc without knowing it hides
  inside File.

### Post-launch (pull ahead)
- Wire doc content into other widgets. Once the text is readable, a wire from a Doc
  into a Table turns its action items into rows, or a wire into a Page drops a
  summary block. Acceptance: research and briefs flow out of the doc into structured
  widgets on the canvas, something Coda only does inside its own walls and no
  incumbent does across a free-form desk.
- Cross-doc AI search across every doc pinned to a desk. Ask one question and get an
  answer drawn from all the docs on the canvas. Acceptance: the Slite retrieval move,
  but scoped to the user's own desk and running locally over docs they chose to pin.
- Inline comment and suggestion surfacing in the header preview, so the user sees
  that a collaborator left a comment without opening the doc full size. Acceptance:
  collaboration signal reaches the user at a glance, narrowing the gap to editing
  Google Docs natively.

## The unfair advantage

The doc stays in Google, but the desk around it is ours, and that is the one thing
no document tool can copy. Only Haptyx can sit the live, collaboratively edited
Google Doc on the same infinite surface as the timer, the browser tab, the voice
note, and the table for the same task, then run an AI that reads the doc and sees
everything else on the desk at the same time. Google's Gemini reads your Drive and
Gmail, it cannot read the three other widgets you have open on the problem right
now. The second advantage is wiring. Once the doc's text is readable, a ghost-line
wire can carry its action items into a table or its summary into a page, turning a
read-only reference into a source that feeds the rest of the workspace, and all of
the surrounding context never leaves the user's machine.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
