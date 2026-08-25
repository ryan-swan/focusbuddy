<!-- BUG-C2-01 evidence base + P1 preconditions — sync mechanism map & reliability
     assessment. Produced 2026-08-24 night by a dedicated read-only analysis agent (very
     thorough); SPOT-VERIFIED by the orchestrating session 4/4: the running-guard early
     return (workspaceSync.ts:617-623, verbatim), NODE_ATTR_KEYS literal allowlist
     (crdtSync.ts:57+), personal-collect exclusion commentary (main/db/workspaceSync.ts:185+),
     OfficeDocWidget debounced direct write with no emit/nudge (:71-81). -->

# PlexiDesk Sync — Mechanism Map & Reliability Assessment

## 1. The transports — there are THREE, not two

| # | Transport | Entry | Trigger | Carries |
|---|---|---|---|---|
| **A** | CRDT change log over the messaging WebSocket | `renderer/lib/crdtSync.ts` | event-driven, per mutation | widget geom/content/title/color/status/zIndex/membership, node title/parent/attrs, table+row cells, timeblocks, file name/parent, **document metadata only**, wires, live-folder entries |
| **B** | HTTP push/pull poll | `renderer/lib/workspaceSync.ts` | 20s timer + nudges | whole rows, 7 item types, per scope; org file bytes |
| **C** | Yjs doc rooms (separate WS family) | `renderer/lib/yjsDocSync.ts` | on opening a live doc | rich-text body + cursor awareness |

Dual-write by design ("the poll stays the safety net", crdtSync.ts:84-85). One socket
(`signalConfig.wsUrl`), dispatcher `messagingSocket.ts:288-366`: `crdtSync/crdtEvent` → A;
`orgWorkspaceChanged` / `sharedWorkspaceChanged` → **receiver wakes for B**;
`yjs*` → C; `presence*` → pure WS. **No `personalWorkspaceChanged` exists — personal
multi-device has NO receiver wake; 20s worst case.** CRDT flags default ON
(`syncFlags.ts:16-22`; the architecture doc's "off by default" at
`docs/sync-substrate-architecture.md:185` is stale). Partition precedence desk > org >
account (`syncFlags.ts:161-168`); grantees join four desk rooms only
(`w:/n:/r:/l:desk:<root>` — no documents/tables/files rooms, crdtSync.ts:265-275).

Path B collect matrix (main/db/workspaceSync.ts): nodes/widgets/fb_tables/fb_rows ride all
three scopes; time_blocks personal+org only; **documents org-only**; **fb_files org-only
(file/folder kinds)**. `SHARED_COL_TABLES` caps the shared path at
{nodes, widgets, fb_tables, fb_rows} (:64; re-enforced at apply :778). Cycle shape: N org
loops → shared → personal, every PUT/DELETE awaited **serially** (:330, :528-529, :648-649).

## 2. Per-widget-kind content propagation — why stickies sync and decks don't

| Kind | Content home | Live (A) | Poll (B) | Live on a shared desk? |
|---|---|---|---|---|
| sticky/note/markdown/card/field/color/shape | `widgets.content` | ✅ LWW register | ✅ | **✅ ~0.6s** |
| webview (browser) | content = URL only; session in Electron partition `persist:webview-default` | ✅ URL | ✅ URL | **URL yes; page/session state never** (by nature) |
| streamdeck/hook/chat-thread/task-link/launcher | content = JSON config | ✅ | ✅ | ✅ config |
| table | content = fb_tables id | ✅ per-cell | ✅ | ✅ |
| **doc/sheet/SLIDES/map/design** | content = documents id; **body in `documents` table** | ❌ metadata only | ❌ **excluded from personal AND shared collects** | **❌ NEVER — non-replicating by construction** |
| file/image/video/pdf | bytes in fb_files | name/parent only | org blob route only | ❌ bytes never on shared path |

**The slide-deck bug is three independent breaks** (each alone sufficient):
1. **No emit** — `OfficeDocWidget.saveBody()` (:71-81) writes `documents.update` directly
   after a 500ms debounce; no `crdtEmit*`, no `nudgeSync`, no `pushCloudDoc`.
2. **No collect** — the deck's documents row (org_id='personal', no shared_root_id) matches
   no collect query on the shared or personal path; the body has **no route off the device**.
3. **No receive-side refresh** — `syncSharedWorkspaceOnce` refreshes nodes/widgets/tables
   only (:576-581); and OfficeDocWidget loads once keyed on `[widget.content]` (an id that
   never changes), so even a refreshed store wouldn't re-render.

Browser widgets additionally: `persistNavUrl` has no debounce by design (:145-147) — a
redirect chain fires 3+ row writes → CRDT frames + dirty marks.

## 3. The 7–8s latency — root-caused

Path A (live) budget ≈ **0.6–0.7s** (input debounce + one awaited SQLite write before emit
+ WS relay + per-event unbatched apply). The 7–8s is **path B**, and its dominant term is:

