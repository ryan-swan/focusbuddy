# S5 Close — Capture Console, Classifier, Self-Routing Closure (FLAG ON)

**Date:** 2026-08-25 · **Commit:** `7554ce86`, pushed · **Verdict:** CLOSED — the
Attention layer is LIVE end-to-end on the dev app.

## What shipped
1. **`ai/intentRules.ts`** (pure) — hard triggers for all eight classes; deadline
   scanning (weekdays/tomorrow/today/eod/eow/next-week anchor silently; asap/"before
   the launch"-style phrases return unanchored); `needsDeadlineClarification` = DEC-016
   Q1 exactly (unanchored + actionable only; 0.70 named constant); title extraction.
2. **`ai/intentClassify.ts`** — rules → Haiku (`intent_classify` purpose, routed in
   AUTO_ROUTING + the renderer display table) → loose_thought floor. R011 structurally
   safe: the common captures never reach a model.
3. **CaptureConsole** — Routed / Unrouted / Expand; the composer carries the ONE Q1
   question (date picker or skip); filed feedback names the class; ⌘↵ files;
   `fb-scrim`/`fb-card`/`fb-field` house shell. Seam: bare `fb:command-new-work-item`
   opens it; titled dispatches keep the programmatic direct-create. Palette entry
   "Capture a work item" gated on a boot-time capability probe.
4. **Closed loop** — terminal `setWorkItemState` posts through the S4 substrate
   (queue = intent class, `wi-close:{id}:{state}` dedupe = once ever, inbox layer).
5. **Δ3 decay** — loose thoughts untouched 14 days → dismissed/'decayed', quiet, on the
   scheduler cadence; actionable classes never decay; terminal filter prevents
   re-decay; promotion via reclassify/reopen stays legal. *(Standing-recommendation
   adoption — flagged here for operator veto.)*
6. **Flag-ON prompt activation** — the S0 gated chat-catalog addendum is now live;
   meeting wrapup assembles per-call (action items → create-work-item; desks reserved
   for work streams; OFF keeps legacy routing — no dead zone); voice notes carry the
   work-item shape (Δ13). Executor's create-work-item arm is REAL (store path,
   origin 'ai', approval 'approved', source 'chat').
7. **`workItems.enabled` = ON** (userData pref, the §2.6 personal-scope switch — org
   exposure remains OFF behind the P1 checklist).

## Verification
Typecheck clean · **2731/2731** (29 new: the trigger table across all classes, deadline
anchor/unanchored sets, Q1 firing matrix, Δ12 scenario set at the rules level, decay
behavior + promotability, wiring locks incl. the closure dedupe key and the
meeting/voice swaps) · live: fresh PID, zero boot errors, flag ON.

## Honest deferrals
- **Opt-in cleanup (rewrite propose-and-approve, Δ6):** NOT built — the console files
  verbatim (title extraction only). Deferred to S6 as a composer enhancement; the
  synthesis's own map rates cleanup "keep core" but nothing downstream depends on it.
- **Scheduling holds:** the class captures + files; actual tentative-hold creation
  stays on the existing schedule-event proposal flow (Δ5, by design — no new calendar
  machinery). S6's card affordance links them.
- **Live UI exercise:** the full capture→file→terminal→notification loop is proven in
  tests; the first live capture is the operator's (I cannot click the UI). Everything
  up to the click is verified live.
- Multi-intent secondary-suggestion cards (Δ7): the chat path already emits multiple
  cards; the console files primary-only at v1 — S6 revisits.

## Next: S6 (surfaces) — after its pre-flight main-diff checkpoint (C-4).
