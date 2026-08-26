# CR-09 — Contextual Attention: objects, scopes, the plan boundary, and the menus

**Registered 2026-08-26 · Status: ANALYSIS — brainstorm-ready, NOTHING BUILT.**
Operator directive: formalize before solving; architecture + QA gates before any
deploy. This document is the formalization: the sharp questions, what the
existing substrate already answers, the design space with tensions named, and
the specific decisions the brainstorm must produce.

---

## 0. The one-sentence version

**How does a thing in the workspace (widget, desk, room) point at the attention
it demands, how does attention filter by where you are, and where does an
accumulation of attention become a plan — without Attention ever becoming the
container?**

That last clause is the standing anti-goal (F006, analysis/20 #1) and the
razor for every option below.

## 1. The four threads (untangled)

The operator's two paragraphs braid four separable problems:

| # | Thread | Essence |
|---|---|---|
| T1 | **Object-marking** | Select a widget → one action creates a DETERMINISTICALLY-named attention item about it ("intelligent" = the system knows what the thing is; zero AI) |
| T2 | **Scoped attention** | Desk-level view of "what needs me HERE", widen to room, global stays the page; an Attention widget dropped on a desk auto-scopes |
| T3 | **The plan boundary** | "Attend to this whole desk" — item, signal, or plan? Where does desk+room attention accumulation end and a plan begin? |
| T4 | **Menu IA** | The desk-canvas and widget context menus are overgrown (widget menu: ~20 entries, 4 submenus); T1's entry point needs a designated home in them |

T1–T3 are one architecture conversation (they share the primitives). T4 is a
UX/IA track that merely HOSTS T1's button — it can move on its own schedule.

## 2. What the substrate already answers (leverage, not construction)

Nearly everything needed already exists — CR-09 is mostly COMPOSITION:

- **Items already point at things.** `work_item` carries `parent_id` (its
  desk — DEC-023 files captures onto the open desk today) and **`source_type`
  + `source_ref`** — synced, renderer-emitted manifest columns that nothing
  user-facing populates yet beyond `'note'`. A widget-mark is
  `sourceType:'widget', sourceRef:widgetId` — **zero schema change**.
- **The one confirm stop IS the assumption-correction mechanism.** DEC-019's
  card shows a pre-picked class the user can flip with one arrow. A per-kind
  default ("Slack → follow up", "doc → review") is exactly a pre-pick — the
  existing card absorbs T1's "general assumptions" with no new UI concept.
- **One code path holds.** Marking = `workItems.create` with a prefilled
  draft. No new entity, no new write path, no CI-lock interaction.
- **Scope filtering is a pure predicate.** Items know their desk; a desk
  knows its room chain. `attentionQueues` gains `scopeFilter(items, scope)` —
  renderer-only, trivially unit-testable.
- **The scoped surface exists.** The ONE Attention widget (DEC-019c, sections
  slider) is already placeable on any desk; a scope control (This desk /
  Room / Everything) is a widget-config field, not a new widget.
- **"Attend to the whole desk" half-exists.** The feeders already surface a
  desk's due/stale state AS attention — computed, one-directional. What's
  missing is only the MANUAL "I say this desk needs me" gesture.
- **Open-back machinery exists.** Attention rows already open their desk;
  `WidgetFocusMode` already opens a widget standalone. A `sourceRef` open =
  desk + focus that widget (or straight to focus mode).

## 3. The design space, with tensions

### Q1 — Object-marking (T1)

**Proposed shape: "mark = a capture preset."** The widget menu's new
**Attention** row builds a draft from a deterministic table and opens the
standard confirm card:

| Widget kind | Default title template | Default class |
|---|---|---|
| slack / chat-like | `Follow up in <title>` | action |
| doc / page / markdown / note | `Review <title>` | review |
| table | `Update <title>` | action |
| webview | `Check <title>` | review |
| sticky | `<sticky's own text, trimmed>` | loose_thought |
| agent / automation | `Check on <title>` | review |
| *anything else* | `Attend to <title>` | action |

Desk + room ride as context (the reason line: "on <desk> · <room>"), NOT the
title — titles stay short, provenance stays visible. The table is a pure
exported const → unit-tested, operator-editable, extensible per new kind.

**Tensions to rule on:**
- *Reference lifetime.* Widget deleted later → dangling `sourceRef`. Options:
  (a) open-back degrades gracefully (row keeps working, open goes to the desk,
  reason line notes "its widget is gone") — cheap, honest; (b) detach-style
  bookkeeping — heavier, probably overkill for v1. Lean (a).
- *Duplicate marks.* Marking the same widget twice: allow (two thoughts about
  one thing is legitimate) or dedupe-prompt ("already one open item about
  this — open it?"). Lean allow + a soft hint on the card.
- *Skip-the-card mode?* A power path (⌥-click files silently with defaults)
  violates DEC-019's always-confirm. Lean NO at v1; revisit with usage.

### Q2 — Scoped attention (T2)

**Proposed shape: scope lives on the WIDGET; the page stays global.**
- The Attention page (nav) = everything, always — the comprehensive place.
- The Attention widget gains `scope: 'desk' | 'room' | 'all'` (default:
  `'desk'` when placed on a desk). Header toggle cycles it. Room scope =
  union of items across every desk under that room (v1: items parent only to
  desks, so room scope is derived, not stored).
- An "in-desk peek" beyond the widget (e.g., a canvas side rail) is NOT
  proposed — the widget IS the in-desk surface; adding a second one would
  fork the rendering.

**Tensions:**
- *Unparented items are invisible in scoped views* (standalone captures have
  no desk). Honest, but silent. Option: a one-line footer in scoped mode —
  "+N more on the Attention page". Lean yes, it prevents false confidence.
- *Feeders in scoped mode.* A desk's widget showing that same desk's due/stale
  signal is circular. Lean: feeders render only in `'all'` scope.
- *Widget-scope persistence.* Widget config already persists per-widget —
  free.

### Q3 — The plan boundary (T3)

The crisp distinction this analysis proposes as the RULE:

> **An attention item points at a thing. A scope groups items by place. A
> plan is structure someone CHOSE.** Attention is transient and closeable;
> a plan has internal shape (phases, dependencies, horizon). The system may
> NOTICE that a place has accumulated attention — it never converts anything.

Under that rule:
- **"Attend to this whole desk" = a work item that references the desk**
  (`sourceType:'desk'`, `sourceRef:deskId`, parent = the desk itself), created
  from the desk's own menu with the same preset mechanics ("Attend to
  <desk>", class action). Symmetric with widget-marking; no new machinery.
  It is NOT a feeder (feeders stay computed/one-directional — a manual flag
  would corrupt that contract) and NOT a plan.
- **The emergent-plan idea becomes a SUGGESTION, never a conversion:** when a
  desk/room crosses a threshold of open attention (say ≥5 items), the feeder
  section may offer one quiet line — "<desk> has 6 open items — make it a
  plan?" — which opens the EXISTING plan-promotion flow. DEC-010 (plans stay,
  deliberate) and the anti-goal both survive intact. Threshold + copy = DEC
  material.

### Q4 — Menu IA (T4)

Current inventory (code-verified):
- **Canvas right-click:** Add object · Auto arrange · Fit all · Reset view ·
  Customize desk layout · double-click hint. Complaint: layout/структура, not
  the actions themselves.
- **Widget right-click (universal.ts + per-kind rows):** Reload · Open full
  screen · Change URL · Open in browser · Copy URL · **Create ▸** (7 kinds) ·
  **Convert ▸** (7 targets) · Automate with agent · Bring to front ·
  Flag as a decision · Move out of section · **Pin to corner ▸** · **Recolor
  ▸** · Copy text · Share… · Make this a Desk… · Duplicate (keep synced) ·
  Duplicate (independent) · Duplicate into another Room/Desk… · Unlink from
  synced copies. ~20 entries, 4 submenus — the operator's "way too much" is
  simply true.

**Proposed regroup (structure only — nothing deleted without a usage ruling):**

```
[widget menu]                      [canvas menu]
Attention…            ← NEW, top   Add object
—————————————                      ————————————
Open full screen                   Arrange ▸  (Auto arrange · Fit all · Reset view)
Reload                             Desk ▸     (Customize layout · Attend to this desk…)
URL ▸  (Change · Open in browser · Copy)
—————————————
Appearance ▸ (Recolor · Pin to corner · Bring to front)
Organize ▸   (Move out of section · Flag as decision · Share…)
Create ▸     (unchanged pending audit)
Convert ▸    (unchanged pending audit)
Duplicate ▸  (keep synced · independent · into another Room/Desk · Unlink)
Make this a Desk…
```

**Tensions:**
- *Caleb's surface.* universal.ts and Canvas.tsx are core-PlexiDesk, actively
  churned upstream. A structural regroup is merge-conflict bait. Options:
  (a) additive-only now (insert the Attention row, touch nothing else), full
  regroup as a coordinated post-landing pass with Caleb+Michael; (b) full
  regroup now on the branch. Lean (a) — the reveal shouldn't carry a menu
  reorg nobody discussed.
- *Create/Convert audit.* The operator doesn't know what several entries do —
  neither should the menu assume users do. Needs a usage/telemetry look or a
  three-owner conversation, not unilateral pruning.

## 4. QA + architecture gates (the operator's explicit requirement)

No build starts until, in order:
1. **Brainstorm ruling** on the decision list below (→ DEC-029).
2. **Architecture addendum** (one §-page): the preset table, the scope
   predicate contract, the sourceRef open-back + dangling rule, the
   suggestion threshold. Reviewed against F006 + DEC-010 + one-code-path.
3. **Test plan written BEFORE code:** pure-table unit tests (naming/class per
   kind), scopeFilter matrix (desk/room/all × parented/unparented ×
   feeder visibility), dangling-ref open-back, widget-config persistence,
   menu source-pins. The CDP smoke harness (now proven) covers the live
   pass: mark a Slack widget → card pre-picked → filed → scoped widget shows
   it → open-back focuses the widget.
4. **Stage split:** S-CR9a (marking + presets) → S-CR9b (widget scope) →
   S-CR9c (desk-mark + plan suggestion) → S-CR9d (menu regroup, coordinated).
   Each stage lands with its tests; nothing rides the GA landing.

## 5. Sequencing vs the GA landing

CR-09 is **post-landing scope**. The GA checklist stands finished on its own;
Michael and Caleb receive the layer flag-OFF regardless. Building CR-09 on the
fork BEFORE the landing only grows the reveal diff and delays it. Recommended:
land first, then CR-09 as the first post-GA track.

## 6. THE DECISION LIST (what the brainstorm must produce)

- **D-A** Adopt "mark = capture preset" (same card, deterministic table)?
  And: edit the draft table's templates/classes above.
- **D-B** Scoped attention = widget scope control (desk/room/all, feeders
  all-only, unscoped-items footer), page stays global?
- **D-C** Adopt the boundary rule — desk-mark is an ITEM, plans are CHOSEN,
  accumulation triggers a SUGGESTION only (threshold ≥5? copy?)?
- **D-D** Menu track: additive-only now + coordinated regroup post-landing
  (lean), or full regroup on the branch? Which of Copy URL / Change URL
  merge; does the Create/Convert audit happen with Caleb?
- **D-E** Confirm sequencing: CR-09 entirely post-landing?

---

# PART II — The full-scope frame (operator pullback, 2026-08-26)

Before ruling on Part I, the operator pulled the lens back to the product's
original scope. Part II integrates that frame; the Part I decisions survive
but now sit INSIDE it. The bar, verbatim in spirit: *the smoothest,
most frictionless task and project tool that exists — Attention has to match
the canvas + AI-brain level, not sit beside it.*

## 7. The two-layer principle (the governing constraint)

**Layer 0 — Manual, complete.** Every Attention capability must have a full
by-hand path: no AI, no credits, toggle off — and nothing about the
experience reads as degraded. Deterministic machinery (hard triggers, preset
tables, templates) is Layer 0, not AI.

**Layer 1 — Intelligence, everywhere it can infer.** With AI on, assume
leverage at every seam: names, titles, due dates, deliverables,
classifications, tags. If the system can infer it, it OFFERS it.

The relationship is strict: **Layer 1 only ever pre-fills, proposes, and
enriches what Layer 0 can already do.** No capability exists only behind the
model. This is already the build's DNA (rules-first classify, the tidy as an
offer, the flag default-OFF) — Part II promotes it from habit to law.

