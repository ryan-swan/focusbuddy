# ACL Semantics — the Scoping Model work_items Inherit

SPEC-030 evidence · Phase 2 · verified at `a92b30cb`, 2026-08-24 night.
Confidence: 0.9 · why_not_higher: server-side authorization is inferred from client
contracts (no server source available); one live multi-account observation (Michael's
shared desks arriving) corroborates.

## The model in one paragraph

The client never stores membership. It tags every synced row into one of **three scopes** —
personal (`org_id='personal'`), org (`org_id=<org>` with an optional `team_id` partition),
or ACL-shared (`shared_root_id=<desk root>`) — and the **server owns authorization
entirely**: which accounts a scope fans out to (org roster, team roster, per-desk member
list) is decided server-side per bearer token. There are no local member/ACL tables
(verified: zero hits). The org directory the UI shows comes from the server via the org
store.

## The three scopes, precisely

| Scope | Tag | Collected by | Fan-out | Notes |
|---|---|---|---|---|
| **Personal** | `org_id='personal'` | `collectPending` | The account's own devices only | Where the sync proof ran; zero exposure to other people |
| **Org / Team** | `org_id=<org>`, optional `team_id` | `collectPendingOrg` (workspaceSync.ts:242+) | All org members, or only the team when `team_id` set | Team tag applied **at push time** per item — "a team-shared object is never pushed org-wide first (no leak window)" (:255-257). Widgets/rows inherit team via parent JOIN (`__team_id`) |
| **ACL-shared desk** | `shared_root_id=<root>` | `collectPendingShared` (:330+) | The desk's server-side member list | Stamped across the **whole structural subtree** at share time (`stampSharedDesk` :389+, resets `sync_rev=0` for a fresh push); a propagation pass tags content created after the share. Rows live locally in the personal org (`org_id='personal'` + shared guard keeps them out of the org path — one path per row, :271-274) |

Receiving side: shared items materialize into `nodes` parented under a "Shared with me"
container with `shared_root_id` + `shared_from_handle` stamped (applyRemoteShared;
analysis/10 §6 proved the stamping works). Scope exclusivity is enforced at collect time
(`shared_root_id IS NULL` guards on the org path).

## The finding that matters for routing (SPEC-027/030)

**Per-PERSON addressing does not exist as a sync scope.** The transport can deliver to
*a scope*, never to *an account* — except via the per-desk ACL, whose member list is
server-managed at share time.

Consequences for routed work_items, in order of import:

1. **V1 P2P routing = scope-carried + client-filtered.** A routed work_item rides the
   org/team scope (or a shared desk's ACL scope) with `recipientId` as a body column; the
   receiver's Attention layer filters `recipientId = me`. This works today with zero server
   changes — and it means **a routed item is readable by every member of its carrying scope
   at the database level**. Recipient filtering is presentation, not authorization. Inside a
   team's trust boundary that is usually acceptable — but it must be stated in the
   architecture and to users ("routed within your team"), never discovered.
2. **A private direct route has exactly two paths:** (a) server-side per-user scope — out
   of reach from the fork; or (b) the per-desk ACL mechanism with a two-member "routing
   desk" — buildable today, but heavier (a desk per pair) and worth pricing only if the
   spec's `direct` intent class demands DB-level privacy at P1. Recommendation: v1 ships
   scope-carried routing with the visibility stated; the private route is a designed-around
   P2 (§3.7 discipline: today's schema must not foreclose it — `recipientId` +
   `intentClass='direct'` already suffice).
3. **Work_items under a shared desk are automatically shared.** `stampSharedDesk` and the
   propagation pass sweep the structural subtree — a work_item parented to a shared desk
   gets `shared_root_id` stamped and fans out to desk members. For desk-scoped work this is
   exactly right (the desk's work is the desk's). For a *personal* item a user files under a
   shared desk it is a surprise — SPEC-002's architecture must decide: inherit the desk's
   sharing (recommended default, matches spatial semantics) with the UI stating it, or
   exempt `work_item` from the subtree stamp (fights the model). Flagged for G4.
4. **Team partition is the natural queue boundary.** `team_id` at push time gives P1
   receiver queues a leak-free sub-org channel for free; routing metadata SHOULD set
   `team_id` whenever originator and recipient share a team.

## What Phase 4 architecture consumes from this

- SPEC-002: `recipientId`/`originatorId` are body columns (proven to sync); `team_id` is
  set from the routing context; document the scope-visibility contract.
- SPEC-027 (P1): receiver queues filter client-side; no server work required; the
  acknowledgment write is just another synced column change on the same row.
- DEC-013's shared-desk guard composes here: the per-desk ACL member list (server-side) is
  the authority the "all must approve / cannot delete" rule will need to consult — via the
  shares surface, not a local table.
