# 28 — SPEC-003 (Plexii Meet & the Meeting Record): phased build plan

**Date:** 2026-09-01 · **Branch:** ryan-next · **Status:** PLAN — nothing
built. Every claim below about current code was verified by reading it.
**Numbering note:** SPEC-003's internal DEC-020…024 collide with the repo
DECISIONS-LOG (already at DEC-097). They are treated here as spec-local
rulings, cited as **S3-DEC-0xx**; repo log entries keep their own sequence.

---

## 0. What actually exists today (the recon)

More is built than SPEC-003 assumes — and one piece is built *wrong* for it.

| Piece | State |
|---|---|
| **Live rooms** | Real WebRTC mesh (`stores/meetingRoom.ts`): roster with accountIds + names, one peer connection per member, screen share, socket signalling. Plexii genuinely IS the room — the spec's core structural claim holds in code. |
| **Recording** | `ConversationRecorder` MIXES local mic + every remote stream into ONE track → MediaRecorder blob. |
| **Transcription** | Provider-aware and BOTH paths exist: cloud (OpenAI Whisper API) and **on-device Whisper** (`voiceNote.transcribe`, `transcribeRecording.ts` decodes to mono-16k for local). Cloud is the effective default. Post-hoc only — the blob is transcribed after the call ends. |
| **Diarisation** | An AI *guess*: Sonnet labels "Speaker 1…4" from a plain, timestamp-less transcript by conversational pattern. |
| **The record** | `db/meetings.ts`: `{id, title, transcript: string, summary, action_items_json}` — transcript is ONE FLAT STRING. No segments, no timestamps, no speakers, no confidence. |
| **Container** | A meeting gets a **Files folder** (`ensureMeetingFolder`) holding the transcript doc; plus the separate meetings table. Not a desk. |
| **Post-meeting flow** | `wrapup.ts`: transcribe → AI summary + `ActionProposal` deliverables (`parseMeetingDeliverables`) → review panel (`ProposalCards`) that applies to desks/files. |
| **Consent** | **None.** Any one participant flips "Transcribe & summarise" and every stream is recorded. `setTranscribing` does not `sendSocketMessage` — the other participants are NEVER told. The rose "transcribing" badge renders locally only. |
| **Booking metadata** | `TimeBlockMeeting {roomId, invitees, joinUrl, location, agenda}` and `seriesId` + recurrence on time blocks — prep and series identity have real anchors for natively-booked meetings. |
| **Attention plumbing** | Confirm card w/ batch secondaries, people directory + `scanPeople`, `source_url` deep links (DEC-091), NoticeToast, R008 undo — the entire §3.6 routing target exists. DEC-091 explicitly deferred wrapup-mention wiring "to Phase 4's transcript rebuild" — this plan is that rebuild. |
| **Templates** | Desk template system exists (`applyTemplate.ts`, New Desk picker). §3.5 needs no new mechanism, as the spec hoped. |
| **Audio retention** | Today the blob is transcribed and **not archived** — current behaviour is already Granola's (audio effectively discarded). CR-13's 30-day option is NEW storage work, not a privacy fix. |

## 1. Conflicts with current code (each needs a decision, all proposed below)

**C1 — The mixed track throws away the host advantage.** ★ the big one.
The recorder mixes everyone into one track, which is why diarisation is a
model guessing "Speaker 1…4". But the mesh already holds **one
MediaStream per participant, each bound to a known accountId**. Record
per-track and diarisation for native meetings stops being a problem at
all — every word is attributed *by construction*, better than anything
Fireflies can do. This is a capture-format decision that must land before
any transcript schema exists (M1), or we transcribe blobs we can never
attribute. It also makes S3-DEC-024's decline-exclusion trivial: don't tap
that participant's stream.

**C2 — Cloud transcription is the effective default; CR-11 rules local.**
Both engines exist, so this is a default-flip plus a consent gate, not an
engine build. Cloud stays available only behind a per-meeting, named
("sends audio to OpenAI") opt-in. CR-11's cost is already half-paid.

**C3 — The transcript is a flat string; every provenance promise needs segments.**
S3-DEC-021 (`heard` requires an anchor) is impossible against
`transcript: string`. New `transcript_segments` (speaker accountId,
startMs/endMs, text, confidence) is the load-bearing schema change.
Whisper (both providers) can return timestamps — the current pipeline
flattens them away.

**C4 — The consent hole is live TODAY.** One participant can silently
record everyone; nobody else is told. Independent of SPEC-003's timeline,
this is a liability in the shipped product and is scheduled first (M1
opens with it).

