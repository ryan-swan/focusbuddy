# PDF, SME doc (master of destiny)

Tier: Sufficient. This widget has to reliably show a PDF in place and let the
user open it for real work, but it does not have to beat Adobe at PDF editing to
clear the bar. It clears the tier when a PDF on the canvas reads cleanly, opens
in one click, and never feels broken.

## The use case

Someone is working on a task and one of the source documents is a PDF: a
contract they are quoting against, a research paper they are pulling notes from,
an invoice, a spec sheet, a manual, a bank statement. They have already got the
notes, the timer, and a couple of browser tabs on the canvas for this task, and
they do not want to bounce out to Preview or Acrobat and lose that context. They
want the PDF sitting right there as one more object on the desk, readable at a
glance, scrollable when they lean in, and openable in their real PDF app the
moment they need to mark it up or fill a form. The moment of use is "this
document belongs to what I'm doing right now, so keep it on the surface with
everything else instead of in a separate window I have to hunt for."

## Current state

There are two paths to a PDF on the canvas today, and they share no rendering
code. A local PDF lives as a `FileWidget`
(`src/renderer/src/components/widgets/FileWidget.tsx`), and a remote PDF URL
lives as the `pdf` widget kind, which is just a `WebViewWidget`
(`src/renderer/src/components/widgets/WebViewWidget.tsx`) grouped with the other
web kinds in `Canvas.tsx` (see the `webview`/`pdf`/`gdoc` case around line 181).

For a local file, the kind is decided by `fileKindFromMime` in
`src/shared/fields.ts`, where `application/pdf` or a `.pdf` extension resolves to
the `'pdf'` `FileKind` (line 329). `FileWidget`'s `FileRenderer` then renders an
`<iframe>` pointed at `fb-file://<id>#toolbar=1&navpanes=1&view=FitH` (line 342).
The comment in the file is honest about why it is an iframe and not an `<object>`:
Chromium only exposes its built-in PDF toolbar, including page navigation, when
the PDF is loaded as a top-level frame document. The bytes are served by the
`fb-file://` custom protocol handler registered in `src/main/index.ts`
(`protocol.handle('fb-file', ...)` around line 313), which resolves the file id
to the on-disk path. Ingestion happens through `src/main/db/files.ts`
(`ingestFromBuffer` / `ingestFromPath`), and files are immutable once ingested.

What works today:
- Drop a PDF on a File widget, or paste a PDF URL, and it renders inline. Local
  PDFs get the full Chromium PDF viewer with its scroll, zoom, and page-jump
  toolbar, all inside the widget.
- It is a first-class canvas object: resizable, wireable with ghost-line links,
  movable into sections, and right-clickable into the connected-tool menu.
- One click into the real app. The File widget exposes "open in default app" for
  local files, so the PDF hands off to Preview or Acrobat for anything serious.
- QuickLook thumbnails exist for generic files (`src/main/filePreviews.ts`),
  though PDFs render live rather than as a thumbnail.

Rough edges, and they are real:
- The AI cannot read the PDF. There is no text extraction anywhere in the
  codebase. `canvasSnapshot.ts` (the `pdf` case around line 60) and
  `widgetContentFormat.ts` only ever see the file id or the URL string, never the
  document text, so a desk agent has no idea what the PDF actually says. This is
  the single biggest gap given that in-place AI is our whole pitch.
- No annotation, highlight, or markup of any kind inside the widget. You read it,
  then you leave to mark it up elsewhere.
- No search within the document beyond whatever the embedded Chromium toolbar
  offers, and that toolbar is inconsistent and minimal.
- No page thumbnails, no outline/bookmark sidebar, no "jump to page 14" from
  outside the iframe.
- The local and URL paths diverge, so behaviour differs depending on how the PDF
  got onto the canvas. The `pdf` kind is hidden from the picker
  (`hideFromPicker: true` in `widgetCatalog.ts`) and folded into File, but old
  `pdf`-kind widgets still render through the webview path.
- No form filling and no signing in place. Both require the round-trip to a real
  app.

## Best-of-breed landscape

Adobe Acrobat is the industry standard and the thing every PDF feature is
measured against. It owns creation, editing, reviewing, security, form filling,
and signing, and its newer AI Assistant lets you chat with a document and, when
it answers, highlights the exact source passage in the PDF that backs the claim.
That source-attribution-back-to-the-page behaviour is the bar for trustworthy PDF
AI, and we have none of it.

Foxit and PDF-XChange and Nitro own the "Acrobat power at a lower price, lighter
on the machine" middle ground. Foxit in particular ships a genuinely free reader
with a full annotation toolset, highlights, notes, drawings, stamps, form
filling, basic signing, and decent OCR, which is roughly the floor a user expects
the moment they think "I want to mark this up."

ChatPDF, AskYourPDF, Humata, and Paperguide own the pure "talk to my PDF" job.
The simplest of them let you upload a file, ask a question in plain language, and
get an answer with page citations and no account. For research-heavy users,
Paperguide layers literature review and citation-backed answers across a huge
paper corpus. These tools are the reason a user now expects to be able to ask a
question of any document and get a grounded answer.

LiquidText and MarginNote are the closest philosophical neighbours and the most
interesting ones for us. LiquidText puts documents, highlights, and notes into a
single workspace on an infinite canvas and lets you draw live connecting lines
between any excerpt and any note, with each card carrying a backlink to its
source passage. That is canvas plus PDF plus linking, which is most of what we
claim to be, except they do it inside a dedicated PDF study tool rather than next
to your timer and browser tabs and table.

