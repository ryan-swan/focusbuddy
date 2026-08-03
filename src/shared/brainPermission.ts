// U1b — the permission PREDICATE behind the floor U1a positioned (spec §69, REQ-SEC/REQ-GPH).
//
// U1a moved permission filtering to stage 0 of fusion, ahead of every rank, score and count, and
// shipped it permitting everything because no decision existed yet. This module is that decision:
// DERIVED from the record at the choke point, never taken from the caller.
//
// It is deliberately PURE — the record lookup is injected — so the whole decision, including its
// failure modes, is unit-lockable without a database. That is the same posture rrf.ts, chunker.ts
// and spineRerank.ts take, and the same posture 4.0 takes in shared/permission.ts, whose header
// says it plainly: "The concrete 'can this principal read this object' decision is injected, so
// this layer stays independent of the membership model while remaining the enforcement point
// (SEC-020)." This module is that enforcement point for the brain retrieval path.
//
// THE EVALUATION ORDER IS NORMATIVE
//   1. same organisation      — SEC-011, the coarsest and cheapest; fails closed
//   2. sensitivity tier       — architecture §5.3, a FAST PRE-FILTER, never the authority
//   3. permission scope       — GPH-021/SEC-022, the decision of record
// The tier sits between them precisely because it can only ever WITHHOLD. It must never rescue
// content whose grant set excludes the principal (locked), which is what "the tier never overrides
// a grant" means in practice.
//
// WHY THE SENSITIVITY TIER MOVED HERE FROM spineRerank
// spineRerank gates `sensitivity === 'restricted'` AFTER fusion, so a restricted candidate consumes
// a rank slot and perturbs every survivor's score — the identical PLX-SCH-002 leak U1a fixed, on a
// different gate. Every node in the live corpus is `normal` today, so moving it is behaviourally
// inert now. That is exactly why now: fix the leak before there is restricted content to leak.
// The spine gate stays in place as a second line; one rule, two sites, the same pattern the
// admission gate already uses (admitChunk at ingest and at fusion).
//
// ⚠ WHAT IS NOT BUILT YET. `brain_nodes` has no permission_scope column — that is 4.0's
// `relationships.permission_scope`, and it arrives with U3. Until then every node resolves an
// undefined scope, which satisfiesScope reads as "no restriction beyond org membership". That is
// correct for a single principal and is NOT a stub: the empty-scope case is a real, specified
// branch of GPH-021. It does mean this module cannot yet enforce per-object grants, because no
// per-object grants exist to enforce. Do not read "the brain has a permission resolver" as "the
// brain enforces multi-user permission".

import type { PermissionSnapshot } from './events'
import type { Sensitivity } from './brainGraph'
import { sameOrg, satisfiesScope, type Principal } from './permission'

/** Everything about a candidate that bears on whether the principal may read it. Resolved from the
 *  record by the caller's lookup — this module never infers these, it only judges them. */
export interface BrainPermissionFacts {
  /** The owning organisation, read from the row. NOT supplied by the asking caller. */
  orgId: string
  /** The coarse privacy tier (architecture §5.3 — a pre-filter, not the authority). */
  sensitivity: Sensitivity
  /** The decision of record. Undefined until U3 lands `relationships.permission_scope`; an absent
   *  or empty scope means "any principal within the organisation" per GPH-021. */
  permissionScope?: PermissionSnapshot
}

export interface BrainFloorOpts {
  /** Whether restricted-tier content is permitted for this query (default posture: false). */
  allowRestricted: boolean
  /** The store's own active organisation — the authority for a chunk with no projected node. */
  storeOrgId: string
  /** Whether the store is PROVEN to hold exactly one organisation's rows. The null-spine fallback
   *  below is sound only while this holds, so it is passed in as a checked fact and refused when
   *  false — never assumed. See the fallback comment. */
  storeIsSingleOrg: boolean
}

/**
 * Build the stage-0 floor predicate for one principal. Called once per candidate inside
 * fuseCandidates, BEFORE any rank, score or count is derived (U-4).
 *
 * Total by construction: it never throws, so a malformed record degrades to "withheld" rather than
 * taking out retrieval. Deterministic for a given record and `now`.
 */
export function makeBrainCanRead(
  principal: Principal,
  lookup: (chunkId: string) => BrainPermissionFacts | null,
  opts: BrainFloorOpts,
  now = Date.now()
): (chunkId: string) => boolean {
  return (chunkId: string): boolean => {
    const facts = lookup(chunkId)

    // ── The null-spine case: a chunk whose source has no projected brain node, so there is no org
    // column to read. Failing closed here would withhold the user's own content over a PROJECTION
    // gap rather than a permission fact — wrong, not merely conservative (store-anyway floor, I3).
    // Resolving it to the store's own org is a genuine derivation, because a single-org store holds
    // exactly one org's rows by construction. That soundness condition is CHECKED, not trusted: if
    // the store is not provably single-org the org cannot be derived, so we refuse.
    if (!facts) {
      if (!opts.storeIsSingleOrg) return false
      return sameOrg(principal, opts.storeOrgId)
    }

    // 1 — SEC-011. Cross-organisation access is never permitted. The org comes off the ROW; a
    // principal asserting a different one buys nothing.
    if (!sameOrg(principal, facts.orgId)) return false

    // 2 — architecture §5.3. The coarse tier can only WITHHOLD, never grant: it runs before the
    // scope check and cannot rescue anything the scope check would refuse.
    if (facts.sensitivity === 'restricted' && !opts.allowRestricted) return false

    // 3 — GPH-021 / SEC-022. The decision of record. An empty or absent grant set means "any
    // principal within the organisation"; a non-empty one requires an unexpired grant naming this
    // principal or a capability it holds, and an unparseable expiry fails closed.
    return satisfiesScope(principal, facts.permissionScope, now)
  }
}
