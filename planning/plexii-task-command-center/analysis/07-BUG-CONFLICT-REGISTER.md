<!-- VERBATIM CAPTURE — received 2026-08-24 late evening, pasted by operator from the
     spec-drafting Claude session. Companion to 00-SPEC-RAW.md; analyzes 06-BUG-SYNTHESIS-RAW.md.
     Verification verdicts on this register live in 08-INTAKE-VERIFICATION.md. -->

# Bug Conflict Register & Proposed Spec Amendments

Companion to: SPEC-001-attention-layer.md · Source: Bug/UX synthesis from transcripts
(rooms, desks, navigation, deletion, memory, tasks, collaboration) ·
Baseline: a92b30cb · branch ryan-command-center ·
Status: Proposed — requires ruling alongside the §7 crossroads docket · Drafted: 2026-08-24

## §0 · Method

Every item in the bug synthesis is classified by its relationship to the Attention build,
not by its severity. A severe bug that does not touch this build is still severe — it just
belongs in a different queue.

| Class | Definition | Disposition |
|---|---|---|
| C1 — Direct conflict | The Attention build is blocked, or will be built on a false assumption, until this is resolved. | Resolve in or before Phase 2. Amendments proposed in §2. |
| C2 — P1 conflict | No effect on P0 self-routing; blocks person-to-person (SPEC-027–031). | Resolve before P1 architecture. Logged as a P1 dependency. |
| C3 — Independent | Real problems, no interaction with this build. | Captured in §4. Ships on its own track. |
| C0 — Motivation, not conflict | Described as a pain, but it is the reason for the build. | No action. Cited as justification. |

Doctrine note: several C1 items imply work outside the issued spec. Per the preservation
doctrine, that work is proposed and priced here, not smuggled into the build. CR-07 (§3) is
the scope ruling.

## §1 · The register

### C1 — Direct conflict (5 items)

**BUG-C1-01 · Desk archive/delete is broken, and its semantics are undefined**
Sources: desk/room deletion bug; "desks currently cannot be deleted"; memory persists in the brain.
Why it conflicts: this is §8-Q5, and it is more blocking than the spec assumed.
SPEC-024 (stale-work nudges) requires distinguishing dormant-but-live from finished. With no
archive state, a completed desk is indistinguishable from an abandoned one — it looks stale
forever. The nudge engine would surface every finished project a user ever had, permanently.
That is not a degraded feature; it is an unshippable one, and it is the feature most likely
to define whether users trust the layer.
SPEC-017's saved lenses (stale-work view, daily execution) have the same dependency.
SPEC-037's cascade is downstream of it entirely.
Also: work_items carry sourceRef to a desk. If desks can be deleted, referential integrity
is a schema question that must be answered at SPEC-002, not at P2.
Verdict: blocking for SPEC-024, SPEC-017, and SPEC-002's reference design. Not blocking for
SPEC-001/005.

**BUG-C1-02 · No canonical desk state model**
Sources: desks exist as active / stale / completed / archived / shared / generated /
agent-active / memory-only, with no modeled distinction.
Why it conflicts: Attention's entire job is deciding what appears in front of a person.
Every filter, lens, count, and nudge in SPEC-014–024 needs a ground truth for "is this desk
live?" There is currently no such field.
Absent one, the build invents its own — which means Attention becomes the de facto owner of
desk state. That directly violates the "aggregates by reference, does not own" constraint in
§1.2, and it is how the layer quietly becomes a second system of record.
Verdict: blocking. This is the deepest of the five, because the failure mode is architectural
rather than functional.

**BUG-C1-03 · Shared desks route to "All Desks" instead of "Shared"**
Source: shared desks received from Michael appear in the wrong tab.
Why it conflicts — and why it is useful: this is a node-enumeration filtering bug. A set of
nodes with a distinguishing property is being enumerated by code that does not check that
property. That is precisely the Class B / Class C failure mode SPEC-004 exists to prevent
when kind: 'work_item' lands. This bug is a live, pre-existing instance of the risk the
305-site census is guarding against.
Recommendation: fix it inside SPEC-004's classification pass rather than separately. It gives
the census a ground-truth test case — if the classification method finds this bug
independently, the method is validated before it is trusted with a third node kind. If it
misses it, the method is wrong and we learn that cheaply.
Verdict: blocking-adjacent. Fold into SPEC-004 as a validation case.