## 8. "The system already knows" × the restraint doctrine — pull, not push

The north star: the user stops asking *what do I need to do / how do I
structure this / what am I doing today / what have I forgotten* — because the
system watched the work happen.

The tension: the shipped doctrine deliberately has ONE proactive notification
trigger, capped queues, quiet decay. "Already knows" must not become "always
talking." The operator's own sentence resolves it: *"keeps all of that
invisible until the moment it's useful."*

**The rule: proactive DETECTION, passive PRESENTATION.** Observation runs
continuously; findings accumulate silently as `approval_state='suggested'`
items (the column has waited for this since S2). They SURFACE only at
moments of use — opening Attention (a Suggested tray), viewing the Living
Doc that produced them, the meeting-end screen, the morning standup. They
NEVER ride the notification substrate. Banners remain reserved for deadline
proximity; the caps and Δ10 suppression stand unchanged (and Δ10 already
gives users "stop suggesting from this source" for free).

## 9. One review discipline: the proposal tray

DEC-025's secondary chips are the seed of the universal pattern: **a set of
pre-checked, one-line proposals reviewed in one stop — uncheck what's wrong,
one Enter accepts the rest.** A meeting yielding five action items, a Living
Doc yielding three next steps, a compound capture yielding two loops — same
review surface, same muscle memory, same approval semantics. Generalize the
chips into a `ProposalTray` (items with source, class, owner?, due?) rendered
by: the confirm card (compounds), the meeting-end screen, the Living Doc
offer row, and the Attention page's Suggested section. ONE component, four
hosts — the AttentionConfirmCard precedent applied again.

