# Browser, SME doc (master of destiny)

Tier: Hero. People judge a workspace on whether its embedded browser feels like a
real browser, so this widget has to load real sites, hold a login, and behave
under the canvas's pan/zoom without feeling like a crippled iframe.

## The use case

Someone is doing a task that lives half on the web and half on their desk. They
are reading a docs page while taking notes, watching a dashboard while a timer
runs, comparing two SaaS pricing pages side by side, or working inside a web app
they have logged into. They do not want to alt-tab into Chrome and lose the
notes, the table, and the timer that are already arranged around this task. They
want the live page sitting on the canvas as one more object they can place,
resize, wire, and hand to an AI. The moment of use is "the web is part of this
task, so the page should be here on the desk with everything else, not in a
separate application I have to keep switching back to."

## Current state

Rendered by `src/renderer/src/components/widgets/WebViewWidget.tsx` on top of an
Electron `<webview>` tag, with the cross-process plumbing in
`src/main/popupRouter.ts` (popup + target=_blank routing), the live-page reader
in `src/renderer/src/lib/webviewRegistry.ts`, agent browser control in
`src/main/ai/agentBrowser.ts`, and credential auto-fill in
`src/renderer/src/lib/vaultAutofill.ts`. The catalog entry is in
`src/renderer/src/lib/widgetCatalog.ts`.

What works today:
- A real Chromium page on the canvas. Back, forward, reload, stop, and an
  editable URL bar are wired to the webview's imperative navigation API, with
  back/forward enabled state re-queried after every navigation.
- Navigation persistence. The widget writes the post-navigation URL back to
  `widget.content` so reopening, or expanding into focus mode, returns to where
  you actually were rather than the URL you first typed. The src binding is
  deliberately decoupled from `widget.content` to avoid a reload loop, which is
  the single trickiest piece of this component.
- Sessions and login. Each widget loads in a session partition, and a widget
  dragged from or pinned to a Connected App shares that app's partition
  (`persist:connectedapp-<id>`), so a logged-in app stays logged in across
  widgets.
- Vault auto-fill with a hard origin gate. When a widget is bound to a Connected
  App with an autofill entry, `vaultAutofill.ts` injects credentials once per
  load, but only after checking the live host matches the bound host, both in the
  main world and again inside the page. It fails closed.
- OAuth and popups survive. The main process owns `setWindowOpenHandler` so real
  `window.open`/new-window popups open as native windows sharing the session,
  while plain target=_blank link clicks are forwarded over IPC and spawned as a
  new browser widget on the canvas next to the source.
- Agent and wire reading. `webviewRegistry.extractWebviewText` and
  `agentBrowser.ts` let a wired desk agent read the live, authenticated,
  post-JavaScript text of the page, open a URL, or run a search against the real
  webview, which is far better than a blind server-side fetch.
- Canvas manners. While zoomed out the widget shows a click-to-interact overlay
  so scrolling pans the world, a click activates the page in place without
  yanking the camera, and Cmd/Ctrl-click dives to 100% centred on it. Right-click
  on the chrome (not the page) opens the create-and-connect menu seeded with the
  URL. There are five stored viewport presets (Mobile through Desktop) that snap
  the widget to a device size.

Rough edges (honest):
- One page per widget. There are no tabs and no split inside a single browser.
  Multiple pages means multiple widgets, which is the canvas-native answer but is
  not what someone arrives expecting from "a browser".
- No find-in-page, no page zoom (text scaling), and no audio mute. These are
  table stakes for a browser and we do not have them yet.
- No history view, bookmarks, or reading list surfaced in the widget. We record
  navigation into history and the task trail, but the user cannot browse it from
  here.
- No reader mode, no ad or tracker blocking, no download UI. A `will-download`
  has nowhere to go today.
- No in-place AI on the page itself. The page text is readable by a wired agent,
  but there is no "summarize this", "answer from this page", or highlight-to-ask
  built into the widget the way the AI browsers ship it.
- Performance and memory at scale are unproven. Several heavy live webviews on one
  canvas is a real cost and there is no throttling or suspend-when-offscreen.

## Best-of-breed landscape

Arc set the modern bar with Spaces and Split View, up to four tabs side by side
in one window with a saveable layout, but Arc went into maintenance in 2025 and
is no longer adding features, so it is the design reference rather than the moving
target. Dia, from the same team, is now the AI-native successor and wins on a
fast Chromium core, an assistant that references your own history with @history,
and reusable /skill prompts from a marketplace. Perplexity's Comet and OpenAI's
Atlas push agentic browsing, an assistant that reads and acts on whatever is on
screen, summarizes inboxes, watches terms-of-service changes, and pulls details
across tabs, with Comet and Atlas going further into agent mode that actually
drives the browser for you. SigmaOS rethinks tabs as to-do items inside vertical
workspaces with a Cmd-Right split view, and Workona does the workspace idea as a
Chrome extension. The closest neighbour to us is Kosmik, a Paris-built spatial
canvas with a Chromium browser living directly on the board, where you navigate
to any site and drag images, text, or whole URLs off the page onto the canvas,
and it AI-tags what you collect. Chrome itself closed much of the gap in early
2026 by shipping native split view, so "two pages side by side" is no longer a
differentiator on its own.