What we already do better, or uniquely could: the PDF is one object on an
infinite canvas next to the live browser tab, the voice note, the task table, and
the timer for the same piece of work, instead of being trapped in a single-purpose
reader window. It can be wired with ghost lines to other widgets and to desk
agents. The bytes never leave the machine, served over a local custom protocol,
so a sensitive contract or bank statement is read entirely on-device with nothing
uploaded to a cloud PDF service. No incumbent has the canvas plus local-first plus
in-place-AI combination, and that is exactly the combination LiquidText proves
people want.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **The AI is blind to the document (Adobe AI Assistant, ChatPDF, Humata).**
   "Summarise this contract" or "what does clause 7 say about termination" does
   nothing useful, because no text ever reaches the model. The user moment is
   sitting next to a 30-page PDF and asking a desk agent about it, then getting an
   answer that ignores the actual content. This is the most damaging gap because
   in-place AI is our headline and it is absent precisely where it would shine.
2. **No annotation, highlight, or markup in place (Foxit, PDF Expert, LiquidText).**
   "Highlight the three numbers I care about and leave a note" forces a trip to
   another app. For a "Sufficient" tier we can survive on the open-in-real-app
   handoff, but the absence is felt immediately by anyone reading to extract.
3. **No grounded source citation back to a page (Adobe AI Assistant).** Even once
   the AI can read the PDF, the trust feature is "click the answer, see the page
   it came from." Without it the AI answer is unverifiable, which for contracts
   and statements is a dealbreaker.
4. **Divergent local vs URL rendering (no competitor, this is our own debt).** A
   PDF behaves differently depending on whether it was dropped or pasted, which
   makes the widget feel inconsistent. The user moment is pasting a PDF link and
   getting a different, worse experience than dropping the same file.
5. **No in-widget search, outline, or page navigation from outside the iframe
   (Acrobat, Foxit, every reader).** "Jump to the signature page" relies entirely
   on the embedded Chromium toolbar, which is minimal and sometimes missing on the
   webview path.
6. **No form fill or signing (Acrobat, Foxit).** "Fill this PDF form and sign it"
   is out of scope for the tier, but it is the reason a user eventually leaves for
   Acrobat, so it is worth naming as a known ceiling.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")
- **Unify the local and URL render paths.** Both a dropped PDF and a pasted PDF
  URL should render through the same component with the same toolbar, zoom, and
  scroll behaviour. Retire the `pdf`-kind webview path for documents and route
  everything through the File widget's PDF renderer, with the URL case fetched and
  shown the same way. Acceptance: dropping a PDF and pasting the same PDF as a URL
  produce a pixel-identical reading experience, and we no longer have two PDF code
  paths that drift.
- **Reliable in-widget reading.** Guarantee the embedded viewer shows scroll,
  zoom, and page count on every PDF regardless of source, and that resizing the
  widget reflows the fit. Acceptance: a 40-page PDF scrolls smoothly, the page
  indicator is always present, and "fit width" actually fits after a resize, which
  is the floor Foxit's free reader clears.
- **One-click open in the real app from both paths.** The handoff to Preview or
  Acrobat must work for a pasted PDF URL as well as a dropped file. Acceptance: a
  user can always escape to their real PDF app in one click no matter how the PDF
  arrived.

### Launch-polish
- **PDF text extraction feeding the AI.** Extract text on ingest (a local,
  on-device PDF parser, no upload) and store it so `canvasSnapshot.ts` and the
  desk-agent context can see the document content. Acceptance: a desk agent wired
  to a PDF answers "summarise this" and "what is the total on the invoice"
  correctly, which is the ChatPDF baseline, done locally.
- **In-widget find.** A search box over the extracted text that scrolls the viewer
  to the hit and highlights it. Acceptance: "find every mention of indemnity"
  jumps through matches, matching what every reader offers.
- **Page thumbnails and outline sidebar.** A collapsible strip of page thumbnails
  and the PDF's own bookmark outline for navigation. Acceptance: "jump to the
  signature page" is one click from outside the document body.

### Post-launch (pull ahead)
- **Grounded AI with source-passage highlight.** When a desk agent answers a
  question about the PDF, it cites the page and, on click, scrolls the widget to
  the passage and highlights it, the Adobe AI Assistant trust feature, done
  on-device. Acceptance: every AI claim about a PDF is one click from the exact
  sentence that backs it, and nothing left the machine to make that happen.
- **Wire-driven excerpting.** Drag a passage out of the PDF and it lands as a note
  or a row in a table, with a ghost-line backlink to the source page, the
  LiquidText move, but feeding our other widgets. Acceptance: an excerpt becomes a
  first-class note that links back to page N of the source PDF.
- **In-place highlight and annotation layer.** A lightweight markup layer stored
  alongside the file so the user can highlight and comment without leaving, with
  the real app still available for heavy editing. Acceptance: a user can read,
  highlight three clauses, and leave a margin note without ever opening Acrobat.
- **Form fill and field detection.** Detect form fields and let the user fill them
  in place, deferring signing to the real app. Acceptance: a simple PDF form is
  fillable on the canvas, closing the most common reason people leave for Acrobat.

## The unfair advantage

Only Haptyx can put a real, scrollable PDF on the same surface as the live
browser tab, the voice note, the task table, and the timer for the same piece of
work, let a desk agent read that PDF and answer questions about it with the bytes
never leaving the machine, and wire excerpts out of the document into notes and
tables with ghost-line backlinks to the source page. LiquidText proves people
want PDF plus canvas plus linking, but it lives in a sealed study app. Adobe
proves people want to ask a PDF questions and see the source, but it sends the
document to the cloud. We are the only one that does both on an infinite work
canvas and keeps everything local. The plan above first makes the reading solid,
then makes the AI actually see the document, and that on-device grounded reading
is the thing no cloud PDF service can match on privacy and no local reader can
match on canvas context.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
