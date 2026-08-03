# PlexiDesk 4.0 — 10-user org test harness

This spins up a real, isolated organisation with ten member accounts so you can
test every multi-user surface end to end: chat, meetings, on-desk meets, live
collaboration on desks / office docs / widgets, widget sharing across desks,
multi-user desks, cross-member Drive file sharing, and 2-player AI.

Everything runs against a **local signal server on this machine** with its own
database under `tools/test-org/.state`. It touches none of your real or
production data, and `stop` tears it down. This is deliberately not the deployed
prod signal, so you get the latest 4.0 code (including the cross-member file sync)
without a production deploy or ten real accounts polluting prod.

## Prerequisites

The app build and the signal server are driven for you. For **2-player AI** to
work you must export your Anthropic key before `setup`, so the local signal's
credit proxy can serve every account. The key is passed straight to the signal
process and is never printed, logged, or written to disk by the harness.

```bash
export ANTHROPIC_API_KEY=sk-ant-...      # only needed for the AI features
```

Every account also gets a generous trial AI credit balance automatically, so no
per-window key paste is needed.

## Commands

Run these from `projects/focusbuddy`:

```bash
node tools/test-org/run.mjs setup          # boot signal, make org + 10 users, seed, build, print logins
node tools/test-org/run.mjs open 3         # launch the first 3 windows (default 3)
node tools/test-org/run.mjs launch 5       # launch just one account (1..10, or an email/first name)
node tools/test-org/run.mjs creds          # reprint the 10 logins + org id + signal URL
node tools/test-org/run.mjs status         # what's running
node tools/test-org/run.mjs stop           # close all windows + stop the signal server
```

Each window is a real PlexiDesk instance with its own isolated profile, so it
stays signed in to its own account. Run `open` again after `stop` to bring
windows back; the accounts and their data persist under `.state`.

## The accounts

One organisation, **Plexi Test Org**. Ava is the owner, the rest are members.
The password is the same for all ten (printed by `setup`/`creds`, default
`TestPlexi!2026`).

```
ava@testorg.local     (owner)      finn@testorg.local
ben@testorg.local                  gia@testorg.local
chloe@testorg.local                hugo@testorg.local
dan@testorg.local                  isla@testorg.local
eve@testorg.local                  jae@testorg.local
```

The org starts seeded with a shared **Company HQ** room, a **Team Desk** inside
it, and a **Team Charter** document, so the moment two windows sign in they are
already looking at the same shared workspace.

## Test playbook

Open two or three windows (`open 3`) and sign each into a different account. Put
them side by side. Then work through the surfaces.

**First, in every window, switch the active org to "Plexi Test Org"** using the
org switcher at the top of the sidebar. New accounts start in their own Personal
org, and all the shared content lives in the test org, so a window only sees and
shares the team workspace once it is on Plexi Test Org. The account is already a
member; this is just selecting which org is on screen.

**Desk collaboration and multi-user desks.** In Ava's window open the shared Team
Desk and add a widget or edit its contents. Within a sync cycle it appears in
Ben's window on the same desk. Create a brand-new desk in one window and confirm
it shows for the others. This is the near-live org workspace sync carrying desks
and widgets between members.

**Widgets, and widget sharing across desks.** Add note, table, and other widgets
on the shared desk and confirm they render for every member. Move a widget to a
different desk and confirm the move syncs. Wire two widgets together (a connection
or a desk agent) and confirm the wiring travels with the desk.

**Office document collaboration.** Open the shared Team Charter (or make a new
doc) and type in one window. Edits converge in the other windows. This exercises
the document sync path and, where enabled, live co-editing.

**Cross-member Drive files.** Import a file into the Drive in one window (a PDF or
image works well). It replicates to the other members' Drive, bytes and all, so
they can open it. This is the file sync added in 4.0 — the piece that also feeds
each member's brain.

**Chat.** Open PlexiChat and use the org channels plus direct messages between
accounts. Send messages, reply in threads, react, mention a teammate, and confirm
they arrive live in the other windows.

**Meetings and on-desk meets.** Start a meeting from the calendar or from a desk
(an on-desk meet), have another account join, and confirm both see each other in
the call. Try sharing a desk artifact into the meeting.

**Presence / People Map.** With several windows signed in, the People Map and
presence indicators should show the other members as online.

**2-player AI.** With `ANTHROPIC_API_KEY` exported at setup, use the AI features
that involve more than one participant — @-mentioning the AI in a shared chat,
running a desk agent that others can see act, or any two-party AI flow. The AI
runs through the local signal's credit proxy, so it works for every account.

## How it fits together

The signal URL is baked into the app at build time, so `setup` builds `out/`
pointed at the local test signal (`http://localhost:8795`). That means running
the app from `out/` (e.g. `npm run dev` or `electron .`) talks to the test signal
until you rebuild normally. Your packaged Desktop app is a separate bundle and is
unaffected. To return a dev build to production, just run `npm run build` again
without the harness.

Multiple windows coexist because each launches with its own `FB_TEST_USER_DATA`
profile, which is also how the app's single-instance lock is keyed.

## Caveats

The conflict policy on cross-member sync is last-write-wins, so simultaneous edits
to the very same field resolve to whoever wrote last rather than merging. The
environment lives only on this machine while the harness is up; it is for testing,
not for inviting a remote teammate. Ten real Electron windows at once are heavy on
memory, which is why the default is a few windows plus on-demand launching.

## Reset

`stop` closes everything but keeps the data. To wipe the org, accounts, and all
window profiles and start clean, stop first and delete the state directory:

```bash
node tools/test-org/run.mjs stop
rm -rf tools/test-org/.state
```
