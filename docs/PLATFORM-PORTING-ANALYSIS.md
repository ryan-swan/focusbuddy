# Porting Analysis — Windows app and Cloud browser app

Grounded in the code. Bottom line up front: a Windows build is a few weeks and
low risk. A true cloud browser app is a few months and is really "build the
backend the app never had," with one hard blocker (in-canvas browsing) that is a
strategic decision, not just an engineering one. The good news is the codebase is
unusually well set up for both because of one fact.

## 0. The fact that makes this tractable

Every native capability the UI uses goes through ONE seam: `window.api`, exposed
by the Electron preload, backed by 155 `ipcMain.handle` endpoints in
`src/main/ipc/index.ts` across ~40 namespaces (nodes, widgets, widgetLinks,
snapshots, wires, agents, tables, files, vault, account, ai, …). The React
renderer (react-rnd canvas, SVG wires, Tiptap editors, React Flow, Zustand,
the widgets, the agents UI) is standard web tech and never touches a native API
directly. So both ports reduce to: reimplement `window.api` for a new platform.
That is a defined contract, not a rewrite. There is also already a deployed
server (`focusbuddy-signal` on Fly.io) with accounts, auth, capabilities and
trials, plus two web apps (brochure, admin). The cloud foundation is not zero.

## 1. Where the native power actually lives

The main process is where the platform coupling sits:

- `<webview>` browser widgets (6 files) and agent browser control via
  `webContents` (6 files). Embedding arbitrary third-party sites and driving them.
- `better-sqlite3` local database (the entire data layer).
- Local file storage under `app.getPath('userData')` and the `fb-file://`
  protocol (5 privileged protocol registrations; 18 main files touch the FS).
- `safeStorage` vault and the Anthropic API key (3 files), AI calls made from
  main with the user's own key.
- Mac-specific: `node-mac-haptics`, the `hiddenInset` title bar, native app
  launching and the mirror-mode punch-through window, stream-deck native actions,
  activity tracking (`localApps`, `streamdeckActions`, `activityTracker`,
  `haptics`).

## 2. Windows desktop app

Electron is already cross-platform, so this is mostly packaging plus filling a
few Mac-only gaps. Nothing here is a blocker.

What is involved:
- Build target: add the Windows target to electron-builder (NSIS installer),
  rebuild `better-sqlite3` and any native modules for Windows, set up Windows
  code signing (an EV or OV cert) and auto-update.
- Native-feature gaps: haptics is macOS-only (degrade to the existing audio
  fallback, already present). The mirror-mode local-app punch-through and native
  app launching are macOS approaches; on Windows either reimplement against Win32
  or ship launcher-only mode there. Title bar: Windows uses a normal frame or a
  custom one. Stream-deck native actions (media keys, volume) need Windows
  equivalents.
- Everything else just works: `<webview>`, `safeStorage` (Windows DPAPI),
  SQLite, the agent browser control, files, the whole canvas and widget set.
- QA: a full pass on Windows (webview behaviour, DPI scaling, file paths, the
  installer, auto-update).

Effort: roughly 2 to 5 weeks to a shippable, tested Windows build, the spread
depending on how much of the native app-integration features you want at parity
versus gracefully degraded. Risk: low. It is the same codebase.

Impact on launch: small and parallelisable. It roughly doubles the addressable
market for a fraction of the original build cost. Recommend doing it for launch
or as a fast follow.

Impact on future features: near zero. Mac and Windows share about 95% of the
code; a new feature is built once and tested twice. The only per-feature tax is
the occasional native integration that needs a Windows path.

## 3. Cloud browser app

This is a different shape of project. The UI ports, but the backend has to be
built, and one core feature does not have a clean browser answer.

### 3a. The one hard blocker: in-canvas browsing

The browser widget embeds arbitrary third-party sites in a `<webview>`. A web
page in a browser cannot do this: `X-Frame-Options` and `Content-Security-Policy`
stop Gmail, Notion, Figma, banks, and most real sites from loading in an iframe.
There is no flag that fixes this; it is the security model of the web. The agent
browser control has the same dependency.

