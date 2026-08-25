# S4 Close — Notification Substrate (+ DEC-018 A-1/A-2)

**Date:** 2026-08-25 · **Commit:** `235a016e`, pushed · **Verdict:** CLOSED — all §7 S4
verify classes green; substrate live on the real DB.

## What shipped
1. **`notifications/substrate.ts`** — the durable store (`wi_notifications`, UNIQUE
   `dedupe_key`), `postNotification` (PLX-UX-043: a missing trigger throws),
   `sweepDeliveries` (per-queue hourly cap `QUEUE_HOURLY_CAP=5`; overflow → EXACTLY one
   summary per queue; security/critical bypass; suppression silences but never
   un-records), `notEscalatedDigest` (UX-045), `scheduleBlockReminders` (5-min lead,
   once-EVER dedupe per occurrence — strictly stronger than the retired sessionStorage
   set, and it survives restarts: SPEC-024/029 now deliverable).
2. **`notifications/scheduler.ts`** — app-start + 30s sweep; **mark-then-show** (a banner
   failure loses one banner, never re-fires — no storm path exists); Electron banners +
   `fb:notification-open` / `fb:notifications-delivered` renderer events; block-reminder
   schedule refreshed each sweep from the real calendar.
3. **Retirements:** renderer `blockReminders.ts` (the setInterval engine that died with
   the app) and the main-process spec-conformance decoy — its UX-043/044/045 assertions
   ported verbatim into `notificationSubstrate.test.ts`.
4. **Re-pointing by construction:** `notifyExternal` keeps its behavior byte-identical
   (focus gate, click-to-focus, live closures) and now posts a record-of-record through
   `notifications:post` — all seven callers (messaging, call, meetingRoom, mail, knock,
   MeetingLaunchDialog, LiveDocEditorView) migrate with zero per-caller edits, which is
   also why the regression surface is minimal.
5. **DEC-018 A-1 landed:** `actor?: { kind, agentRef?, missionRef? }` threaded through
   `createWorkItemCore` / `setWorkItemStateCore` / `updateWorkItemFieldsCore`, their
   wrappers, and the IPC handlers; non-human actors logged; storage deferred to D4 by
   design. **A-2 landed:** `mission-needs-you` / `mission-done` queues reserved and
   test-locked; a test proves posting to them works TODAY (D1 lands on a ready rail);
   the no-dispatch-naming rule is grep-locked over both S4 modules.
6. **Badge model (§5):** `attentionBadgeCounts` — non-terminal counts by intent_class
   from `work_item_state` EXCLUSIVELY (F013), headline excludes `wi_origin='system'`
   (DEC-016). IPC + preload ready for S6.

## Verification
Typecheck clean · **2700/2700** (9 substrate tests: UX ports ×3, dedupe,
restart-survival-deliver-once, backlog-cap adversarial with critical bypass,
hourly-budget straw test, block-reminder once-ever + lead-window, Dispatch-rail
contract) · RESHAPE regression guard: full suite green incl. every pre-existing caller
pin; plxUxPlatformSurface still green minus the three moved tests.
**Live:** `wi_notifications` exists on the real DB; scheduler swept at boot; zero rows
verified CORRECT (zero upcoming calendar blocks in the 24h window — the honest empty
case); boot log error-free; fresh PID confirmed by start-time.

## Notes
- Rate-cap constant (5/queue/hour) is a named constant, recalibratable; S7's restraint
  fixtures will exercise it.
- The wi_notifications table carries `category/layer/trigger/escalated` beyond v2.3 §5's
  minimum column list — the mechanical consequence of the mandated PLX-UX port (the
  assertions need the semantics). Recorded here as the §5 delta.
- Park-inbound reapply sweep (S2 deferral) still open — S5 boot path.

## Next: S5 (capture console, classifier, self-routing closure) per autopilot.