**C5 — Folder + meetings table vs "the Record lives on the meeting desk" (S3-DEC-020).**
Adopt the desk/node container for NEW meetings in M2 (sharing/ACL/search/
staging all free, exactly the spec's rationale). The legacy meetings table
becomes a read-only index; migrate old records on-open, not in bulk. The
99-line table is young enough that this is cheap now and expensive later.

**C6 — ProposalCards vs the Attention confirm step.** Split by kind:
extracted **commitments** route through the confirm card (§3.6);
**artifact deliverables** (docs, tables, widgets) stay on ProposalCards,
which already does that well. One meeting, two well-matched doors — not a
replacement.

**C7 — The outbound-ask collides with the SPEC-027 boundary.** §3.6 wants
other-owned commitments "offered as an outbound ask." Routing to people
is deferred (DEC-088 stated the boundary honestly: a mention references,
it doesn't send). Ruling proposed: other-owned items arrive unchecked
with the owner as a person MENTION; the ask/sending arrives with SPEC-027.
The spec's Guest-Capture rule (never offer the ask) becomes moot until then.

**C8 — No streaming transcription exists.** The Stage's ⌘⇧T live
transcript needs incremental on-device transcription — real work. But
**mark-moment does not need it**: anchors are millisecond offsets against
the recording clock; the text arrives post-hoc and the anchors resolve
then. So M1 ships mark-moment without a single model call, and the live
transcript view is deliberately deferred to M4 (with ⌘⇧T showing an
honest "transcript arrives after the call" state until then).

**C9 — Two live surfaces exist** (`MeetingOverlay` + `PlexiMeetView` +
`CallOverlay`). The Stage should be ONE pane grafted into MeetingOverlay;
PlexiMeetView's record-a-message path is untouched. Building the Stage as
a fourth surface would recreate Fireflies' navigation complaint in-house.

**C10 — The A-04 wire-name freeze has nothing to freeze against yet.**
No `FlowActionType` registry exists under that name. The five names
(`start-recording · mark-moment · enhance-record · extract-commitments ·
brief`) are reserved in this doc; they freeze when the flows layer lands.

## 2. What the codebase makes CHEAPER than the spec expects

- **Diarisation → exact attribution** via per-track capture (C1). The
  spec budgets for "one-click speaker correction"; native meetings may
  barely need it.
- **§3.6 routing is nearly free** — confirm card, batch filing, people
  mentions, R008 undo, toasts, and `source_url` (a commitment can carry a
  deep link to its meeting + moment) all exist.
- **Prep (M5) is assembly, not construction** — invitees, agenda, desk,
  `relatedness()`, people directory, past-block guest ranking all exist.
- **`meeting_series` for native bookings is `seriesId`**, already minted
  by recurrence. External-calendar heuristics can wait indefinitely.
- **Provenance rendering is the house accent-vs-ink doctrine** the
  operator already ruled for capture (DEC-028) — same rule, third tier.
  And the ink scale it depends on was just made whole (DEC-096).
- **Templates and export**: desk templates exist; export = md/json/wav
  from data we hold locally.

## 3. Genuine gaps (things NEITHER the spec nor the code solves yet)

- **G1 — macOS system-audio capture for Guest Capture (M6).** Electron
  cannot cheaply capture *other apps'* audio on macOS; it needs
  ScreenCaptureKit audio (recent Electron, permission-gated) or a virtual
  audio driver. Mic-only fallback hears only one side. The spec
  underweights this; M6 starts with a spike, and mic-only ships as the
  honest floor ("Plexii can hear you, not them" named in the header).
- **G2 — Local Whisper streaming** (for the eventual live transcript):
  chunked incremental decode, CPU/battery cost during calls, model-download
  UX at install. Deferred by design (C8) but real.
- **G3 — MCP exposure (M4):** no MCP server exists in the app today —
  Recall-over-MCP is a new server surface, not a route on an existing one.
- **G4 — Per-track recording of N participants** multiplies MediaRecorder
  instances and file size; needs a small capacity guard (mesh is already
  small-room by design, so bounded).
- **G5 — Retention machinery** (CR-13): a sweeper, per-meeting override,
  decline-exclusion at write time. New but small; today's behaviour
  already equals the strictest setting.

## 4. The phases

Named **M1–M6** (analysis/27 already owns "Phase 1–5" for demo feedback).
Each is a shippable round with the usual gates: pins, live CDP
verification, DEC entry, dual-push.

### M1 — The Stage, honest consent, and the capture format  *(spec P1 + C1 + C4)*
**DONE — DEC-098** (two-machine consent QA still owed by the operator; the
PlexiCam 1:1 calls surface carries the same consent hole as a named
follow-up).
The no-AI phase, and the one that fixes a live liability.
- **Consent handshake** over the existing meeting socket: starting
  recording prompts every participant (accept / decline /
  accept-without-transcript); the header names the state in words for
  everyone, continuously; recording is off until started; no calendar
  rule can start it (already true — keep it true by pin).
- **A decline is honoured by construction**: that participant's stream is
  never tapped.
- **Per-track recording** replaces the mixed track (one recorder per
  participant stream, offsets on one shared clock). Mixed capture remains
  only as the Guest-Capture mode's format later.
- **The Stage pane** inside MeetingOverlay: blank notepad, your words
  saved verbatim; `⌘⇧M` mark-moment (clock offsets, no model); `⌘⇧A`
  reserved; `⌘⇧T` present but honest ("transcript arrives after the call").
- Won't work yet, on purpose: live transcript, Enhance, extraction.
- **Ship test:** two-machine QA (the synced-docs session pairs with this).

### M2 — Transcript truth + the Record  *(spec P2 · C2 C3 C5)*
**M2a (transcript truth) DONE — DEC-099**: segments from both engines,
per-track attributed pipeline, CR-11 local-only meeting audio + in-meeting
model warmup, `fb_transcript_segments` with delete cascade. **M2b (the Record
object, Enhance with the anchor-or-downgrade contract, three renderings
with provenance) DONE — DEC-100.** M2c remains: node container (C5),
templates, export, audio retention (CR-13).
- `transcript_segments` schema (speaker accountId, start/end ms, text,
  **confidence required**); per-track transcription through the existing
  provider layer, merged on the shared clock; **local default, cloud only
  behind per-meeting named consent** (C2).
- The **meeting node** becomes the container for new meetings (Record,
  Transcript, Notes widgets on it); meetings table goes read-only legacy.
- **Enhance** merges notes + segments into the Record object
  (`yours / heard / inferred`; a heard span without a resolvable anchor is
  auto-downgraded — S3-DEC-021 enforced in the data layer, pinned).
- Three renderings, Commitments default; provenance CSS (full ink / rule +
  hover timestamp / lighter ink); templates via desk templates; **export**
  (markdown, JSON, audio) ships here, plus retention (CR-13: 0/7/30/90/keep,
  decline = never written, zero = at Enhance).

### M3 — Routing into Attention  *(spec P3 · C6 C7)*
- `extract-commitments` returns spans with anchors (or it is all inferred
  — the extractor contract is the test).
- The confirm step gets its **batch variant** (checkbox list over the
  existing card; same pills, same accents). Other-owned items unchecked,
  owner as person mention; no sending (SPEC-027 boundary, C7).
- Every filed item carries `source_url` → meeting node + moment anchor
  (DEC-091's column, now carrying meetings too).
- Host's **To Know brief** (machine-authored, DEC-014-exempt); Q14's
  per-series opt-in for others.
- Artifact deliverables stay on ProposalCards (C6).

### M4 — Recall + the live transcript  *(spec P4 + deferred half of C8)*
- Corpus query over segments (FTS + the existing retrieval layer), every
  answer with speaker + timestamp + Thread link; ACL = node ACL.
- Live transcript behind ⌘⇧T via chunked local decode (G2 spike first);
  if the spike says the battery cost is ugly, live view stays post-hoc
  and the phase ships Recall alone — Recall is the value.
- MCP exposure (G3) only if the spike shows a cheap path; otherwise it
  moves to its own round.

### M5 — Prep + series  *(spec P5, Q12)*
- Staging assembles: attendees + last-discussed, open work_items
  mentioning them, agenda from booking, unresolved commitments from the
  previous instance (`seriesId`).
- **"Carried from last time"** section atop Commitments — the spec is
  right that this is the crown jewel, and `seriesId` makes it cheap for
  native bookings. External-calendar series matching: deferred, manual
  merge only.

### M6 — Guest Capture  *(spec P6, CR-12 · G1)*
- Starts with the ScreenCaptureKit spike (G1). Mic-only is the floor and
  says so. Reduced mode exactly per CR-12: no roster handshake, the
  non-dismissible disclosure line, `Speaker 1/2` labels, no outbound-ask
  path ever.

## 5. Sequencing rationale

M1 before everything because (a) the consent hole is live, (b) the
capture format (C1) silently decides whether M2's schema can ever
attribute speech, and (c) it's the phase that determines whether people
type during meetings — the highest-signal input everything downstream
consumes. M2/M3 are the product ("something happens after"). M4–M6 are
each independently droppable without weakening M1–M3, which is the
definition of a good tail.

## 6. Open items for the operator (answers change the plan, not block M1)

1. **C7 ruling** — other-owned commitments as unchecked + mention (my
   proposal) vs holding the whole outbound-ask surface for SPEC-027?
2. **CR-11 confirmation in code terms** — flip the default to local and
   gate cloud behind per-meeting named consent, accepting the accuracy
   gap on day one?
3. **C5 confirmation** — new meetings on desk/room nodes, legacy table
   read-only (no bulk migration)?
4. Whisper model size/download UX at install (M2) — pick at M2 kickoff.