Options, each with a real cost:
- Vendor remote-browser SDK (Hyperbeam, Browserbase, Kasm). These exist exactly
  for "an embeddable cloud browser." Fastest path, roughly 3 to 6 weeks to
  integrate, but you pay per concurrent browser-minute, which becomes the app's
  dominant cloud cost and a margin question.
- Build your own headless-browser farm (Playwright streaming pixels or DOM per
  session). Full control, no vendor, but you are now running and scaling a
  fleet of Chrome instances, one per active browser widget per user. Months of
  work plus ongoing ops and the same per-session cost reality.
- Ship cloud without in-canvas browsing. The canvas, agents, tables, pages,
  wires all work; you lose the browser widget and the agent's drive-the-browser
  research in the cloud tier. The agent could still research via server-side
  fetch and a headless browser it drives invisibly (this is actually easier in
  cloud than on desktop), but the user's interactive in-canvas browser is gone.

This choice defines the cloud product. It is a business decision about cost and
positioning, not only engineering.

### 3b. The backend that has to exist (the 155 endpoints)

On desktop these are local SQLite, files, and the user's own AI key. In cloud
each becomes a server concern:
- Data: SQLite to a multi-tenant server database (Postgres), with auth (the
  signal server already does accounts/auth/trials, so this is an extension, not
  a greenfield), per-user isolation, and real-time sync. Today the app is
  single-instance local with no live multi-device sync; cloud forces that to be
  solved.
- Files: `fb-file://` and local storage to object storage (S3-style) with signed
  URLs.
- Secrets and AI: the vault and the Anthropic key move server-side. You either
  proxy AI through your servers (you pay, you rate-limit, you handle abuse) or
  let users store an encrypted key server-side. This is a cost and trust change,
  not just code.
- The `window.api` cloud adapter: a client library implementing the same 155
  methods against the server. This is the bulk of the well-defined work and is
  exactly the kind of thing that goes fast because the contract already exists.

Degrade-or-drop in cloud: native app launcher, haptics, mirror windows, and
stream-deck native actions have no browser equivalent and are simply absent in
the cloud tier.

Effort: roughly 3 to 6 months for cloud WITHOUT in-canvas browsing (the backend,
auth and multi-tenancy, DB and file migration, AI proxy, the cloud `window.api`,
and live sync). Add 3 to 6 weeks if integrating a browser vendor, or 2 to 4
months plus ongoing ops to build the browser farm yourself. Risk: medium-high,
mostly in sync, multi-tenancy, and the browser cost model.

Impact on launch: do not block launch on cloud. It is a Phase 2 bet best made
after the desktop product is validated, because it adds months and an entirely
new cost structure. Trying to ship desktop and cloud together roughly triples the
pre-launch timeline.

Impact on future features: this is the real long-term question. Today a feature
is built once. Desktop plus cloud means any feature that touches a native
capability (browsing, files, AI, local integrations) has two implementations
unless they sit behind one interface. The single most important architectural
move, and it is cheap to do now, is to formalise `window.api` as a platform
interface with two implementations (Electron-native and cloud-server). The seam
already exists; making it an explicit contract means future features target the
interface and are implemented once per platform behind it, rather than forked.
Skip this and the two products drift and every feature costs roughly double.

## 4. Recommended sequencing

1. Now to launch: ship desktop. Add Windows for launch or fast-follow (cheap,
   low risk, doubles reach). Before building much more, formalise the
   `window.api` platform interface so the cloud option stays open at low cost.
2. Post-launch, once the desktop product is validated: decide the cloud browser
   question deliberately. If cloud is strategic, start with the backend (it is
   needed regardless) and choose the browsing model (vendor first to learn the
   cost, build-your-own only if volume justifies it).
3. Treat cloud as a tier, not a replacement. Desktop keeps the full native power
   (in-canvas browser, native integrations); cloud trades some of that for
   anywhere-access. The platform interface lets one codebase serve both.

## 5. One-line answers

- Windows: weeks, low risk, do it. Future features cost ~the same.
- Cloud without in-canvas browsing: months, medium risk, Phase 2, it is "build
  the backend." Future features cost ~double unless you add the platform
  interface now.
- Cloud with in-canvas browsing: the above plus a browser-infra cost center that
  becomes a core margin question. Decide it as a business call, not a ticket.
