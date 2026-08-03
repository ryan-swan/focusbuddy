# Design review record

This is the standing design-review log. It satisfies two requirements that both
attach at design review:

- PLX-PRIN-006: every feature design records which of the ten design principles it
  advances and which it places under tension, and any design that places a
  principle under tension records the mitigation.
- PLX-UX-001: every feature proposal states the cognitive load it removes, and a
  proposal that adds capability without removing load is explicitly justified
  against §6 Philosophy 1 and recorded.

Each entry below is a real review that happened, most through the owner-agent
consults recorded in the commit history. New features append an entry here at
design review before implementation is considered done.

## APP-012 — off-viewport Canvas virtualisation

Cognitive load removed (UX-001). A busy desk previously got heavy and slow, which
taxes the user with lag and lost responsiveness. Virtualisation removes that load by
keeping a desk of hundreds of objects as responsive as a small one; the user stops
having to think about how much is on the board.

Principles advanced. Performance-as-a-feature, and staying out of the user's way.

Principle under tension, and mitigation. Correctness of the spatial surface was
under tension, culling an object could have broken links, selection, or a drag.
Mitigated by keeping every link endpoint, selected, dragged, active/focused and
web-kind object always mounted, and by an animation freeze and hysteresis so nothing
flickers at the edge. Reviewed and approved by canvas-camera-owner and
widget-link-owner; verified end to end by the tester.

## APP-010 Phase 1 — per-(user, device class) camera and selection overlay

Cognitive load removed (UX-001). A desk used to reopen at the origin, forcing the
user to re-find their place, and a second device could overwrite the first's view.
Restoring camera and selection per person and per device removes that
re-orientation cost entirely.

Principles advanced. Continuity of context, and respecting the user's arrangement.

Principle under tension, and mitigation. Reliability of desk open was under tension,
a restore could fight the camera reset or a reentrant open. Mitigated by sequencing
restore after the reset, a per-call token so the newest open always wins, and an
honest degrade to the origin when no layout is saved. Reviewed and approved by
canvas-camera-owner (two race fixes applied on review); tester verified.

## APP-010 Phase 2a — opt-in per-device Object-geometry overlay

Cognitive load removed (UX-001). This adds a capability (personal per-device
arrangements), so per UX-001 it is justified explicitly against Philosophy 1: it is
opt-in and off by default, so it adds zero load for anyone who does not want it, and
for those who do it removes the friction of a shared arrangement changing under
them. It does not add standing complexity to the default experience.

Principles advanced. User agency over their own workspace, and privacy by default.

Principle under tension, and mitigation. Collaboration coherence was under tension,
per-user layout could fragment a shared desk. Mitigated by keeping the shared base
authoritative and layering the personal overlay only when opted in, and by excluding
sections, section children and z-order so the section engine and shared structure are
untouched. Reviewed and confirmed by section-owner; tester verified through the real
UI, and an isolation test proves an opted-in move leaves the shared base unchanged.

## How to add an entry

At design review for a new feature, add a section with the same three parts: the
cognitive load it removes (or, if it adds capability, the explicit Philosophy 1
justification), the principles it advances, and any principle under tension with its
mitigation. The record is checked by the gate test in
`tests/unit/plxPrinDesignReview.test.ts`.