**BUG-C1-04 · Room → desk click-through is unreliable; no back-to-desk path**
Sources: "clicking into a room should take the user to the desk"; back-to-desk button requested.
Why it conflicts: click-through-to-source is the single most-used interaction in the
Attention layer. Every work_item, every nudge, every queue row exists to return a person to
where the work lives. The layer's entire value proposition — reference, don't own — depends
on the reference resolving reliably. If that path is unreliable today for desks, it is
unreliable tomorrow for the ~dozen new entry points this build adds.
Scope note: the proposed horizontal Apple-style room→desk layout is a separate redesign and
is not implicated. Only the click-through resolution and the return path are.
Verdict: blocking for SPEC-014/017 acceptance. The narrow fix, not the redesign.

**BUG-C1-05 · The AI layer labels created desks as "tasks"**
Source: AI-created desks were labeled "tasks," indicating a schema-language mismatch.
Why it conflicts: this is vocabulary contamination inside the exact subsystem SPEC-008 extends.
The spec's §1.1 quarantine assumes "task = desk" is confined to code identifiers. This bug
proves it has leaked into the AI layer's prompts, tool schemas, or output labels — the
surface that will shortly be asked to classify intent and create work_items.
If the model's context says "task" meaning desk while the new tool surface says work_item
meaning to-do, classification errors are not a tuning problem; they are guaranteed by
construction. The model will conflate the two, and the failure will be intermittent and hard
to trace.
Required: an audit of every AI prompt, tool definition, function name, and output schema for
"task" usage, with each occurrence resolved to desk or work_item before SPEC-008 is
architected.
Verdict: blocking for SPEC-008. Cheap to fix, expensive to discover late.

### C2 — P1 conflict (2 items)

**BUG-C2-01 · Sync inconsistency and 7–8s latency**
Sources: stickies sync, slide decks and browsers do not; ~7–8s collaboration delay.
P0 self-routing is local and unaffected. But SPEC-027–029 put routed items, acknowledgments,
and loop-closure notifications on this loop. An acknowledgment that takes eight seconds to
appear reads as a failure, and the closed loop is the feature that makes routing worth having.
More importantly: Phase 2 must now prove two things about the sync layer, not one. The
existing residual — does the server pass new node columns and kinds through opaquely — plus
a new question: is the loop reliable enough to carry state that a person is waiting on?
Partial widget sync suggests per-type handling somewhere in the path, which is exactly the
shape of thing that would also reject an unfamiliar node kind.
Verdict: P1 blocker. Raises Phase 2's scope. Does not delay P0.

**BUG-C2-02 · AI-generated desks lack lifecycle guardrails**
Sources: AI creates rooms/desks; generated content may be mislabeled, unreviewed, or
instantly cluttering.
Not blocking, but it should share machinery with SPEC-025. Generated desks and AI-suggested
work_items need the identical pattern: confidence score, preview before commit,
accept/dismiss/merge, suppression learning at the source-type level, and a stated reason.
Building two separate guardrail systems for the same problem is how the product ends up with
two different confidence UIs.
Verdict: design together with SPEC-025; build on SPEC-025's schedule.

### C0 — Motivation, not conflict
- Desk multiplication / object permanence. This is the primary objective's justification,
  quoted almost verbatim in §0 of the spec. No action.
- Browser/search increase accumulation. Same. The better capture gets, the more the layer is
  needed.

## §2 · Proposed spec amendments

Three additions and three modifications. All are proposals requiring the operator's ruling.

### New items

**SPEC-042 · Desk lifecycle state model — FOUNDATIONAL, P0-prerequisite**
A canonical, modeled state on desks: minimally active | stale | completed | archived, with
shared, generated, and agent-active as orthogonal flags rather than states. Owned by the desk
subsystem, read by Attention. Resolves BUG-C1-02, unblocks SPEC-024 and SPEC-017.

**SPEC-043 · Source-reference integrity — FOUNDATIONAL, P0**
Defines what happens to a work_item when its sourceRef desk is archived or deleted: does the
work_item archive with it, orphan gracefully, or block the parent action? Answers must land
at SPEC-002, not P2. Resolves the schema half of BUG-C1-01.

**SPEC-044 · AI-layer vocabulary audit — ADDITIVE, P0, blocking SPEC-008**
Audit and resolve every "task" occurrence in AI prompts, tool schemas, function names, and
output labels. Resolves BUG-C1-05.

