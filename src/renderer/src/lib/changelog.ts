// PlexiDesk changelog — newest first.
// Add a new entry every time a meaningful feature ships. Keep dates absolute (ISO).
// The footer's "What's new" button shows an indicator dot when the most recent
// entry's date is newer than the user's last-seen timestamp (localStorage).
//
// RELEASE DISCIPLINE: every release must add/refresh the top entry and set its
// `version` to the new package.json version. The release gate
// (scripts/verify-release-assets.sh) FAILS if the newest entry's `version` does
// not match the released version, so an out-of-date What's New blocks the
// release. The first-run "What's new in vX.Y.Z" modal reads the entry whose
// `version` equals the running app version.

// Base for per-feature support articles on the brochure help centre. Single
// source of truth lives in siteUrls.ts; re-exported here for the entries below.
import { HELP_BASE } from './siteUrls'
export { HELP_BASE }

export interface ChangelogLink {
  label: string
  href: string // a haptyx.app/help/<slug> support page (opened in the browser)
}

export interface ChangelogEntry {
  date: string // ISO yyyy-mm-dd (or full ISO datetime)
  title: string
  highlights: string[]
  tag?: 'feature' | 'polish' | 'fix' | 'design'
  // Set on every shipped release so the first-run modal can match the running
  // app version. Older historical entries may omit it.
  version?: string
  // One short paragraph shown at the top of the first-run modal. Plain prose.
  summary?: string
  // "Learn more" support links shown in the modal and the What's New panel.
  links?: ChangelogLink[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.5.48',
    date: '2026-06-18T20:00:00Z',
    title: 'v2.5.48 — Lists that work, one Styles menu, and Google Fonts',
    tag: 'feature',
    summary:
      'Bulleted and numbered lists now render properly in documents, document styles live in one clear menu, and you can choose from the full Google Fonts library across documents, spreadsheets and slides.',
    highlights: [
      'Fixed bulleted and numbered lists in documents, which were not showing their markers or indentation. Headings, quotes and code blocks also render correctly now.',
      'One Styles menu in the document toolbar: apply Normal text, Title, Headings, bulleted / numbered / checklist, quote, code or a hyperlink, and customise each heading level in the same place.',
      'A searchable Google Fonts picker in documents, spreadsheets (per cell) and slides, with fonts loaded on demand.',
      'Slides: turn a text box into a bulleted or numbered list. Documents, spreadsheets and slides placed on a canvas now keep their own right-click menus.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.47',
    date: '2026-06-18T18:00:00Z',
    title: 'v2.5.47 — Heading styles you can actually control',
    tag: 'feature',
    summary:
      'A clear Styles panel for documents. Define what each heading level looks like in one place, and every heading of that level follows.',
    highlights: [
      'A new Styles button in the document toolbar opens a panel with Normal text and Heading 1, 2 and 3. Click a name to apply it, and set its bold, italic, size and colour right there.',
      'Change a level once, for example Heading 2 to bold blue at 18, and every Heading 2 in the document updates to match. The level style now wins even on headings you had already tweaked by hand.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.46',
    date: '2026-06-18T16:00:00Z',
    title: 'v2.5.46 — Documents on the canvas, better sheets and headings',
    tag: 'feature',
    summary:
      'Documents, spreadsheets and slides can now live right on a canvas, spreadsheets got real formula fixes, and headings can be styled once and applied everywhere.',
    highlights: [
      'Put a document, spreadsheet or slide deck on any canvas as a native widget. Adding one lets you create a new one, import a real Word/Excel/PowerPoint file with its formatting and formulas kept, or place an existing one. The same file opens both on the canvas and in the Documents view.',
      'Spreadsheets: fixed a bug where the first keystroke in a cell was doubled, which also quietly broke formulas. Formulas now work as you expect, type = and go. Select the whole sheet with Cmd/Ctrl+A to format every cell at once, and right-click a column header to insert or delete columns.',
      'Documents: set a heading style once, for example Heading 2 at a certain size and colour, and every Heading 2 in the document updates to match.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.45',
    date: '2026-06-18T10:00:00Z',
    title: 'v2.5.45 — Documents reliability fix',
    tag: 'fix',
    summary:
      'A packaging fix for the new Office editors. The 2.5.44 build could fail to start on some installs because a document-export library was missing a dependency; that library now loads only when you actually export, so the app always starts, and the export dependency ships correctly.',
    highlights: [
      'Fixed an app-start crash introduced with the new Word/Excel/PowerPoint editors.',
      'Document, spreadsheet and slide export libraries now load on demand, so an export problem can never stop the app from opening.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.44',
    date: '2026-06-18T08:00:00Z',
    title: 'v2.5.44 — Documents, drastically upgraded',
    tag: 'feature',
    summary:
      'The document, spreadsheet and slide editors grew up. Each is now a real, fully formatted editor with AI that inserts formatted content, and you can open and save genuine Word, Excel and PowerPoint files.',
    highlights: [
      'Documents are now Word-class: headings, colour, highlight, fonts and sizes, alignment, lists, links, images, tables, code blocks, find and replace, a selection menu and a slash menu. Ask AI drafts formatted content at your cursor and can rewrite a selection. Open .docx files and export to .docx or PDF.',
      'Spreadsheets are now Excel-class: cell formatting and number formats, multi-cell selection, copy and paste with real Excel, undo, sort, charts, multiple sheets, and a much bigger formula library (IF, COUNTIF, SUMIF, text functions and more) that still shows a clear #ERR instead of a wrong number. Import and export .xlsx and .csv, and let AI fill a range.',
      'Slides are now PowerPoint-class: a free canvas with movable text boxes, images and shapes, deck themes and layouts, a presenter view with notes and a timer, and AI that builds or redesigns a deck. Export to .pptx or PDF.',
      'Everything you already made still opens unchanged. Office file round-trips are best-effort, not pixel-perfect, and we say so in the app.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.43',
    date: '2026-06-17T00:30:00Z',
    title: 'v2.5.43 — Documents: create with AI, then make it yours',
    tag: 'feature',
    summary:
      'PlexiDesk now makes documents, spreadsheets and slides, and AI is how you start. Describe what you want and who it is for, and you get a real first draft already open for editing. No blank page to stare at.',
    highlights: [
      'Create with AI: in the new Documents area, pick a document, spreadsheet or deck, say what it is about and who it is for, and get a finished first draft you can edit straight away.',
      'A real editor for each: rich-text documents with formatting and an inline Ask AI, spreadsheets with live formulas (=SUM, =AVERAGE, cell references and ranges, with a clear #ERR rather than a wrong number), and slide decks with a present mode.',
      'Everything autosaves and lives in your workspace next to your tasks. Turn any of it into work, and start blank whenever you prefer the empty page.',
      'This is the first step of making AI the way you start, continue and finish work, not a bolt-on. More inline AI for sheets and slides, and sharing, are coming next.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.42',
    date: '2026-06-16T23:30:00Z',
    title: 'v2.5.42 — Your email, inside your workspace',
    tag: 'feature',
    summary:
      'PlexiDesk now has Mail. Connect any email account over IMAP and read your inbox right next to your work. No Google or Microsoft sign-in to set up; just your address and an app password, and your mail stays on your machine.',
    highlights: [
      'Connect in a minute: pick Gmail, Outlook, iCloud, Fastmail or Yahoo and the server settings fill in for you, or enter any IMAP host yourself. Your password is encrypted on this device with your OS keychain and never leaves it.',
      'A real inbox: read your messages in a clean two-pane view, with unread mail also flowing into the unified Inbox alongside your PlexiDesk messages and shared items.',
      'Turn an email into work: one click makes any message a task in All Tasks, with the sender and a snippet already filled in.',
      'This is plain IMAP for now. Connecting Gmail and Outlook with one-click sign-in is coming later; today it works with the app password those providers give you.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.41',
    date: '2026-06-16T22:30:00Z',
    title: 'v2.5.41 — Add people by email, and chat with anyone you share with',
    tag: 'feature',
    summary:
      'Connecting on PlexiDesk is now easy. Add someone by their email address, and chat appears with everyone you share a folder or task with once they accept.',
    highlights: [
      'Add by email: in Messages, enter an email instead of a handle. If they already use PlexiDesk it arrives as a request to accept in their inbox; if they don\'t, they get an invite to join, and once they sign up your request is waiting for them.',
      'Share, then chat: anyone you share a folder or task with shows up in your chat list after they accept, plus a shared conversation around that item so you can collaborate on it.',
      'Accept or decline contact requests right from your Inbox, and a direct message opens as soon as you accept.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.40',
    date: '2026-06-16T20:00:00Z',
    title: 'v2.5.40 — Messages and a unified Inbox',
    tag: 'feature',
    summary:
      'PlexiDesk can now talk to other people. Sign in and message anyone by their handle, share a folder or task into a conversation to work on it together, and see everything that needs you — messages and shared items — in one Inbox.',
    highlights: [
      'Messages: find someone by @handle and start a direct message. Conversations sync in real time and keep their history, so you can pick up where you left off.',
      'Shared-space chat: when you accept a shared folder or task, everyone on it gets a conversation around it, so collaborating has a place to happen.',
      'Unified Inbox: a single feed of your messages and shared items, with unread counts in the sidebar. Email will join this same Inbox once you connect Gmail or Outlook.',
      'You need to be signed in to use messaging; everything else in PlexiDesk still works fully offline.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.39',
    date: '2026-06-16T16:00:00Z',
    title: 'v2.5.39 — Say hello to PlexiDesk',
    tag: 'feature',
    summary:
      'The app has a new name: PlexiDesk. Same product, same data, nothing for you to do. This release also makes the built-in browser work with far more sites, and lets you drag tasks straight onto the calendar.',
    highlights: [
      'New name, your data intact: FocusBuddy / Haptyx is now PlexiDesk. Your existing tasks, vault and settings carry over exactly as they were, and updates keep working as normal.',
      'The browser handles more of the web: it runs on a much newer engine, so you hit far fewer "verify you are human" checks, and menus that open a new tab — like Google Docs "open a file" — now work instead of doing nothing.',
      'Plan your day on the calendar: drag any task or folder onto the Week view to book time for it, and jump straight back to the task or folder from its calendar block.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.38',
    date: '2026-06-16T09:00:00Z',
    title: 'v2.5.38 — Book time to focus, and a warmer first run',
    tag: 'feature',
    summary:
      'The calendar can now run your day. Switch it to Week and book stretches of time to focus, tied to your tasks. New installs also get a short welcome that helps you connect AI and start with something on the canvas instead of a blank screen.',
    highlights: [
      'Calendar time-blocking: a new Week view with an hour grid. Click a slot to book a block, attach it to a task or leave it as focus time, drag to reschedule, drag the edge to change its length, and press the bolt to start a focus session for that block.',
      'First-run welcome: a brand-new install now gets a short, skippable setup — connect your AI key (with a one-tap test that it works) and optionally start with a small example workspace so the canvas isn’t empty.',
      'This is the groundwork for connecting your real calendar and email next, so PlexiDesk becomes the one place your day runs from.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.37',
    date: '2026-06-15T23:45:00Z',
    title: 'v2.5.37 — Back up your work, and change your vault password',
    tag: 'feature',
    summary:
      'Two pieces of peace of mind. You can now export a portable backup of everything and restore it later or on another machine, and the app quietly keeps automatic snapshots. The vault also gains a way to change your master password.',
    highlights: [
      'Backup and restore: export a single portable snapshot of all your work from Settings, and restore it later or on another machine. The app also keeps automatic snapshots in the background and rotates the last seven, so a mishap is recoverable.',
      'Restoring is careful: it snapshots your current data first, so even a restore you regret can be undone, and it asks before replacing anything.',
      'Vault: change your master password whenever you like. Every stored entry is safely re-encrypted under the new password in one step.',
      'A note on keys: API keys live in your system keychain, not in the backup file, so re-enter them after restoring on a new machine.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.36',
    date: '2026-06-15T23:30:00Z',
    title: 'v2.5.36 — The AI command bar understands you again',
    tag: 'fix',
    summary:
      'The "Ask AI" command bar was quietly sending your request down the wrong path, so it often missed your intent and fell back to a generic answer. It now classifies what you asked for reliably and routes you to the right build.',
    highlights: [
      'Typing a request into the command bar now correctly recognises whether you want a whole workspace, a few objects added to the current task, or a plain answer, instead of degrading to a generic reply.',
      'The classification runs on a fast, low-cost model so the command bar responds quickly.',
      'No change to how you use it: open with the header button, the canvas Ask AI button, or Cmd+Shift+K, type what you want, and confirm what it proposes.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.35',
    date: '2026-06-15T22:00:00Z',
    title: 'v2.5.35 — Gemstone theme, and clearer updates',
    tag: 'design',
    summary:
      'A new Gemstone theme inspired by emerald, ruby, sapphire, onyx and diamond. An onyx-black room with faceted glass, a soft drifting sparkle and prismatic light along every edge, all re-tinting to your chosen accent. This release also makes update problems explain themselves instead of failing silently.',
    highlights: [
      'Gemstone joins the base themes in the Theme studio: deep onyx ground, faceted surfaces, a whisper-soft sparkle and travelling spectral refraction on the header, sidebar and every widget.',
      'Two new gem accents, Ruby and Sapphire, sit beside Emerald. Gemstone re-tints its glow and refraction to whichever accent you pick, so the room recolours without changing shape.',
      'When an update cannot complete it now shows the real reason on screen rather than a bare failure, and always offers a one-click manual download so you are never stuck retrying the same error.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.34',
    date: '2026-06-15T20:00:00Z',
    title: 'v2.5.34 — More widgets grow to fit their content',
    tag: 'feature',
    summary:
      'Continuing the auto-sizing work, field widgets and task links now grow to fit their content too, alongside stickies and cards. The widgets that genuinely manage their own size keep doing so on purpose.',
    highlights: [
      'Field widgets and task links join stickies and cards in growing to fit their content rather than hiding it behind a scrollbar.',
      'The widgets that should keep a fixed size and scroll or pan are left that way deliberately: long-form notes, pages and markdown, the browser and embedded documents, media, tables, mind maps, diagrams and the agent chat.',
      'All of this runs on the one shared sizing mechanism, so a widget either grows consistently or keeps its own size — never a different behaviour in different places.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.33',
    date: '2026-06-15T18:00:00Z',
    title: 'v2.5.33 — Widgets grow to fit their content',
    tag: 'feature',
    summary:
      'Widgets now size themselves to their content instead of hiding it behind a scrollbar. This release turns it on for stickies and cards, built on a shared mechanism the other content widgets will adopt next. Long-form text (notes, pages, markdown) and the browser keep a fixed size and scroll, as before.',
    highlights: [
      'Stickies and cards grow taller as you add content and shrink back as you remove it, so you are not constantly resizing them by hand.',
      'Built on one shared sizing mechanism in the widget frame, so the remaining content widgets can adopt it consistently rather than each behaving differently.',
      'Notes, pages and markdown keep a fixed size and scroll their content, and browsers keep their chosen viewport — these are deliberately not auto-grown.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.32',
    date: '2026-06-15T14:00:00Z',
    title: 'v2.5.32 — Menu, camera and browser fixes',
    tag: 'fix',
    summary:
      'A batch of interaction fixes: right-click menus now close when you click away and no longer stack copies, clicking a widget no longer makes the canvas drift, double-clicking centres it again, and new browsers open at a sensible laptop size.',
    highlights: [
      'Right-click menus close when you click elsewhere, instead of needing the Esc key, and a second right-click repositions the one menu rather than stacking duplicates.',
      'Clicking a widget no longer shifts the canvas under you. To centre on a widget, double-click it; for a browser, double-click its title bar.',
      'New browser widgets open at laptop size (1366 × 768) so sites show their full desktop layout instead of a cramped mobile one. You can still snap to other sizes from the browser\'s size menu.',
      'Note, page and markdown widgets keep a fixed size and scroll when their content runs long.'
    ],
    links: [{ label: 'Right-click menus', href: `${HELP_BASE}/right-click-menus` }]
  },
  {
    version: '2.5.31',
    date: '2026-06-15T09:00:00Z',
    title: 'v2.5.31 — Set up with AI on empty widgets',
    tag: 'feature',
    summary:
      'Every empty widget now offers to set itself up. Drop a page, a browser, a sticky or a mind map and a quiet "Set up with AI" appears on it; click it and PlexiDesk proposes what that widget should become based on the task you are working on, for you to approve. This is the first step of a system that will cover every widget kind.',
    highlights: [
      'A "Set up with AI" prompt appears on an empty widget and disappears the moment it has real content.',
      'It is task-aware: it reads what you are working on and the other objects on your desk to propose something genuinely useful, which you approve before anything is written.',
      'Empty pages get a drafted document outline, and empty browsers get the most useful address to open. Empty stickies, notes, cards, mind maps and diagrams get their existing AI draft, now reachable without the right-click menu.',
      'Built on one shared setup framework so the remaining widget kinds (tables, sections and more) can join it next.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.30',
    date: '2026-06-14T23:30:00Z',
    title: 'v2.5.30 — One "Ask AI"',
    tag: 'design',
    summary:
      'There is now a single "Ask AI" everywhere — the header, the canvas toolbar, and Cmd+Shift+K all open the same command bar. Describing what you want now builds it on your desk in one flow, instead of preparing objects and then asking you to open a separate builder.',
    highlights: [
      'The canvas "Build with AI" button is now "Ask AI", and opens the same command bar as the header button and Cmd+Shift+K.',
      'Asking AI to add objects now hands them straight to the builder preview on your desk to pick and place, rather than a message telling you to open another builder.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.29',
    date: '2026-06-14T22:00:00Z',
    title: 'v2.5.29 — A clearer, more consistent interface',
    tag: 'design',
    summary:
      'First step of a UX clean-up. The create action is now an obvious accent "+ Widget" button, the two near-identical AI build buttons are merged into one, AI uses a single icon throughout, and collapsed side panels show a labelled tab instead of a bare arrow so you can tell what is hidden.',
    highlights: [
      'The toolbar\'s create action is now a clearly highlighted "+ Widget" button, in every theme, instead of a faint "+ Add".',
      'The two similar "Build with AI" and "AI Setup" buttons on the canvas are merged into a single "Build with AI". The task-scoped setup suggestions are still available from each task in the sidebar.',
      'AI is now shown with one consistent icon across the toolbar and AI controls.',
      'When the workspace or assistant panel is collapsed, the toggle now reads "Workspace" or "Assistant" instead of an ambiguous arrow.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.28',
    date: '2026-06-14T20:00:00Z',
    title: 'v2.5.28 — Working help links + recent improvements',
    tag: 'polish',
    summary:
      'The in-app Help and Support links now open the live help centre, and the recent improvements are gathered here in case you are coming from an older version. Hover the toolbar to learn the controls, and updating on Mac is now reliable.',
    highlights: [
      'The Help and Support link and the "Learn more" links now open the live help centre, instead of a web address that was not connected yet.',
      'Mac updates are reliable: updating prompts for your administrator password when needed and completes, and never loops on the old version.',
      'Hover tooltips on the top toolbar and AI controls explain what each one does, and a short What\'s new summary appears after each update.',
      'Right-click menus are contextual per object, and Build with AI works across more of them.'
    ],
    links: [
      { label: 'Finding your way around', href: `${HELP_BASE}/getting-around` },
      { label: 'Right-click menus', href: `${HELP_BASE}/right-click-menus` },
      { label: 'Sharing and invites', href: `${HELP_BASE}/sharing-and-invites` }
    ]
  },
  {
    version: '2.5.27',
    date: '2026-06-14T18:00:00Z',
    title: 'v2.5.27 — More reliable updates on Mac',
    tag: 'fix',
    summary:
      'Fixes a Mac update loop where the app would download an update, ask for permission, then reopen on the same old version and offer the update again. Updating now asks for your administrator password when it needs to, and if it still cannot replace the app in place, it sends you to the download page to install manually instead of looping.',
    highlights: [
      'Mac updates that need elevated permission now prompt for your administrator password and complete, instead of silently failing and reopening the old version.',
      'If PlexiDesk is running from a read-only or quarantined location (for example launched from Downloads), it now tells you to move it into Applications rather than trying an update that can never succeed.',
      'When an in-place update genuinely cannot be applied, the app opens the download page so you can install the new version by hand, rather than looping on the same version.'
    ],
    links: [{ label: 'Finding your way around', href: `${HELP_BASE}/getting-around` }]
  },
  {
    version: '2.5.26',
    date: '2026-06-14T12:00:00Z',
    title: 'v2.5.26 — In-app help, tooltips, and recent UX upgrades',
    tag: 'feature',
    summary:
      'This update makes PlexiDesk easier to learn as you go. Hover the toolbar and AI controls to see what each one does, get a short summary like this one after every update, and open the new help centre for step-by-step guides. It also gathers up the interface improvements from the last few releases so they are easy to find.',
    highlights: [
      'New: hover tooltips on the top toolbar and the AI controls explain what each button does, so you no longer have to guess from an icon.',
      'New: after every update, a short "What\'s new" summary like this one appears on first open, with links through to help articles.',
      'New: a help centre with guides for the features below, reachable from the footer\'s Help and Support link.',
      'Right-click menus are now genuinely contextual per object — a file offers Open and Copy URL, a colour offers Copy hex, a table offers Add row, and a section offers a layout choice, instead of one generic menu.',
      'Build with AI works on more objects — describe what you want and PlexiDesk drafts the contents for you to approve.',
      'Sharing a folder or task by email now tracks who you invited and whether they have opened it, visible to your admin.',
      'Updating on Mac is now a reliable one-click install from the footer.'
    ],
    links: [
      { label: 'Finding your way around', href: `${HELP_BASE}/getting-around` },
      { label: 'Right-click menus', href: `${HELP_BASE}/right-click-menus` },
      { label: 'Build with AI', href: `${HELP_BASE}/ai-assistant` },
      { label: 'Sharing and invites', href: `${HELP_BASE}/sharing-and-invites` }
    ]
  },
  {
    date: '2026-06-06T12:00:00Z',
    title: 'v2.5 — Shapes, Cards, Custom Blocks & multi-select',
    tag: 'feature',
    highlights: [
      'New widget — Custom Block: a WYSIWYG form/record designer. In Design mode, drop typed fields (text, paragraph, number, date, email, URL, dropdown, checkbox, heading, divider) and drag/resize each one where you want. In Use mode the same block is a live data-entry form. Save any layout as a personal Template reusable across every folder/task/canvas.',
      'New widget — Shapes: rectangle, rounded, ellipse, diamond, triangle, hexagon, star, line and arrow with fill, stroke, line weight and an optional centred label. Stretches as you resize.',
      'New widget — Cards: a titled callout with an accent bar, bold title and body + colour picker.',
      'Multi-select: Shift-click an object header or Shift-drag a marquee box to select many at once. Drag any selected object and the whole group moves together. Group the selection into a section, or duplicate / delete the lot. ⌘/Ctrl+A selects all, Esc clears.',
      'Browser windows get size presets — Mobile / Tablet / Tablet (landscape) / Laptop / Desktop — and resize instantly (no refresh).',
      '⌘/Ctrl-click any object while zoomed out dives straight to it at 100%, centred — now works for objects inside sections too. Drag an object out of a section to pop it back onto the desk.',
      'Duplicating now asks: keep the copy in sync (edits mirror) or make an independent copy.',
      'Fixes: the + Add toolbar and its menus no longer run off the edge on smaller / non-fullscreen windows; the right-click "Add object" menu scrolls and flips so every widget (incl. Diagram & Scratchpad) is reachable.'
    ]
  },
  {
    date: '2026-05-27T18:00:00Z',
    title: 'Build with AI — natural-language workspace builder',
    tag: 'feature',
    highlights: [
      'New ✨ "Build with AI" button on the canvas. Click → describe what you want to achieve in plain English ("Track my freelance clients", "Plan a podcast launch", "Run a book club") and Claude returns a set of suggested widgets, pre-configured.',
      'Each suggestion shows a "What I heard" interpretation banner so you can spot misunderstandings before spawning anything. Suggestion cards preview their contents — table columns appear as chips with their types, pages show their heading titles, fields show their type.',
      'Tick the suggestions you want, "Add N to canvas" → they land below your existing widgets, fully wired. Tables come with their schema pre-built (including single-select options with hex colors). Pages come with starter sections + a paragraph or todo list. Field widgets come typed and labeled.',
      'Knows every widget kind in the catalog — sticky, note, markdown, page, table, field (11 types: short/long/rich text, number, checkbox, single/multi-select, date, attachment, button, relation), file, webview, timer, calculator. Defensive filter in main drops any unknown kinds before they hit the renderer.',
      'Bottom bar: 5 example chips to seed your prompt if you don\'t know where to start.'
    ]
  },
  {
    date: '2026-05-27T17:00:00Z',
    title: 'Bug fixes — pages render, file previews, PDF page nav',
    tag: 'fix',
    highlights: [
      'Pages were a blank screen because the Tiptap editor used Tailwind `prose` classes that aren\'t styled in our build (no @tailwindcss/typography plugin). Swapped to the hand-rolled `md-rendered tiptap-editor` styles that MarkdownWidget already uses — same look, no missing plugin.',
      'File preview thumbnails weren\'t showing. Replaced the IPC + Blob URL pipeline with a custom `fb-file://` protocol registered in main: privileged scheme, supports Range requests, streams from disk. `<img>`, `<video>`, `<audio>`, `<iframe>` all just take a `fb-file://<id>` URL directly.',
      'Multi-page PDFs now have full page navigation. Swapped `<object>` to `<iframe>` — Chromium\'s built-in PDF viewer only exposes its toolbar (page nav, zoom, rotate, print) when loaded as a top-level frame document.',
      'New "Related records" field type — link rows from one table to rows of another. Pick the target table, pick which column to display on chips, toggle single-vs-multi. Lazily loads target rows on first picker open so cross-table relations don\'t fetch every canvas mount.',
      'Self-references prevented — a Tasks table\'s relation column won\'t list Tasks itself in the dropdown.'
    ]
  },
  {
    date: '2026-05-27T15:30:00Z',
    title: 'Rich widget suite — files, pages, tables, field widgets',
    tag: 'feature',
    highlights: [
      'Drop any file from Finder onto the canvas and it spawns a File widget with native preview: images (object-contain), PDFs (Chromium PDF viewer with page nav, zoom, print), video (`<video controls>`), audio (player + filename), generic files (download button). Files copy into PlexiDesk\'s userData so they survive moves of the original.',
      'New Page widget — Notion-style document on the canvas. Built on Tiptap (StarterKit + TaskList + Link). Type `/` anywhere for a slash menu with H1, H2, bullet list, numbered list, todo list, code block, quote, divider, and inline AI prompt. The AI prompt opens a small textarea; Cmd+Enter sends to Claude, the response inserts at your cursor.',
      'New Table widget — Airtable-style database. Add/delete rows, add/delete columns, rename inline. Column types: short text, long text, number, checkbox, single-select (with editable options + hex colors), multi-select, date, attachment (drops file into vault automatically), button (runs AI prompt or shell command — shell deferred until security review), relation. Auto-provisions its backing fb_tables row on first render so there\'s no "create table" step.',
      'New Field widget — drop a single typed field on the canvas. Same 11 types as table columns. Edit the label, the value, and per-type config (select options inline, button payload + action, relation target). Same renderer as table cells via the shared `FieldEditor` component — add a new field type in `shared/fields.ts` and it shows up everywhere automatically.',
      'New `fb_tables` + `fb_rows` + `fb_files` tables in SQLite. Schemas stored as JSON so we can add column types without DB migrations. All persisted locally, no cloud anything.'
    ]
  },
  {
    date: '2026-05-27T12:00:00Z',
    title: 'Local apps — launcher tiles for Mac apps',
    tag: 'feature',
    highlights: [
      'Connected Apps now supports local Mac apps, not just web URLs. Click + Add app → Local app tab → Choose app → pick anything from /Applications. The picker shows the app\'s real macOS icon, bundle id, and lets you set a display name.',
      'Each local app appears in the sidebar with its native icon (extracted via `nativeImage.createThumbnailFromPath` — bypasses an Electron 33 + macOS Sonoma crash in `app.getFileIcon`).',
      'Drag a local Connected App onto any task canvas → spawns a launcher tile bound to that app. Click the tile → launches if not running, focuses if running, unminimizes if dock-minimized, unhides if Cmd+H-hidden. Always brings you back to the app.',
      'The tile persists on the canvas regardless of the app\'s state — quit the real app, the tile stays so you can re-launch later. Survives PlexiDesk restarts.',
      'Tried full punch-through window mirroring first (transparent BrowserWindow + AppleScript window positioning + mix-blend-mode click-through to embed the real app live inside the canvas). It worked but was too brittle for MVP — pulled it for the simpler tile.'
    ]
  },
  {
    date: '2026-05-27T09:00:00Z',
    title: 'Connected Apps — drag-to-canvas, vault auto-fill, Favourites',
    tag: 'feature',
    highlights: [
      'Drag any Connected App row from the sidebar onto a task canvas → spawns a browser widget bound to that app. The widget shares the app\'s session partition with the full-pane view, so logging in once persists everywhere.',
      'Pin a freeform browser widget back to Connected Apps with one click — the "Pin to apps" button in the widget header. Hostname-dedups: if you already have GitHub pinned, hitting Pin on a `github.com/issues/123` widget reuses the existing app instead of creating a duplicate.',
      'Vault auto-fill — bind a vault entry to any Connected App (key icon in the toolbar opens the binding popover). On did-finish-load, PlexiDesk injects credentials into the page\'s username/password fields using React-compatible value setters so React-built login pages accept them. Idempotent — won\'t stomp values you typed.',
      'Sidebar Connected Apps section now splits into Favourites + a collapsible "More apps (N)" accordion. Apps rank by recency × frequency (log-scaled use count × 1-week recency decay). Pin any app to lock it to the top.',
      'Touch counter — every full-pane open, drag-to-canvas, and bound-widget focus bumps the usage count. Apps you actually use rise to Favourites; ones you stop using sink to More apps.'
    ]
  },
  {
    date: '2026-05-26T15:00:00Z',
    title: 'OAuth popups + automated test harness',
    tag: 'fix',
    highlights: [
      'OAuth flows in Connected Apps work again. Root cause: the webview\'s webContents had no `setWindowOpenHandler` in main, so popups died or opened without sharing the webview session — killing `window.opener` and breaking the OAuth callback.',
      'New popup router in main: window.open() with features OR disposition=\'new-window\' opens as a real native popup window sharing the parent session (cookies + auth state preserved). target=_blank link clicks forward to the renderer via IPC so they spawn as canvas widgets, keeping the click-to-add-widget UX.',
      'Two-axis defense against the original bug: rejects javascript:/data: URLs from the forward path so they can\'t spawn malicious widgets in our shared session.',
      'New automated test suite — Vitest for pure-logic unit tests (sort formulas, autofill script builders, popup router decisions) + Playwright Electron for E2E (app boot, drag-drop, IPC roundtrip, vault crypto round-trip, schema migrations). 39 tests covering the major surfaces, runs in ~16s.',
      'The OAuth router has explicit regression guards — the unit suite includes "does NOT route target=_blank as a native popup" and "does NOT route OAuth popups through the renderer" tests so the original bug can\'t silently come back.'
    ]
  },
  {
    date: '2026-05-26T09:15:00Z',
    title: 'WebView URL persistence + Mac haptics',
    tag: 'polish',
    highlights: [
      'Browser widgets now remember where you were. As you navigate inside any webview, the latest URL is debounced-saved back into the widget. Close the focus mode (or even the widget — until you remove it) and re-open later: it lands on the last page you were on, not the original.',
      'Live header preview during navigation — the widget header updates to the new page title/host the moment you navigate, before the debounce-save commits. No more stale tab labels.',
      'Force-flush on unmount: if you close the focus mode mid-typing on a page, the latest URL is committed immediately rather than waiting on the debounce timer.',
      'Mac haptics — new ⚡ tactile feedback layer. Tries the optional native-mac-haptics bridge (NSHapticFeedbackPerformer) first; falls back to a near-subliminal audio-tactile click via the existing AudioContext when the native module isn\'t available.',
      'Wired into the highest-value moments: 5-Minute Promise start (medium tap), session complete (success double-tap), task marked done (success), vault unlock (medium), vault unlock failed (warning triple).',
      'Native haptics activate automatically if you run `npm install node-mac-haptics && npx electron-rebuild`. Until then, the audio fallback gives every haptic call something to feel.'
    ]
  },
  {
    date: '2026-05-26T08:30:00Z',
    title: 'Energy-Aware Scheduling + Calendar + drag-task-to-canvas',
    tag: 'feature',
    highlights: [
      'Energy-Aware Scheduling — new ⚡ chip in the app header. Click → log your current energy (🪫 Low / 🔋 Steady / ⚡ High) in two taps. The chip glows the colour of your current state.',
      'New "Energy fit" sort in the All Tasks view — when you\'ve logged energy, this ranks tasks by how well their lift matches your state (heavy tasks for high energy, light admin for low). Falls back to Smart sort if you haven\'t logged yet.',
      'New Energy dashboard card — add it via Customize on any dashboard. Three-tap entry plus a strip of your last 72h.',
      'New Calendar view under WORKSPACE — month grid with tasks placed by due date. Each day cell sorts its tasks by urgency × importance + due-date boost (the three-axis sort). Today is ringed. Click a task chip → open it. Hover → ⚡5 min on the chip.',
      'Drag any task from the sidebar onto the canvas → spawns a "Task link" widget that references that task. Click the widget to open the linked task; hover for an inline 5-min start. Survives task switches like any other widget.',
      'Native Mac haptics is deferred — needs a native node addon. The renderer-side hooks are easy when the bridge lands.'
    ]
  },
  {
    date: '2026-05-25T17:10:00Z',
    title: 'OS Phase 7 — Vault (encrypted credentials + TOTP)',
    tag: 'feature',
    highlights: [
      'New Vault entry under WORKSPACE in the sidebar. First click → set a master password. Subsequent clicks while locked → unlock prompt. While unlocked → list of credential entries with copy / reveal / TOTP.',
      'Crypto: AES-256-GCM for entry payloads, PBKDF2-SHA256 with 600,000 iterations (OWASP 2023) for key derivation from your master password, fresh 16-byte salt per vault, fresh 12-byte IV per entry. Master key lives only in main-process memory; lock zeroes it out.',
      'Each entry stores title / url / username in plaintext (for search and display) and an encrypted blob containing password + TOTP secret + notes.',
      'Built-in RFC 6238 TOTP generator — paste a base32 secret, the entry shows a live 6-digit code with countdown ring. One click copies the current code; clipboard auto-clears in 30 seconds.',
      'Auto-clearing clipboard on every password / TOTP copy (30s). The "Lock" button in the vault header clears the master key from memory immediately.',
      'No recovery. No sync. No backend. If you lose the master password the vault is unrecoverable — that\'s the price of local-first encryption.'
    ]
  },
  {
    date: '2026-05-25T16:30:00Z',
    title: 'OS Phase 6 — Customizable dashboards',
    tag: 'feature',
    highlights: [
      'Click "Customize" in the top-right of any dashboard (Home or any project) to enter edit mode. Each card grows a drag handle + remove button.',
      'Drag cards by their colored handle to reorder. Accent-colored drop indicator shows where the card will land. Drop on the bottom strip to push a card to the end.',
      'Add removed cards back from the dashed palette at the bottom — each option shows the card name and a one-line description of what it does.',
      '"Reset" button restores the default layout for this dashboard. "Done" exits edit mode.',
      'Layouts are persisted per dashboard — the Home dashboard and every Project dashboard have independent custom layouts. Stored in a new dashboard_layouts table keyed by dashboard.'
    ]
  },
  {
    date: '2026-05-25T15:10:00Z',
    title: 'OS Phase 5 — Connected Apps',
    tag: 'feature',
    highlights: [
      'New CONNECTED APPS section in the sidebar — pin Spotify, Gmail, Slack, ChatGPT, Claude, Notion, Linear, GitHub, Figma and 11 others as persistent app-level browsers.',
      'Click "+" next to the section header to open the picker: tabbed view with 20 curated standard apps (grouped by Productivity / Comms / Dev / AI / Media / Design) and a Custom URL tab for anything else. Apps you\'ve already added show a green check so you don\'t duplicate.',
      'Each app gets its own persistent Electron partition (cookies, local storage, login state survive app restarts). Click a Connected App in the sidebar → full-pane render in the main area with a slim toolbar (back / forward / reload / open in OS browser / remove).',
      'External links opened from inside a Connected App go to your system browser, not as new in-app widgets — keeps the OS-level vs task-level distinction clean.',
      'Phase 6 will let you reorder Connected Apps and add custom colors / icons. Today they appear in the order you add them.'
    ]
  },
  {
    date: '2026-05-25T14:25:00Z',
    title: 'OS Phase 3 — All Tasks view',
    tag: 'feature',
    highlights: [
      'New consolidated All Tasks view in the sidebar — every task across every project, flat. Click "All Tasks" under WORKSPACE.',
      'Five filter chips with live counts: Today / Overdue / Upcoming / All open / Done. Today is the default and includes overdue + in-progress + due-today.',
      'Search box filters by task title and description. Sort dropdown: Smart (overdue → due → priority), Due date, Recently updated, Alphabetical.',
      'Each row: round checkbox (one tap to mark done — triumph chime fires), task title (click → opens the task canvas), project breadcrumb (click parent → opens that project\'s dashboard), due-date chip, urgency + importance dots, inline "Just 5 min" on hover.',
      'Empty states per filter — "Nothing overdue — sweet" / "You\'re caught up" / etc. — affirming, not punishing.'
    ]
  },
  {
    date: '2026-05-25T14:00:00Z',
    title: 'OS Phase 2+4 — Home Dashboard + Project Dashboards (same component)',
    tag: 'feature',
    highlights: [
      'New Home Dashboard at the top of the sidebar — your at-a-glance landing surface. Click on Home from the WORKSPACE section.',
      'Every project now has its own dashboard — click any project name in the sidebar to open it. Same component as Home, just scoped to that project\'s subtree (including all sub-projects + their tasks).',
      'Cards: Quick Start (top-priority task + one-click 5-min), Today stats (sessions / focused minutes / done), 30-day Habit Garden, Open tasks list (overdue → today → upcoming → priority-ranked, with inline 5-min trigger on hover), Recent activity from the Trail.',
      'Project dashboards filter every card to that project\'s scope automatically — sessions, tasks, activity, garden density, top-priority task all narrow to what matters for that project.',
      'Each dashboard is a launchpad first, a report second — the Quick Start at the top picks the highest-priority task for you (urgency × importance + due-date boost + in-progress bonus) so you can start the day without deciding what to start.'
    ]
  },
  {
    date: '2026-05-25T13:50:00Z',
    title: 'Sidebar drag-and-drop — reorder, reparent, nest',
    tag: 'feature',
    highlights: [
      'Drag any project or task in the sidebar to reorder it within its current parent, or to drop it into a different project, or to nest one project inside another.',
      'Drop indicators: a thin accent-coloured line shows where the item will land between siblings; folders highlight with an inset accent ring when you\'re about to drop INTO them.',
      'Cycle-safe: dropping a project into one of its own descendants is silently rejected (no broken trees possible).',
      'Atomic move on the backend — single transaction that reparents and renumbers all destination siblings; the sidebar refreshes from the server so sort order stays correct across multiple drags.',
      'Soft chime confirms each drop. Destination project auto-expands so the moved item is immediately visible.'
    ]
  },
  {
    date: '2026-05-25T13:35:00Z',
    title: 'OS Phase 1 — Sidebar restructure into a workspace OS',
    tag: 'design',
    highlights: [
      'Sidebar rebuilt into three collapsible sections: WORKSPACE (Home + All Tasks), PROJECTS (the folder/task tree, now labeled "Projects"), and CONNECTED APPS (placeholder shell for the persistent apps pane shipping in a later phase).',
      'New view router — the main pane now switches between Home Dashboard, All Tasks, Project Dashboard, individual Task canvas, and Connected App views. Persists last view across app restarts.',
      'Click a project name → opens that project\'s dashboard (placeholder for now). Click a task → opens the existing canvas workflow, unchanged.',
      '"Folder" is now "Project" in all user-facing copy (database kind stays as folder; pure label change). Edit dialog, sidebar tooltips, new-node dialog all updated.',
      'Home / All Tasks / Project Dashboard / Connected App views ship as labeled placeholders — the OS skeleton is in place; the dashboards themselves land in Phases 2–6.'
    ]
  },
  {
    date: '2026-05-25T08:55:00Z',
    title: 'Smart Stacking — semantic widget grouping',
    tag: 'feature',
    highlights: [
      'New hub icon in the app header (next to Settings) — click to ask AI to group your unsectioned widgets into related sections based on what they relate to, not what kind they are.',
      'Proposal modal lists 2–5 named groups with reasons and member widgets. Defaults to all-checked, ADHD-style — uncheck what you don\'t want.',
      'Auto-picks section colors from the rotation, skipping any already in use on the canvas so each section is visually distinct.',
      'Caches the proposal in memory — re-clicking with the same widget set opens instantly (a "cached" badge appears); the refresh icon forces a fresh AI call.',
      'Only operates on widgets that aren\'t already in a section — respects existing manual organization.'
    ]
  },
  {
    date: '2026-05-25T07:35:00Z',
    title: 'Pre-Task Mood Bridge',
    tag: 'feature',
    highlights: [
      'When you open a task that\'s likely to feel hard (low interest 1-2, or high stakes 4-5, while still in "open" status), a 🌱 bridge modal appears first.',
      'Three personalized friction-reducers: "Just 5 minutes" (starts a focus session + marks in-progress), "Body double me" (turns on quiet AI presence), "Have AI suggest the first step" (proactive welcome).',
      'Auto-opens in 15 seconds if you do nothing — never traps you. "Just open it" escape hatch always visible.',
      'Shown once per task per session. Addresses the EMOTIONAL entrance to a task, which is what actually blocks ADHD starts more than complexity.'
    ]
  },
  {
    date: '2026-05-25T07:25:00Z',
    title: 'Hyperfocus Guardian',
    tag: 'feature',
    highlights: [
      'New amber banner appears at the top of the canvas when you\'ve been continuously focused for 90+ minutes (no 5-min break in that window). "You\'re on fire — 92 min straight."',
      'Two choices: "3-min stretch" (emerald button — opens a small countdown banner that returns you with a chime) or "keep going" (snoozes for 30 min).',
      'The inverse of a focus timer. Doesn\'t nag, doesn\'t interrupt — affirms first, offers second. Protects you from yourself.',
      'Resets automatically the moment you take a 5+ minute break, so a normal Pomodoro rhythm never triggers it.'
    ]
  },
  {
    date: '2026-05-25T07:15:00Z',
    title: 'Event sound design pass',
    tag: 'polish',
    highlights: [
      'Adding a new widget plays a soft single tap (different chime for sections — a warm low→fifth two-note "settled" tone).',
      'Marking a task done plays a triumphant 4-note ascending arpeggio (C-E-G-C). Earned dopamine.',
      'All event sounds respect your master sound prefs (volume, master enable, quiet-while-widget-active).'
    ]
  },
  {
    date: '2026-05-25T07:05:00Z',
    title: 'One-Tap Reboot — "Welcome back"',
    tag: 'feature',
    highlights: [
      'When you come back to the app after being away (window blurred 3+ min, document hidden, or 10+ min of no input while visible), a soft "Welcome back — you were away N min" pill appears near the bottom of the canvas.',
      'One tap "Bring me back" → Claude summarizes the last 30 minutes from the Trail directly into your chat, refocuses the most recently-touched widget on the active task, and plays the focus chime. The 60-second re-entry tax killer.',
      'Auto-dismisses the moment you do anything (click, key, scroll). Close button if you don\'t want it.',
      'Reuses the External Brain summarizer — no extra cost beyond what you\'d pay for a manual "What was I doing?"'
    ]
  },
  {
    date: '2026-05-25T06:55:00Z',
    title: 'Body Double Mode — quiet AI presence',
    tag: 'feature',
    highlights: [
      'New people-icon toggle in the assistant panel header — turn on Body Double for a quiet AI co-worker that sits beside you while you work.',
      'Every ~10 minutes, the assistant drops a short observation (≤15 words) based on what you\'ve been doing — names specific docs, URLs, or session counts so you feel seen.',
      'When you go idle 10-20 min: a warm low-key check-in ("Coffee break? No rush"). When you\'re deeply away (20+ min): silence — no spam.',
      'Pure presence: no questions back at you, no coaching, no sycophancy. The killer ADHD productivity hack ("body doubling") finally first-class in software.',
      'Runs on Haiku 4.5 — ~$0.0001 per tick. Persists across app restarts if left enabled.'
    ]
  },
  {
    date: '2026-05-25T06:40:00Z',
    title: 'Cognitive Load Meter + Park-the-rest',
    tag: 'feature',
    highlights: [
      'New load gauge in the canvas title bar — a coloured dot + count showing how heavy your current canvas feels (Light / Comfortable / Heavy / Overloaded). Browsers weigh more than stickies; widgets parked in sections don\'t count.',
      'When you cross "Overloaded", the dot pulses red. Click it to open the popover and hit "Park everything except the active widget" — single tap to clear the desk while keeping work in flight.',
      'Parked widgets are hidden from the canvas but persist (new archived flag on widgets). The popover shows them in a scroll-list — click any to restore. The +N badge on the gauge counts what\'s parked.',
      'Soft chime on park / restore so the action has weight.'
    ]
  },
  {
    date: '2026-05-25T06:25:00Z',
    title: 'Streak-Proof Habit Garden',
    tag: 'feature',
    highlights: [
      'New focus garden in the canvas title bar — a 7-day inline strip of accent dots showing your recent focus sessions, with today\'s count next to a flower icon.',
      'Click the strip to open the full 30-day garden popover: 6×5 grid of bloom intensities, today highlighted with a ring, plus stats (today / days active / total).',
      'Crucially: no streak counter. Missed days are gaps; the rest of the garden stays bloomed. "No streak to break. Gaps are fine — the bloom stays."',
      'Driven by the focus_sessions table — every "Just 5 min" you finish (or "Keep going") feeds the garden. Bloom intensity saturates at 4+ sessions/day, so a hyperfocus burst doesn\'t dwarf a normal day.'
    ]
  },
  {
    date: '2026-05-25T06:15:00Z',
    title: 'Assistant model picker — Auto / Haiku / Sonnet / Opus',
    tag: 'feature',
    highlights: [
      'New AI Model section in Settings. Pick Auto for smart per-action routing, or lock to a specific model (Haiku $ / Sonnet $$ / Opus $$$).',
      'Auto mode: chat, welcome, setup, and resume use Sonnet 4.6; trail summaries use Haiku 4.5. Visible breakdown below the picker.',
      'Tiny mode chip in the assistant panel header shows the active mode (auto/haiku/sonnet/opus). Hover for routing details.',
      'Cost transparency: each model option shows its tier ($, $$, $$$) so you can predict spend before locking in.'
    ]
  },
  {
    date: '2026-05-25T06:00:00Z',
    title: 'External Brain — "What was I doing?"',
    tag: 'feature',
    highlights: [
      'New replay button in the assistant panel header (↻ icon, next to clear chat). One click → Claude reads the last 30 minutes of your activity and writes a 3-5 sentence narrative of where you were and what you were doing.',
      'Every meaningful action now flows to an append-only activity log: task switches, widget adds, browser navigations, chat sends, focus sessions started/ended. Privacy: 100% local, in your SQLite DB.',
      'Uses the fast model (Claude Haiku 4.5) for summarization — ~10× cheaper than the chat model, and faster too. Costs roughly $0.0001 per "What was I doing?" call.',
      'Designed for the "I came back from making coffee and forgot what I was doing" moment — the external hippocampus the ADHD brain has been waiting for.'
    ]
  },
  {
    date: '2026-05-23T20:45:00Z',
    title: 'The 5-Minute Promise',
    tag: 'feature',
    highlights: [
      'New accent-coloured "Just 5 min" button in every active task — start a 5-minute focus session in one click. The most-evidence-backed ADHD initiation technique, finally a first-class primitive.',
      'While a session runs: the rest of the app dims to 35% opacity, the canvas gets a pulsing accent ring, and a floating timer pill sits at the top of the desk. The world hushes around the work.',
      'When 5 minutes are up: a soft alarm + a guilt-free choice modal — "Done for now" (real win, no streak to break), "Keep going · 5 more", or "15 min / 25 min (pomodoro)". Sessions chain so you can keep adding fives.',
      'Every session is logged to the new focus_sessions table — substrate for the upcoming Habit Garden + Trail features. "Done for now" and "Keep going" both count as wins.',
      'Close button (×) on the timer pill ends the session early without judgement — logged as abandoned so the system learns, not as failure.'
    ]
  },
  {
    date: '2026-05-23T20:10:00Z',
    title: 'Markdown widget upgraded to true WYSIWYG (Tiptap)',
    tag: 'polish',
    highlights: [
      'Markdown widget now renders as you type — bold text looks bold, headings look like headings, no syntax characters in the way. No more edit/preview mode toggle.',
      'Paste raw markdown anywhere in the editor and it converts to rich formatting on the fly',
      'Live formatting toolbar: highlights the active mark/block, click to toggle. Adds task lists, blockquotes, dividers, and a code-block mode.',
      'Click anywhere in the editor to place your cursor exactly where you clicked — no more "always opens at the top" issue.'
    ]
  },
  {
    date: '2026-05-23T19:15:00Z',
    title: 'Markdown widget + ambient keyboard click profiles',
    tag: 'feature',
    highlights: [
      'New Markdown widget — paste markdown, view it rendered as rich text. (Upgraded later the same day to a true WYSIWYG editor — see next entry.)',
      'Five new keyboard click sound styles in the Ambient family: Whisper (breathy hush), Vapor (air drift + pad bloom), Stardust (sparkle ping), Crystal (bell shimmer), Halo (pillowy swell) — all low-impact and dopamine-coded',
      'Settings panel now groups click sounds by Tactile (physical key feel) and Ambient (spacey, breathy)'
    ]
  },
  {
    date: '2026-05-23T18:30:00Z',
    title: 'Keyboard click profiles + footer with What\'s New',
    tag: 'polish',
    highlights: [
      'Five keyboard click sound styles: Soft, Mechanical, Typewriter, Bubble, Marimba — click any one in Settings to preview',
      'New app footer with copyright, Terms of Use, and a What\'s New panel that lights up when fresh updates ship',
      'Right-click in the assistant panel to save selected text as a sticky or full note on the canvas'
    ]
  },
  {
    date: '2026-05-23T17:30:00Z',
    title: 'Editable tasks/folders + Recent Pages + AI Setup in dialogs',
    tag: 'feature',
    highlights: [
      'Pencil icon on any sidebar row opens the edit dialog — change title, notes, urgency, interest, importance, duration, and a new due date field',
      'Sidebar rows now show a colored due-date chip: "today", "tomorrow", "3d", "2d late"',
      'New "Recent pages" chip strip in the create dialog, populated by browser webview visits — one click adds a URL to the task setup',
      '"Have AI suggest the setup" checkbox on create, "Suggest more setup" button on edit — the AI now sees your most-visited pages and prefers them when picking widgets'
    ]
  },
  {
    date: '2026-05-23T16:30:00Z',
    title: 'Time-Blindness Anchoring — feel the day, don\'t watch the clock',
    tag: 'feature',
    highlights: [
      'Ambient time-of-day overlay on the canvas: soft hue shift from dawn-cool through midday-warm to dusk-amber to night-indigo',
      'A "sun" glow that travels left-to-right across the top of the desk during daylight, peaking at noon',
      'Every widget grows a subtle warm halo the longer it sits on the desk — externalizes time without numbers'
    ]
  },
  {
    date: '2026-05-23T15:00:00Z',
    title: 'AI Setup + sound preferences',
    tag: 'feature',
    highlights: [
      'AI Setup button in the canvas title bar — Claude reads the active task and suggests 4–7 widgets, browsers and notes to spawn',
      'Sound preferences in Settings: master toggle, volume slider, keyboard click toggle, "Quiet while widget active" mode',
      'All sounds respect prefs everywhere — chimes, focus tones, click feedback'
    ]
  },
  {
    date: '2026-05-22T22:00:00Z',
    title: 'Futuristic theme mode',
    tag: 'design',
    highlights: [
      'Fully dark canvas in dark mode (no more cream paper)',
      'New Futuristic theme: aurora gradient background, flowing accent beam, pulsing widget glow, scanline overlay, power-on chime'
    ]
  },
  {
    date: '2026-05-22T19:00:00Z',
    title: 'Theme system v1',
    tag: 'design',
    highlights: [
      'Light / Dark / Auto / Futuristic theme modes — picker in Settings (gear icon in titlebar)',
      'Opera-inspired accent picker: Violet, Blue, Emerald, Rose — affects buttons, active states, and widget glow at runtime'
    ]
  },
  {
    date: '2026-05-21T20:00:00Z',
    title: 'Velocity, Workspace Resume, AI Pair-Worker',
    tag: 'feature',
    highlights: [
      'Task duration estimates with personal velocity tracking — predicts real time based on your history',
      'Workspace Resume — assistant drafts a "where you left off" markdown summary you can pin to a task',
      'AI chat panel knows the active task and its widgets, so questions become contextual immediately'
    ]
  },
  {
    date: '2026-05-20T18:00:00Z',
    title: 'Sections widget',
    tag: 'feature',
    highlights: [
      'Group widgets visually with the Section container',
      'Five layout modes per section: Free, Grid, Stacks, Icons, List — switch on the fly',
      'Drag-and-drop into/out of sections with hover targeting and eject button'
    ]
  },
  {
    date: '2026-05-19T12:00:00Z',
    title: 'Foundation',
    tag: 'feature',
    highlights: [
      'Three-panel layout: workspace tree, canvas desk, assistant chat',
      'Widgets: sticky, note, webview browser, PDF, Google Docs/Sheets/Slides, Gmail, calculator, color picker, image, video, timer',
      'Pin-to-screen for keep-it-visible widgets, zoom & pan canvas, widget palette and floating toolbar'
    ]
  }
]

const LAST_SEEN_KEY = 'fb.changelog.lastSeenAt'

export function getLastSeenAt(): number {
  if (typeof localStorage === 'undefined') return 0
  const raw = localStorage.getItem(LAST_SEEN_KEY)
  return raw ? parseInt(raw, 10) : 0
}

export function markChangelogSeen(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LAST_SEEN_KEY, String(Date.now()))
}

export function hasUnseenChanges(): boolean {
  const lastSeen = getLastSeenAt()
  if (CHANGELOG.length === 0) return false
  const newestMs = new Date(CHANGELOG[0].date).getTime()
  return newestMs > lastSeen
}

// ── First-run "What's new in vX.Y.Z" release modal ──────────────────────────
// Distinct from the timestamp-based unseen dot above: this fires ONCE per app
// version, on the first launch after an update, and shows that version's
// summary + highlights + support links. Keyed by version so it survives a
// localStorage clock change and never re-shows for a version already seen.

const RELEASE_SEEN_KEY = 'fb.app.releaseModalVersion' // version whose modal was shown
const LAST_RUN_KEY = 'fb.app.lastRunVersion' // version the app last booted as

// The running app version, injected at build time. 'dev' in unpackaged dev.
declare const __APP_VERSION__: string | undefined
export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
}

export function getReleaseEntryForVersion(version: string): ChangelogEntry | null {
  return CHANGELOG.find((e) => e.version === version) ?? null
}

// The newest entry that declares a version — used by the release gate to assert
// the changelog was updated for the release.
export function newestVersionedEntry(): ChangelogEntry | null {
  return CHANGELOG.find((e) => !!e.version) ?? null
}

function getReleaseSeenVersion(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(RELEASE_SEEN_KEY)
}

// The release entry to auto-show now, or null. "After an update" is decided two
// ways, either is sufficient: the main process reports wasUpdated (authoritative
// — it persists the last-run version in userData), or the renderer's own
// last-run-version marker differs from the current version (covers every update
// after the first, and is what the e2e/unit tests drive). A fresh install has
// neither, so it shows nothing. The release-seen marker prevents re-showing on a
// reload within the same version. Pure (no writes); caller then advances the
// run version via advanceRunVersion().
export function getPendingReleaseEntry(opts?: { wasUpdated?: boolean }): ChangelogEntry | null {
  const cur = getAppVersion()
  if (cur === 'dev') return null
  if (getReleaseSeenVersion() === cur) return null
  const entry = getReleaseEntryForVersion(cur)
  if (!entry) return null
  const lastRun = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_RUN_KEY) : null
  const updatedByHistory = lastRun !== null && lastRun !== cur
  if (!(opts?.wasUpdated || updatedByHistory)) return null
  return entry
}

// Record the current version as seen so the modal does not fire again for it.
export function markReleaseSeen(version?: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(RELEASE_SEEN_KEY, version ?? getAppVersion())
}

// Record the current version as the last one booted. Call once per launch after
// deciding whether to show the modal, so the NEXT update is detected.
export function advanceRunVersion(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LAST_RUN_KEY, getAppVersion())
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

export function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