What we already do better or uniquely could. Our browser is one object on an
infinite canvas next to the notes, table, and timer for the same task, not a tab
in a separate application. A wired desk agent can read the live, logged-in page
and act on it, which is the agentic-browser idea but pointed at a specific page
the user placed deliberately. The page can be wired to other widgets so its
content flows into a note or a table. Sessions and vault auto-fill are local and
fail closed. No incumbent has the canvas plus in-place wiring plus local-first
session-and-vault combination. Kosmik is the only one with a browser on a canvas
at all, and it has no agent that drives the page and no credential vault.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No in-place page AI (Comet, Atlas, Dia).** "Summarize this page", "answer
   this from what is on screen", or highlight a paragraph and ask about it. The
   plumbing exists, an agent can already read the live page, but the user cannot
   trigger it from the widget. This is the headline thing modern browsers now do
   and the most visible miss.
2. **No find-in-page (every browser, Chrome, Arc, Dia).** "Where on this long
   page does it mention the price." Cmd-F is muscle memory and its absence makes
   the widget feel like a toy rather than a browser.
3. **No page zoom or audio mute (every browser).** "This text is tiny" or "this
   embedded video is blasting audio and I cannot find it." Both are one-line
   webview calls and both are expected.
4. **No tabs or in-widget split (Arc, SigmaOS, Chrome).** "I want two pricing
   pages side by side without arranging two widgets." Our canvas answer is two
   widgets, but for a quick A/B the in-widget split is what people reach for.
5. **No reader mode or ad/tracker blocking (Arc, Dia, Brave-class).** "This
   article is buried in pop-ups and cookie walls." A clean reading surface and
   basic blocking change how usable real sites are on the canvas.
6. **No history/bookmark surface in the widget (Dia @history, Arc).** "Take me
   back to that page I had open yesterday for this task." We record it but do not
   let the user reach it from here.
7. **No drag-content-off-the-page (Kosmik).** "Drag this image or this quote off
   the page straight onto the canvas." The most canvas-native browser feature
   there is, and the one place a direct competitor clearly beats us.

## The supersonic plan

### Launch-blocking (must ship to clear "Hero")
- **Find-in-page.** A Cmd-F bar over the webview using `findInPage`/
  `stopFindInPage` with match count and next/previous. Acceptance: Cmd-F on a
  long page highlights matches and cycles through them, parity with Chrome and
  Arc on the one shortcut every user expects.
- **Page zoom and audio mute in the toolbar.** Wire `setZoomFactor` (with a
  reset) and `setAudioMuted` into two toolbar controls, mute reflecting the
  webview's audio state. Acceptance: a user scales tiny text up and silences a
  background video without leaving the widget, parity with every real browser.
- **In-place page AI.** A widget action and a highlight-to-ask affordance that
  feeds the live page text (already exposed via `extractWebviewText`) to the
  model and shows the answer, with an option to drop it into a connected note.
  Acceptance: "summarize this page" returns a grounded answer from the page on
  screen, matching the core Comet/Dia assistant move on a page the user chose.

### Launch-polish
- **Reader mode.** A toggle that strips the page to readable article content
  (Readability-style extraction injected into the webview) for long-form pages.
  Acceptance: a cluttered article renders as clean text on demand, matching Arc
  and Dia reader on the article case.
- **In-widget split.** An optional second pane inside one browser widget so two
  URLs sit side by side, sharing the widget frame. Acceptance: a user compares
  two pages in one widget with a draggable divider, matching Arc/SigmaOS split
  for the quick A/B without spawning a second widget.
- **History and bookmark surface.** Reuse the recorded navigation history and
  task trail to show "recent pages for this task" plus a per-widget bookmark,
  reachable from the toolbar. Acceptance: a user reopens a page from this task's
  history without retyping the URL, matching Dia's @history for the local case.
- **Download handling.** Catch `will-download`, route the file into the File
  widget or the task's files, and show progress. Acceptance: clicking a download
  link lands the file on the canvas instead of failing silently.

### Post-launch (pull ahead)
- **Drag content off the page onto the canvas.** Drag an image, a selected
  quote, or a link out of the webview and have it land as the right widget
  (image, note, browser). Acceptance: dragging an image off a page creates an
  image widget where it dropped, matching and then beating Kosmik because the
  result is a fully wireable canvas object.
- **Wire the page into other widgets.** A live wire from a browser into a table
  or note so the page's extracted content streams in as rows or text, building on
  the existing wire reader. Acceptance: a wire from a search-results page fills a
  connected table with rows, something no incumbent can do because they have no
  canvas wiring.
- **Agent-driven page actions on the canvas.** Extend `agentBrowser.ts` beyond
  read/open/search toward clicking and form-filling on the wired page under user
  confirmation. Acceptance: a desk agent completes a simple on-page task on a
  browser the user placed, the agentic-browser promise scoped to a deliberate
  page rather than the whole session.
- **Offscreen suspend and throttle.** Suspend or downthrottle webviews far
  outside the viewport and resume on approach. Acceptance: ten browser widgets on
  one canvas stay responsive, removing the scale risk that no competitor has to
  solve because they do not put many live pages on one surface.

## The unfair advantage

Only Haptyx puts a real, logged-in browser on the same surface as the notes, the
table, and the timer for one task, lets a wired desk agent read and act on that
exact page, lets the page's content flow over a wire into other widgets, and
keeps the session and the saved credentials local and failing closed. The AI
browsers act on a tab in a separate app, and Kosmik has a canvas browser but no
agent driving the page and no vault. Once the launch tier closes the basic
browser gaps, our edge is structural rather than cosmetic, because the page is a
first-class canvas object an agent and other widgets can reach, not a tab the
user has to keep switching back to.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