### Modifications

**SPEC-004** — add BUG-C1-03 (shared-desk misrouting) as a named validation case. The
classification method must independently identify it. Success validates the census before it
is trusted with a third node kind.

**SPEC-014 / SPEC-017** — add click-through resolution to acceptance criteria, with
BUG-C1-04's narrow fix as a precondition. Live verification: a work_item row must return the
user to its source desk, and the return path must work, before the stage closes.

**SPEC-037 (archival cascade + recap)** — reconsider P2. The bug synthesis makes a strong
case that the completion summary is what makes archiving emotionally safe — users hesitate to
archive because they fear losing context, and a recap converts archive from a
destructive-feeling action into a value-preserving one. If desk lifecycle enters scope via
SPEC-042, the recap is its natural companion and arguably belongs at P1 rather than P2.

## §3 · CR-07 — Scope ruling required

The question: does desk lifecycle (SPEC-042, SPEC-043, and the BUG-C1-01 fix) enter this
build's scope, or ship as a parallel prerequisite on its own track?

This is a real crossroads, not a formality. It is scope expansion into a subsystem the issued
spec deliberately did not touch, and doctrine forbids self-granting it.

**Option A — In scope.** Attention owns desk lifecycle as foundation work. Pro: single
coherent effort; the layer and its ground truth land together. Con: materially widens a build
that is already large; delays G4; risks Attention becoming the owner of desk state, which
§1.2 forbids.

**Option B — Parallel prerequisite (recommended).** Desk lifecycle ships as its own small
effort on the fork, gated to complete before Phase 5. Pro: keeps ownership where it belongs —
desks own desk state, Attention reads it. Smaller, independently verifiable, independently
valuable even if Attention slipped. Con: two tracks to coordinate; Phase 5 blocks on an
external dependency.

**Option C — Defer; Attention infers staleness from activity timestamps.** Pro: fastest to
G5. Con: rejected in analysis. Inferred staleness cannot distinguish finished from abandoned,
which produces exactly the permanent-false-positive nudge behavior described in BUG-C1-01. It
also makes Attention the de facto owner of desk state.

**Recommendation: Option B.** It respects the reference-not-own constraint, keeps both
efforts reviewable, and the dependency is honest and dated rather than hidden inside a larger
scope.

## §4 · C3 — Independent track

Real problems with no interaction with this build. Captured so they are not lost; not to be
pulled into the Attention effort.

| ID | Item | Note |
|---|---|---|
| BUG-C3-01 | Widget movement sluggish/resistant on shared desks | Interaction quality; separate from sync correctness |
| BUG-C3-02 | Presence indicator polish (subtle glow around widget) | Design refinement |
| BUG-C3-03 | Horizontal room→desk layout (Apple-style, continuous canvas) | Navigation redesign — distinct from BUG-C1-04's click-through fix |
| BUG-C3-04 | General rooms interaction glitchiness | May share a root cause with C1-03/C1-04; triage first. If it does, it re-classifies. |
| BUG-C3-05 | Navigation mechanism proliferation | Not a bug. A design constraint on this build: Attention adds several new entry points (widget, top-bar count, assistant, ⌘K). It must not worsen the sprawl. Logged as a constraint in the strategy artifact, not as a fix. |

## §5 · Net effect on the roadmap

| Phase | Change |
|---|---|
| Phase 2 | Widened. Adds: reliability assessment of the sync loop (BUG-C2-01), and the AI vocabulary audit (SPEC-044). Existing scope — column passthrough, 305-site classification, ACL — unchanged. |
| Phase 4 | SPEC-002 must now answer SPEC-043 (reference integrity). Small addition, correct placement. |
| Phase 5 | Gains a dependency on desk lifecycle if CR-07 rules B. SPEC-008 blocked until SPEC-044 clears. |
| P1 | Gains a sync-reliability precondition before SPEC-027 architecture. |

Nothing here changes the primary objective, the vocabulary, or Rulings 1–4. The bug synthesis
did not contradict the spec — it revealed that two of the spec's own logged questions (Q5,
delete semantics; and the desk-state assumption implicit in SPEC-024) are load-bearing
earlier than the spec assumed, and it supplied a free validation case for SPEC-004.

Prepared as a companion to SPEC-001-attention-layer.md. CR-07 rules alongside CR-01–06 in a
single pass. Amendments are proposals; the operator owns the cut line.
