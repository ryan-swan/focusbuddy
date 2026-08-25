# Q1 & Q7 — Concrete Proposals for Operator Ruling

Returned during Phase 2 per operator directive (2026-08-24 night) so neither becomes an
architecture blocker. Both are PROPOSALS — the operator rules; the ruling becomes a DEC-NNN
and SPEC-002/SPEC-014 consume it.

## Q1 · The clarification threshold (SPEC-009's one sharp question)

**Proposed rule — fire the single question only when one of two conditions holds:**

1. **Named-recipient ambiguity.** The input names a recipient (`@person`) AND the intent
   classifier's confidence in the intent class is **below 0.70**. The question asks the
   intent, never the content: *"For Caleb to act on, or just FYI?"* — one tap to answer.
2. **Unanchored deadline on an actionable class.** A deadline PHRASE is detected but not
   resolvable to a date ("soon", "ASAP", "when you can" — NOT "Friday" or "by the 12th",
   which parse) AND the classified intent is `action`, `review`, or `scheduling`. The
   question asks the date: *"When does this need to land?"* — with parse-free quick picks
   (Today / This week / No deadline).

**Never fires when:** Unrouted mode (verbatim by contract) · `loose_thought` or `fyi` ·
confidence ≥ 0.70 · self-routed items with no deadline phrase (your own queue tolerates
ambiguity; a recipient's does not) · the sender has answered a question on this thread
already (at-most-one is per send, hard).

**Multi-intent inputs never trigger a question** — they route to Q2's grouped-card
presentation instead (one confirmation surface, not an interrogation).

**Calibration loop:** 0.70 is a named constant, revisited against `attentionPrecision()`
after 2 weeks of self-routing use — if sent items get reclassified >15% of the time, the
threshold rises; if questions get dismissed >30% of the time, it falls.

*Why this shape:* the two conditions cover the two expensive misroutes (wrong person-facing
intent; actionable item with no landing time). Everything else defaults to silence —
restraint is the feature, and over-clarification is the named failure mode ("users route
around the system").

## Q7 · System notifications (agent escalations, cost caps, build-complete)

**Proposal: a distinct `System` queue inside Attention — not a separate tray, and not mixed
into person queues.**

- Same substrate (SPEC-006 persistence/scheduler/delivery) — a second notification system is
  exactly the two-paths mistake CR-03 just retired.
- Its own queue + its own Home widget def (small, rail-default, in SPEC-014's set) — system
  events never appear inside Tasks/Reviews/etc., so person-queues stay honest.
- **Excluded from the headline top-bar count.** The count answers "what needs *me*";
  an agent finishing a build is the system reporting, not a person being needed. The System
  queue shows its own unobtrusive count on its widget; a CRITICAL system event (cost cap
  hit, consent required) may still push an OS notification through SPEC-006 — urgency is
  the notification channel's job, not the headline count's.
- Intent-class mapping: system events carry `fyi` (reports) or `action` (consent/cap
  decisions) internally, tagged `origin='system'` — no new intent class needed (§1.4 stays
  small).

**SPEC-014 impact:** widget set becomes Tasks · Reviews · Calendar · Awaiting Ack ·
Completed · Stale Desks · **System**.

*Alternative priced and not recommended:* a separate OS-tray-style surface — second
delivery system, second badge model, and the one place users would have to look that isn't
Attention; it re-creates the fragmentation this build exists to end.
