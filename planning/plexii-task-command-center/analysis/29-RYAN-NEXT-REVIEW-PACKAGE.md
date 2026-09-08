# 29 — ryan-next review → landing package

**Date:** 2026-09-01 · **Branch:** `ryan-next` (both remotes) · **Audience:**
Michael (review → merge → release) and Caleb (checkout + hands-on).
**State at writing:** merged with main @ 4.2.2 (`9e26b73c`), zero conflicts;
**3,655 unit tests green across 336 files; 0 type errors** on the merged tree.

## What this branch is

Everything since the 4.2.0 handoff: **SPEC-003 (Plexii Meet & the Meeting
Record) complete — M1–M6 — plus its five named follow-up rounds, plus
analysis/27 Phase 4's #16.** Thirteen work commits, DEC-097…110 in the
DECISIONS-LOG (each entry carries what/why/how-verified). ~8.6k insertions
across 149 files before the 4.2.2 merge-back. Michael's 4.2.1/4.2.2 work
(doc pagination, mail scrolling, notarisation) is disjoint from all of it —
the merge was clean and his `tableHeaderRepeat` suite runs green beside ours.

## The commits, in review order

| Commit | DEC | What it is |
|---|---|---|
| `54543b04` | 097 | GAP-019: `bg-[var(--x)]/N` invalid-CSS sweep (117 sites → color-mix) |
| `6e68bb9a` | 098 | **M1** — the Stage (in-meeting notes), the consent handshake over meetingSignal, per-track capture foundation. **Closes a live hole: silent recording.** |
| `4a765e98` | 099 | **M2a** — transcript as attributed segments (both engines), CR-11 local-only meeting audio |
| `a02f55ab` | 100 | **M2b** — the Record: yours/heard/inferred provenance tiers, three renderings |
| `58e7842b` | 101 | **M2c** — desk container, templates, export, CR-13 audio retention |
| `de4d5b99` | 102 | **M3** — commitment extraction with anchors → the Attention confirm stop |
| `3744b5c2` | 103 | **M4** — Recall (segment FTS + assistant grounding pool + citations) + the ⌘⇧T live transcript |
| `b08e95d9` | 104 | **M5** — series identity, prep, "carried from last time", Q14 host knob |
| `19e90635` | 105 | **M6** — Guest Capture (ScreenCaptureKit loopback, CR-12 reduced mode). **Fixes an M2-era seam: the transcribe IPC dropped `forceProvider`.** |
| `044914d9` | 106 | Calls consent — the M1 hole closed for 1:1 PlexiCam calls; `ConversationRecorder` deleted |
| `6c7b0004` | 107 | C5 — the Record widget on the meeting desk + `plexii://` moment anchors |
| `c79de81c` | 108 | Recall over MCP — `POST /mcp` on PlexiAPI, read-only, hand-rolled JSON-RPC |
| `d7b1f84e` | 109 | Q14 — briefs to other attendees over PlexiChat DMs, two-sided opt-in |
| `2e5c4b85` | 110 | #16 — AI-suggested tags (deterministic, vocabulary-grounded) |

## Where review attention pays most

1. **Consent surfaces** (DEC-098, 105, 106): recording/transcription is
   consent-first everywhere now. The invariants: capture-on-answer only; a
   decline is never tapped (choke point `trackRecorder.tap`); no preference
   ever starts a meeting recording; the guest-capture disclosure bar is
   non-dismissible. `tests/unit/m1MeetingStage`, `m6GuestCapture`,
   `callsConsent` pin all of it.
2. **The `forceProvider` seam fix** (`src/main/ipc/index.ts`,
   `ai:transcribeAudio`): before DEC-105, CR-11's forced-local never reached
   main — every per-track wrap-up on a cloud-preference machine errored
   (closed: samples-only, nothing could leak). This touches EVERY meeting
   wrap-up; it is the one diff hunk to read twice.
3. **New listening surface** (DEC-108): `/mcp` mounts on PlexiAPI behind its
   existing auth/loopback/Origin/rebind guards, read scope required, three
   read-only tools. No new port, no new token store. `mcpRecall.test.ts`
   carries the JSON-RPC contract.
4. **Schema deltas** (all additive, all `IF NOT EXISTS`/`ensureColumn`):
   `fb_transcript_segments` (new), `fb_segments_fts` (+triggers+backfill),
   `fb_meetings` +record_json/desk_node_id/series_id/block_id, widget kind
   `'meeting-record'` (old clients hit Canvas's default case). No
   destructive migration anywhere.
5. **Shared-surface touches** outside PlexiMeet: `retrieveSources` (+meetings
   pool), `sourceTarget`/`sourceIdentity` (+meeting), `WeekTimeGrid` (join
   meta + record button), `AttentionConfirmCard` (tag suggestions),
   messaging store (brief ingest, idempotent by ledger).

## Caleb — checkout

```
git fetch origin && git checkout ryan-next
npm install && npm run dev
```

Flags note: in **Settings, enable the Attention / work-items capability**
(the surface most of this rides on). Whisper ("Transcribe & summarise my
1:1 calls") is optional and now consent-asks the other side. Meetings never
auto-record — start one in the room; everyone is prompted. Ten `[TEST]`
seed items may be in Ryan's local DB only; a fresh checkout starts clean.

## What is NOT solo-verifiable — the two-machine QA sheet

Each of these is unit-pinned and one-machine-verified live; the two-party
half needs two signed-in clients: meeting consent handshake (accept /
no-transcript / decline / late-join) · the ⌘⇧T live pane while someone
speaks · Stage PREP in a real joined room · guest capture during a real
external call · calls consent (request / standing-pref auto-answer /
decline / mid-call stop) · brief DM sender→recipient (ask-toast → file →
stop-following).

## Deliberately deferred (named, not forgotten)

External-calendar series matching (manual merge only) · briefs delivery
beyond DMs · #17 home widgets (needs shaping) · taxonomy ruling + GAP-017
(need queue-usage data) · live transcript for non-initiators.
