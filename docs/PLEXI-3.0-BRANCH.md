# Plexi3.0 Branch — What Changed and How It Works

This branch implements the week-one and mid-tier fixes from docs/PLEXI-REVIEW-2026-07.md, the July 2026 six-reviewer audit. This document is the developer guide to the new subsystems: what each one is, where it lives, why it is shaped the way it is, and what deliberately remains open. Read the review doc first for the findings these changes answer.

## Documents trash (was: fake "Move to trash")

The editors' Move to trash used to run a raw `DELETE FROM documents` while the UI implied recoverability. It is now a real two-stage delete, mirroring the Drive's fb_files trash.

The `documents` table gains a nullable `trashed_at` column (migration in src/main/db/database.ts, added via ensureColumn so existing databases upgrade in place with no data loss). `trashDocument` sets it, `restoreDocument` clears it, and `deleteDocument` remains the only hard delete, now also pruning any `fb_files` Drive reference (kind 'doc') so no dangling row survives a purge. Every read path treats a trashed document as absent: `listDocuments`, the global search title pass, semantic retrieval (the embedding is deleted on trash and re-created on restore), and all five filed-document queries in src/main/db/files.ts.

The IPC surface keeps the old name for the soft path so callers did not need a rename: `documents:delete` now trashes, and `documents:listTrashed`, `documents:restore` and `documents:purge` are new. In the renderer, the documents store's `remove()` trashes and records an entry on the shared action history (so the UndoToast offers undo, and Cmd+Z works), `restore()` brings a document back, and `purge()` is called only from the Trash section in DocumentsView, which is the only place "Delete forever" exists.

One deliberate cloud rule: trashing does not push a cloud delete. The cloud copy is forgotten only on purge. This keeps restore working across the cloud mirror; the cost is that a trashed document still exists server-side until purged, which is the correct trade for a recoverable trash.

## Shared prompt dialog (was: fourteen dead window.prompt calls)

Electron does not implement window.prompt; it returns null silently. Fourteen call sites relied on it, so Rename in all five editor menu bars, Insert link, map edge labels, the sidebar share-link entry, block-template naming, the StreamDeck full-page slot picker and two clipboard fallbacks silently did nothing.

The replacement is src/renderer/src/components/plexi/PromptDialog.tsx. `promptText(request)` returns a promise resolving to the entered string or null on cancel, the same contract window.prompt had, so call sites ported mechanically. `showCopyFallback(title, text)` covers the copy-by-hand flows. The host component `PromptDialogHost` is mounted once per renderer root, in App.tsx and PlexiOfficeApp.tsx, because the PlexiOffice build is a separate root that reuses the same editors.

The dialog carries the semantics the review's modal audit found missing everywhere: role dialog, aria-modal, initial focus with select-all, a Tab trap, Escape cancels, Enter confirms (Cmd+Enter in multiline mode). It is intentionally the seed of the shared Modal primitive; new dialog work should extend this component family in components/plexi rather than hand-rolling another fixed-inset-0 overlay.

## Quick-create completion

The quick-create store (stores/quickCreate.ts) had consumers wired in six module views but the palette only registered three commands. The palette now registers every createable type. Reports, forms, apps, sign requests and mail go through the pending-request store, with new consumers added to PlexiSignView (opens the composer) and MailView (opens compose once the account is loaded, and drops the request when no account is connected because the setup form is showing). Office files skip the store entirely: New document / New spreadsheet / New presentation call `createBlank` and open the editor directly, because a blank file can exist immediately.

## Global shortcuts overlay

Cmd+/ outside the editors opens ShortcutsOverlay.tsx, which documents the global bindings and generates the canvas quick-add rows from WIDGET_SHORTCUTS and WIDGET_CATALOG so the panel cannot drift from the real key handlers. The document editors keep their own Cmd+/ panels; the App-level listener only acts on presses no editor claimed (it checks defaultPrevented). Rebindable quick-add keys shipped in the second wave (see below): lib/keymap.ts holds the overrides and the overlay is the remap UI.

## Onboarding and settings

FirstRunOnboarding's API-key step now reads as genuinely optional in plain language, with a real skip button carrying a stable testid (the e2e helpers click it). The tour grid gained Chat/calls/meetings, People Map, and Vault & Sign tiles plus a line about the org switcher; keep this grid in step with the live IA when segments change.

SettingsPanel now shows the everyday set (Appearance, Theme studio, Account, Organisation, AI keys, Backup, Privacy and help) and collapses Sounds, AI model routing, Haptics, Templates, Documents sync, Navigation and Voice under one Advanced toggle, closed by default. The dev tier-forcing block stays where it was because it only renders in dev builds. The panel widened to w-96 and the footer note was raised from 10px. The full type-size raise across the panel is part of the token conversion work, still open.

## Global search categories

searchAll (src/main/db/search.ts) now also queries time_blocks (title, org-scoped, hit carries startMs and routes to Calendar), fb_meetings (title, summary and transcript, so a decision buried in a transcript is findable) and fb_sign_requests (title and body). SearchHit gained the types event, meeting and sign, rendered and routed in CommandCenter and PlexiSearchView.

Mail and Chat are still not covered, on purpose. Mail is a live IMAP view with no local message store, and chat history lives on the signal server. Both need real infrastructure (IMAP SEARCH or local mail indexing; a server-side search endpoint for chat) rather than a LIKE over SQLite. This is the remaining piece of review finding 3.

