# Definition of Done

A feature is not done until every item below holds. This satisfies PLX-A11Y-008:
accessibility review is a blocking item in the Definition of Done (spec §74), and a
feature MUST NOT be marked done with an open Level AA defect. The accessibility item
is not advisory; it blocks completion the same way a failing test does.

## Blocking items

1. The change builds and the typechecks pass (main and web).
2. All tests pass, and the change adds tests for the behaviour it introduces.
3. The relevant owner has reviewed the change where one exists for the touched area.
4. Accessibility review passes with no open Level AA defect. The automated gate is
   the axe scan in `tests/e2e/plxA11yWcagZoom.spec.ts`, which fails on any serious or
   critical WCAG 2.1/2.2 AA violation on the affected surfaces, including at 200 per
   cent zoom. A serious or critical finding is an open Level AA defect and blocks
   done. A surface with an equivalent non-visual path (for example the Canvas, which
   ships a screen-reader linear representation) must keep that path working.
5. The change is traceable: any spec requirement it satisfies is cited by a test, so
   `npm run spec:trace` reflects it.

## Why accessibility blocks

Accessibility defects are not cosmetic; a serious or critical AA violation means some
users cannot use the feature at all. Treating it as blocking is what keeps the
product usable for everyone rather than retrofitting access later. The automated axe
gate makes the check objective and repeatable, so "done" cannot quietly ship an
inaccessible surface.

## Relationship to traceability

The Definition of Done is itself the thirteenth gate referenced by the traceability
harness (PLX-ENG-021). The accessibility gate here is the concrete enforcement of
PLX-A11Y-008 within that Definition of Done.