## 10. Three sources, one system

| Source | Gesture | Layer 0 | Layer 1 adds |
|---|---|---|---|
| **Typed** | capture (⌘K, chat, home bar, console) | rules classify, presets, verbatim unrouted | Haiku fallback class, tidy, date anchoring |
| **Marked** | Part I's object/desk marking | deterministic naming table | smarter title from widget CONTENT, suggested due |
| **Observed** | pipelines watching work happen | — (observation IS the AI layer; its Layer 0 is that everything observed is also creatable by hand) | Living Doc + Meetings extractors → suggested items in the tray |

## 11. The first two observers (both half-built already)

**Living Doc.** `LivingDocWidget` already reads a desk and writes a summary
including what needs doing. The observer = an extraction pass over its
OUTPUT (not another read of the desk) producing suggested items parented to
that desk, plus the offer verbs on the widget itself: *group into a plan ·
create the tasks · route them · delegate them*. Route/delegate are P1
(SPEC-027) territory — the verbs render, the cross-user half waits.

**Meetings.** The S5 vocabulary already ships `meetingCaptureRule` +
`MEETING_WORK_ITEM_DELIVERABLE`, and `meeting_end` is a routed AI purpose —
the proposal half exists. Missing: owner + due extraction per action item,
the batch tray at meeting end, and routing. Owner extraction is P1-shaped
(named recipients need SPEC-027 to mean anything); at P0 owner tags ride as
text ("owner: Michael") awaiting the routing rails.