## Document version history

doc_snapshots is the canvas_snapshots pattern applied to office files (src/main/db/docSnapshots.ts). Capture happens on the main-process save path inside the documents:update handler, so every doc type accrues history with no per-editor wiring. Automatic captures are gated to one per five minutes per document and deduped on identical bodies; labelled captures bypass the gate, which is how restore stays reversible (it records "Before restore" first). History is pruned to the newest 50 per document, and the table cascades on document delete.

The UI is one shared panel, DocHistoryPanel.tsx, opened from File > Version history in all five menu bars through a small zustand store (no prop drilling through five editors), with the host mounted in both renderer roots. Restore reloads the open editor through the documents store.

## Task list at scale

AllTasksView mounts the first 120 rows and reveals more in 120-row chunks via an IntersectionObserver sentinel. Every task remains reachable by scrolling; the cap resets when the filter, sort or search changes. This is deliberately dependency-free rather than react-window; if row recycling is ever genuinely needed (tens of thousands of rows), swap the sentinel for a windowing library at that point.

## Smaller fixes in this branch

OrgSwitcher carries full menu semantics (aria-haspopup and expanded, role menu items, arrow-key and Home/End navigation, Escape closes and refocuses the trigger). The calendar month view shows a one-line hint when nothing is scheduled anywhere. The last nine auto_fix_high icons became auto_awesome. All 21 hover-only control groups also reveal on group-focus-within, so row actions are keyboard-reachable. The Footer's Help and support link already existed and was kept; the review's "no help entry point" finding was overstated on that point.

## The local-first wave (second batch on this branch)

Everything below was built to be testable signed out, per the operator's decision to keep their real account away from the branch until merge.

The AI now acts across the whole suite. Five new ActionProposal kinds (edit-document, set-cell, schedule-event, compose-mail, post-chat) extend the approve-then-apply chain beyond the canvas, designed to the two owner agents' advisories: the applier switch is now compile-time exhaustive, create-document and create-task register their real ids for same-batch symbolic references, the system prompt gained a current-time fact plus documents and chat-conversation context blocks (the latter mirrored from the renderer over ai:setConversationSnapshot), and generateDocument's missing context-window stop-reason guards were fixed. Mail and chat proposals are drafts by construction: there is no send field in the schema, the executors open pre-filled composers, and hard rule 10 forbids implying anything was sent. AI document edits save with an "AI edit" snapshot label so Version history distinguishes them from typing.

Calendar gained repeating blocks (daily, weekly, monthly) materialised as real rows to a rolling 60-day horizon by timeBlocks.ts, with scope-aware delete (this occurrence, or this-and-future which also stops the series), a Repeats select in the week-grid composer, and desktop reminders five minutes before each planned block (lib/blockReminders.ts). Time-block create and delete now record on the shared undo timeline.

The reported desktop blink and stale-table bugs were traced by a code investigation to six causes and the top five are fixed: sync no longer re-applies this device's own echoed items (rev comparison in applyRemote) and refreshes the desk in place instead of clearing it; widget keys no longer carry layoutVersion, so pin/arrange/eject stop remounting every widget and reloading every webview; updateCells reconciles against live state instead of a stale snapshot; main-process row writers (flows, forms, REST API, templates) announce tables:rowsChanged so cached tables refetch; and the native window background follows the theme instead of flashing cream over dark.

Chat gained @mentions: highlighting in message bodies (accent chip when you are named), a member-handle autocomplete in the composer, and a cut-through notification when a message mentions your handle. Mail gained new-mail desktop notifications (batched per fetch, silent on the first fetch of a run) and the recent inbox page now appears in global search as a mail category, honestly scoped to what has been fetched. The canvas quick-add keys are now rebindable from the Cmd+/ overlay (click a chip, press a letter; Backspace disables; localStorage-persisted via lib/keymap.ts). Destructive confirms for vault entries, connected apps, dashboard resets, deck resets and Trash purges moved from native chrome to the styled confirmDialog in the shared primitive; the vault delete deliberately stays confirm-only because an undo closure would keep the decrypted secret alive.

Finally, all four editors can embed live desk widgets: Insert > Widget from a desk opens a picker, and a read-only live card (real text, checklist or table rows; an honest "no longer exists" for deleted widgets) lands as a Tiptap node in docs, a widget element in slides and designs, and a widget shape in drawings. Static exports emit a labelled frame rather than pretending to inline live content, and old documents open unchanged.

## Still open from the review, in priority order

The sync ladder is untouched and remains the strategic block: extend workspaceSync beyond nodes and widgets, then cross-member org sync, then web/mobile with push. Mail OAuth and multi-account, TURN for calls, AI action-vocabulary widening (consult ai-proposal-owner and proposal-applier-owner first), chat mentions and channel semantics, calendar recurrence and reminders, the unified notification center, per-seat billing, the shared Modal primitive adoption sweep across the 66 overlay components, the stone-* token conversion of the top ten files, and internationalization. Mail OAuth/multi-account remains blocked on the operator's Google Cloud credentials, and full mail search needs a local index (the recent-inbox cache is a stopgap). Chat search still needs a server endpoint. Keyboard-only mail triage is the remaining power-user ask.