**🔴 The `running`-guard silently drops receiver wakes** (`workspaceSync.ts:617-623`,
verbatim verified): a `sharedWorkspaceChanged` wake arriving while a cycle is in flight is
discarded — no queue, no re-arm (debounce cleared before invoke, :713-716; the 20s
`setInterval` tick has no in-flight check either, :742). Cycles are long because of the
**serial-PUT × dirty-row-count** shape (+ per-file HTTP probes + a recursive shared-subtree
walk per desk per cycle + a heavy receiver refresh that re-fetches every cached table and
its rows). Two peers each running 3–4s cycles, each dropping the other's wakes → **7–8s.
The 12 dirty rows and the 7–8s report are the same bug.**

**Cheapest fix (~6 lines):** coalescing re-arm — on guarded entry set `rerunRequested`; in
the cycle's `finally`, re-invoke once if set. Collapses the tail from 20s to one cycle
length without touching the transport. *(Ownership note: this is Caleb's live subsystem —
per the concurrent-work norm the fix is a candidate patch TO him or a minimal, isolated
commit at the P1 stage; decided at P1 planning.)*

## 4. Widget-movement sluggishness — observer-side, not drag-side

The drag path is clean (zero IPC during drag; drop-commit only; group drags batched). The
sluggishness is: (1) **one geom event per drag, at drop** — remote peers see a teleport,
not motion; (2) the emit is gated behind an awaited SQLite write; (3) **`bringToFront` on
every mousedown** scans+writes zIndex, emits a frame, and dirties the row *without*
scheduling a push; (4) **the CRDT apply re-dirties the receiver** (dual-write by design,
database triggers) so receivers push back what they just received → longer cycles → more
dropped wakes — the self-reinforcing loop behind §3; (5) heavy receiver refresh fan-out.
CRDT merge cost itself is negligible.

## 5. Dirty rows — causes ranked (live counts: documents 81 · fb_files 42 · widgets 31 · nodes 15)

Every synced table defaults `needs_sync=1`; only the poll's `markPushed` clears it. Causes:
1. 🔴 **Every personal `documents` row is permanently dirty by design** (no collect selects
   them; `cloudDocsSync` keeps its own rev map and never calls markPushed). Zero RTT cost —
   pure SELECT misses; a red herring for latency. Explains the 81.
2. 🔴 **Every personal `fb_files` row** — same shape. Explains the 42.
3. Org fb_files with kind='doc' — excluded by design.
4. Orphaned join children (widget whose desk row is gone; row whose table is gone) —
   silently dropped by the JOINs.
5. Rows in a departed org — stranded between collect queries.
6. 🔴 **Permanent 409 loop**: conflict → apply no-ops (skip-foreign / echo-suppressed /
   swallowed FK) → `sync_rev` never advances → same baseRev → 409 forever, **burning a
   serial RTT every cycle**. The 9 trashed legacy `task-item` deletes among the 15 dirty
   nodes are prime suspects — **cleaning them is a quick latency win.**
7. Shared rows with a cleared rootId — skipped by collect and push.
8. Swallowed push failures (403/400) — correct retry, zero surfacing.
9. CRDT dual-write echo — steady-state background dirt on co-edited desks.
10. Disabled/blocked scopes accumulate dirt unbounded.

Widgets/nodes dirt (46 rows) is the RTT-costing kind — diagnostic separation confirmed
against the live counts above.

## 6. P1 preconditions — routed work_items + acknowledgment loop-closure

Substrate verdict: **unblocked** — `nodes` ride all three scopes on both transports, and
A-003 validated generic column passthrough on path B. Carriers: shared-desk ACL path for
cross-account non-org; org path for same-org; personal for self-routing (⚠ no receiver
wake — second-device self-routing worst-cases at 20s on B; path A covers it live IF the
fields ride A — see #2).

**Ranked blockers before P1 architecture freezes:**
1. **Coalescing re-arm on the running guard** — an acknowledgment someone is waiting on
   cannot have a 20s tail (~6 lines; ownership per §3 note).
2. **🔴 NEW — the two CRDT allowlists** (`NODE_ATTR_KEYS`, crdtSync.ts:57-75, and the
   `emitNodeCreate` snapshot, :404-416): both are explicit field allowlists that would
   **silently drop every SPEC-002 routing column on the live path** — items would arrive
   with blank routing fields and self-correct up to 20s later, the worst possible shape for
   loop-closure. **SPEC-002's build stage MUST add the new columns to both lists.**
   → GAP-015.
3. **Version-gate the receiver** — un-migrated peers silently discard unknown columns at
   apply (main:559-560/:810) and swallow unknown-kind INSERT rejections (:849-851): both
   halves of GAP-013, now with the column-discard face confirmed.
4. **Break the 409 loop** — on conflict-apply-no-op, force `sync_rev = serverRev` so
   baseRev advances; otherwise a routed item that 409s is permanently unroutable with no
   signal.
5. **Widen the shared refresh** to include whatever store the Attention surface reads.
6. **Node-kind consumer sites in sync itself** — `subtreeNodeIds` (crdtSync.ts:747-765) and
   `collectDeskSubtree` (main:361-408), both already on the must-touch list (analysis/10).

**Not P1 blockers:** the per-kind content gaps (§2) — slide decks and browser sessions are
the *shared-desk collaboration* complaint (BUG-C2-01's user-visible face, root-caused above
for Caleb's queue), orthogonal to routed work_items, which are nodes and fully covered.