Both observers obey §8: they produce suggested items silently; the tray
surfaces them at the widget / meeting-end / Attention-page moments.

## 12. Manual-completeness audit (Layer 0 gaps found today)

- **No post-creation editing.** Attention rows cannot edit title/notes/due by
  hand (updateFields exists at IPC; no UI). A complete manual path needs an
  edit affordance. **Gap, must fix.**
- **No bare "new item" form.** The console always classifies (deterministic —
  acceptable), but a zero-classification manual form (title, class picker,
  date, desk) would make Layer 0 unmistakably first-class. **Decide.**
- **No manual grouping.** "Select N items → make a plan / move to desk" —
  the bulk-selection engine exists on the index pages; the Attention page has
  no selection mode yet. **Gap for the plan-boundary flow.**
- Everything else already holds: rules-only classify works keyless; unrouted
  mode is verbatim; presets are tables; tidy/fallback silently absent
  without AI — nothing reads degraded.

## 13. Named rails, deliberately deferred (so nothing gets lost)

- **Tags + continuous cross-referencing:** no tag column exists; the
  knowledge-graph/Relationships machinery is the likely substrate. Own
  analysis when the observers exist to feed it.
- **Delegation / owners:** SPEC-027 routing (P1) — the attestation gate and
  retention rule already wait for it.
- **Standup integration:** "What am I doing today?" = the standup widget
  reading the ranker's top-N. Cheap, high-value, post-landing.
- **"What have I forgotten?"** = the ranker's staleness term + feeders,
  already live; improves as observers add volume.

## 14. REVISED DECISION LIST (supersedes §6)

- **D-A…D-E** stand as written (Part I), now read through the two-layer law.
- **D-F** Adopt the two-layer principle as LAW (every capability manual-complete;
  AI only pre-fills/proposes/enriches)?
- **D-G** Adopt pull-not-push (suggested items never notify; surfaced only at
  moments of use: Attention tray, source widget, meeting end, standup)?
- **D-H** Adopt the ProposalTray as the ONE review surface (generalizing the
  chips), hosted by card / meeting end / Living Doc / Suggested section?
- **D-I** Layer-0 gap order: post-creation editing first, Attention-page
  selection mode second, bare manual form third — agree?
- **D-J** Observer order: Living Doc first (all-local, no scheduling
  dependency), Meetings second (richer, needs owner/due extraction)?
- **D-K** Sequencing confirmation: landing first; then CR-09 stages
  S-CR9a…d (Part I) interleaved with L0-gaps + observers — or a different
  priority order?
