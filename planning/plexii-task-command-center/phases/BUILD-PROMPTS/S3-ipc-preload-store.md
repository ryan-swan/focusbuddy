# S3 — IPC, Preload, Store, Creation Seam

**Class:** ADDITIVE · **Blocks:** S6 (surfaces need `workItems:*`) · **Risk:** LOW-MED
(pure new namespace; the danger is convenience-reuse of `useNodeStore` — don't).

**Mission:** the renderer can create, list, and mutate work_items through a typed,
namespaced seam that wraps S2's db-module functions — and through nothing else.

## Read first
- ARCHITECTURE **§4** (all bullets), §3 (emitter responsibilities the store owns)
- House pattern: how `nodes:*` IPC + preload + `useNodeStore` are structured today —
  mirror the idiom exactly (registration site, error shape, preload typing style)

## Build items
1. **`workItems:*` IPC** — `list(query) get(id) create(draft) updateFields(id,patch)
   setState(id,state) reclassify(id,intentClass) snooze(id,until) markRead(id) counts()`.
   Handlers wrap S2's db-module functions ONLY (F008 — no SQL in handlers). `create`
   enforces the §2.6 capability gate + S1's same-device migration guard; refusals are the
   typed results S1 defined.
2. **Preload:** `api.workItems` typed inline, same shape as the existing namespaces.
3. **`useWorkItemStore`** — full store: state, `create` → `crdtEmitNodeCreate`,
   `updateFields`/`setState`/`reclassify` → attr events (§3 producer contract);
   subscribes to sync refresh; work_items NEVER pass through `useNodeStore`.
   snooze/markRead write `wi_local` via IPC (no CRDT emit — device-local).
4. **Creation seam:** `fb:command-new-work-item` event, sibling to `fb:command-new-task`;
   palette registration itself is S6 — here the event + handler only.

## Adversarial / verify
- Typecheck: preload/renderer types agree end-to-end.
- **Namespace tests:** every verb round-trips; `create` under flag-OFF and un-migrated-
  device conditions returns the typed refusals; `setState` to a terminal state flips the
  projection per §2.3 (assert through `nodes` read).
- **Emit assertions:** store `create` fires `crdtEmitNodeCreate` with the full manifest
  snapshot; `setState` fires the attr event (extends S2's parity test).
- **Palette create smoke (live, dev-only path):** with the flag ON in the dev profile,
  dispatch `fb:command-new-work-item` → row exists, `work_item_state='open'`,
  `status='open'`, visible to `workItems:list`, INVISIBLE to `listNodes`.

## Close
Suites green · live smoke proof · commit `s3: workItems IPC + store + creation seam` ·
ACTIVE-MISSION + handoff.
