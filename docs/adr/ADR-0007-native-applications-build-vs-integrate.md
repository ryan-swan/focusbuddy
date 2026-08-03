# ADR-0007 — Native applications: the build-versus-integrate justification

Status: ACCEPTED for the 4.0 milestone (operator-delegated, 2026-07-30).
Satisfies PLX-APP-001 (every native application build records an ADR answering
§76.3, reviewed before implementation) and PLX-PRIN-003 (the platform must not
position itself as a replacement for specialist applications; native builds must be
justified against the build-versus-integrate test in §76 and recorded in an ADR).

## Context

The spec's §76.3 build-versus-integrate test says a native build MUST be justified
by an affirmative answer to at least one of three questions, and that cost,
licensing preference, and a desire to own the surface are explicitly not valid
justifications. This ADR records that justification for the native applications the
product ships: the spatial Canvas and the Office-class editors (documents,
spreadsheets, slides, diagrams, design).

## The build-versus-integrate test, answered

**1. Does contextual continuity require capturing interaction events no external
API exposes?** Yes. The whole product is a Context OS: the Context Engine, resume,
context health and workspace memory are built from a fine-grained event stream,
edits, moves, focus, object creation, decisions. An embedded external surface (a
Google Docs iframe, say) exposes none of that interaction detail through its API,
so contextual continuity would be blind inside any integrated third-party editor.
The native editors emit these events as first-class Events; an integration cannot.

**2. Does the experience require Objects to be first-class graph participants in a
way an embedded external surface cannot achieve?** Yes. Objects on a desk and inside
the editors must be relationship-graph participants, linkable, related, carried into
resume and awareness, permission-scoped, and materially scored. An embedded external
document is an opaque rectangle to the graph; it cannot be a first-class participant.
The native applications make each object a real graph node.

**3. Is the capability absent from the market such that no integration target
exists?** Not the deciding factor here. The market has document and spreadsheet
tools; this question is not what justifies the build. Questions 1 and 2 are, and one
affirmative is sufficient per §76.3.

Both 1 and 2 are affirmative, so the native build is justified. For completeness and
in line with PRIN-003, the invalid justifications are explicitly rejected: this
build is not justified by cost, by licensing preference, or by a desire to own the
surface.

## Positioning (PRIN-003)

Plexi does not position itself as a replacement for specialist applications. Where
integration suffices, the product integrates: external tools are embedded as web
views rather than reimplemented, and the marketplace-extension interfaces are the
same public platform interfaces the native applications use (APP-002 / EXT-002), so
nothing native enjoys a private back door. The native applications exist only for
the surfaces where contextual continuity and first-class graph participation cannot
be achieved by integrating, which is exactly the §76.3 bar.

## Consequences

- Each native application (Canvas, docs, sheets, slides, diagrams, design) inherits
  this justification; a future native build outside this set must record its own
  affirmative §76.3 answer before implementation, or integrate instead.
- The commitment to the shared public platform interface (no private first-party
  interface) is a standing constraint on how these applications are built.
- This ADR is the reviewed record §76 and PLX-APP-001 require; it is revisited if a
  proposed native build cannot answer §76.3 affirmatively.
