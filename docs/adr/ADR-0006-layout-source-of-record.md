# ADR-0006 — Desk layout source of record: shared base geometry plus a per-(user, device class) overlay

Status: ACCEPTED for the 4.0 milestone (operator-delegated, 2026-07-30). Overridable before merge.
Relates to spec §21, REQ-UX 030/031/032/033, REQ-APP 010, REQ-PRD 002, and the existing `widgets` table + `workspaceSync`.

## Context

The spec is explicit and normative. UX-032 says layout MUST be persisted per (user, Desk, device class) so a user's desktop arrangement is not overwritten by their mobile or tablet one. UX-030 says the platform MUST NOT reposition, resize or reflow user-placed Objects without explicit action, and MUST restore the user's canonical layout when the viewport is restored. APP-010 says position, size and z-order MUST persist per (user, Desk, device class) and restore exactly. §21 adds that mobile need not render the spatial Canvas and mobile layout state MUST NOT overwrite desktop layout state.

The shipping app does not work that way. Object geometry (x, y, width, height, z-index) lives in the shared `widgets` table, one row per Object, and `workspaceSync` pushes the whole widget row, geometry included, across a user's own devices and across organisation members. So today a Desk has one shared spatial arrangement: moving an Object moves it for everyone who sees that Desk, and rearranging on a second device overwrites the first. That shared-canvas behaviour is a legitimate collaboration model, and it is also the exact multi-device clobber UX-032 was written to forbid.

The question this ADR settles is where per-(user, device class) geometry lives, given that the `widgets` table already holds a shared geometry the whole app (sections, links, templates, snapshots, sync) reads as truth.

## Options considered

**Option A — keep geometry authoritative in `widgets` only.** `desk_layouts` becomes at most a per-user camera cache. Smallest blast radius and preserves the collaborative canvas unchanged, but it does not satisfy UX-032, UX-030 or APP-010, and it leaves the multi-device clobber bug in place. Rejected because it fails a normative MUST.

**Option B — move geometry wholesale into `desk_layouts` as per-user, per-device-class state.** Fully satisfies the spec and is the better privacy posture, but it is a large, high-risk subsystem change: sections compute their frames and child cells from Object geometry, so a per-user geometry fork cascades into the section engine; `workspaceSync`, canvas snapshots and templates all treat widget geometry as truth; and it needs a migration plus a coexistence period with the shipping app. It would also silently remove the shared-layout collaboration some teams rely on. Too much to bolt on, and it throws away a working model.

**Option C (chosen) — a layered model.** `widgets` remains the canonical base geometry, which for shared Desks is also the collaborative arrangement. `desk_layouts` holds a per-(user, device class) overlay that wins for that user and device when present, and falls back to the base when absent. This is precisely the "canonical layout" plus viewport-driven variation that UX-030 describes.

## Decision

Adopt the layered model.

The base geometry stays in `widgets`, keeps syncing, and keeps driving sections, links, templates and snapshots exactly as today, so there is no disruption to those subsystems or to shared-Desk collaboration. A per-(user, device class) overlay in `desk_layouts` layers on top: when a user has an overlay for the current device class it is restored and it wins for them; when they do not, the base geometry is shown. Device-class isolation (UX-032) holds by construction because the overlay is keyed by device class, so a tablet edit writes the tablet overlay and can never touch the desktop overlay or the shared base. The overlay is per-user private state; it stays off the cross-member broadcast path, so a user's camera, selection and personal arrangement are not leaked to the organisation, which matches the local-first privacy stance of ADR-0005.

This is delivered in two phases so the safe part ships now and the risky part gets its own review.

- **Phase 1 (in scope now, low risk):** the overlay carries the camera (pan, zoom, scroll) and selection per (user, device class). No Object-geometry fork yet. It restores view state on Desk open and persists it on explicit user action. Sections, links, sync, snapshots and templates are untouched. This alone makes "reopen a Desk where you left it, without your tablet clobbering your desktop" real, and it is valid under any eventual geometry model.
- **Phase 2 (a scheduled epic, not now):** the overlay is extended to Object position, size and z-order with the fallback-to-base rule and an explicit "customise this device's layout" affordance. This is where the section engine reconciliation, the `workspaceSync` change to stop broadcasting per-user geometry, and the first-open migration that seeds each user's overlay from today's shared geometry all live. It is reviewed with the section-owner and a sync review before it ships.

## Consequences

- The spec's per-device-class isolation and view-state restoration land in Phase 1; the full per-user object-geometry requirement lands in Phase 2. The tracker reflects this split honestly rather than claiming APP-010 is fully live off the data layer alone.
- Shared-Desk collaboration is preserved. The base arrangement remains the shared one; the overlay is an additive personal layer, so nothing that works today regresses, and a facilitator can still arrange a board for everyone via the base.
- If the operator prefers a pure per-user model with no shared arrangement, that is Phase 2's "the overlay is always authoritative" variant; the Phase 1 work is unaffected by that choice, which is why Phase 1 ships first.
- Selection and camera stay per-user and local, so no behavioural signal about what a user is looking at is broadcast to other members.
