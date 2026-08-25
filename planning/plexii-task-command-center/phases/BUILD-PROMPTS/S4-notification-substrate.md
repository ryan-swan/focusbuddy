# S4 — Notification Substrate, Rate Caps, Re-pointing

**Class:** RESHAPE (touches existing notify paths — regression guard applies) ·
**Blocks:** S5's closure, S7's nudges · **Risk:** MED (the decoy retirement + seven-caller
migration is where existing behavior can break).

**Mission:** one durable, deduped, rate-capped notification substrate in the main process
that every notifier — existing and new — posts through; the old scattered paths retire
without losing any behavior their tests pinned.

## Read first
- ARCHITECTURE **§5** (all bullets) · analysis/07's C-level notification bugs (what the
  substrate must structurally prevent) · `lib/notify.ts` + its seven callers +
  `blockReminders` + the decoy path and its PLX-UX assertions (port targets)

## Build items
1. **Table `wi_notifications`** (org-scoped): id, ref, queue, title, body, deliver_at,
   delivered_at, **`dedupe_key TEXT UNIQUE`**, wi_origin, critical INTEGER.
2. **Main-process scheduler:** app-start + 30s sweep of due undelivered rows; delivery =
   native Electron `Notification` + renderer event; mark `delivered_at` transactionally
   with delivery.
3. **Per-queue rate caps (IN THIS STAGE, not S7 — F009):** max N OS notifications per
   queue per hour; overflow collapses to ONE summary notification per queue.
4. **Re-pointing:** `lib/notify.ts` becomes a thin client of `notifications:post`; migrate
   the seven callers one-by-one (separate commits); retire `blockReminders`; delete the
   decoy **porting its PLX-UX assertions into the substrate's tests first**.
5. **Badge model:** per-queue counts from `work_item_state` (NEVER `status` — §2.3 F013);
   headline count excludes `wi_origin='system'` (DEC-016).

## Adversarial / verify
- **Restart-survival:** schedule → kill app → relaunch → delivers exactly once.
- **Dedupe:** same dedupe_key posted twice → one row, one delivery.
- **Backlog-cap adversarial (the several-days-offline case):** schedule many overdue rows
  across queues → relaunch → caps hold, EXACTLY one summary per overflowing queue, zero
  notification storm.
- **PLX-UX ports green** before the decoy deletion commit lands.
- **Regression guard:** each migrated caller's behavior pinned before/after; whole suite.

## Close
Commit sequence: table+scheduler → caps → caller migrations (×7) → retirement ·
live proof: a scheduled notification fires natively on the dev app · ACTIVE-MISSION +
handoff.
