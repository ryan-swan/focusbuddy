---
id: S27
section: §27
title: "Accessibility"
part: III
type: section
defines:
  - PLX-A11Y-001
  - PLX-A11Y-002
  - PLX-A11Y-003
  - PLX-A11Y-004
  - PLX-A11Y-005
  - PLX-A11Y-006
  - PLX-A11Y-007
  - PLX-A11Y-008
tags:
  - section
  - part/iii
---

# §27 Accessibility

◀ [[S26 Notifications]] · [[Part III — User Experience|▲ Part III]] · [[S28 Mobile Experience]] ▶

---

Accessibility is a product requirement, not an enhancement.

### 27.1 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-A11Y#PLX-A11Y-001|PLX-A11Y-001]] | The platform **MUST** conform to WCAG 2.2 Level AA. Conformance **MUST** be verified per release against the published success criteria. | T, D, I | §27 |
| [[REQ-A11Y#PLX-A11Y-002|PLX-A11Y-002]] | Every function **MUST** be operable by keyboard alone, with a visible focus indicator and no keyboard trap. | T, D | §27 |
| [[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]] | The spatial Canvas **MUST** provide an equivalent non-spatial, linear, screen-reader-navigable representation of Desk contents, structure and Object relationships. | T, D | §27, new |
| [[REQ-A11Y#PLX-A11Y-004|PLX-A11Y-004]] | Context Health states **MUST** be distinguishable without reliance on colour, using shape, text, or iconography in addition to colour. | T, D | §27 |
| [[REQ-A11Y#PLX-A11Y-005|PLX-A11Y-005]] | The platform **MUST** honour `prefers-reduced-motion` and provide an in-product reduced-motion setting that suppresses non-essential animation, including Canvas transitions and presence animation. | T, D | §27 |
| [[REQ-A11Y#PLX-A11Y-006|PLX-A11Y-006]] | Interface text and layout **MUST** remain functional at 200% zoom and at user-configured text scaling, without loss of content or functionality. | T, D | §27 |
| [[REQ-A11Y#PLX-A11Y-007|PLX-A11Y-007]] | Voice interaction, dictation and transcription **MUST** be available for Resume review, Decision approval and Object capture. | D | §27, [[S28 Mobile Experience|§28]] |
| [[REQ-A11Y#PLX-A11Y-008|PLX-A11Y-008]] | Accessibility review **MUST** be a blocking item in the Definition of Done ([[S74 Definition of Done|§74]]). A feature **MUST NOT** be marked done with an open Level AA defect. | I | §27, [[S74 Definition of Done|§74]] |

> **On `[[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]]`.** This is the requirement most likely to be quietly dropped, and it is the one that most determines whether Plexi can be sold into government, education and large enterprise. The product's central navigation metaphor is spatial memory — which is, by construction, inaccessible to a screen-reader user. If the linear representation is not designed alongside the Canvas from the beginning, it will never be retrofitted convincingly, and the accessibility conformance statement will be an accurate description of a product that cannot actually be used. Tracked as `[[Risk Register#PLX-RSK-13|PLX-RSK-13]]`.

> **On WCAG 2.2 rather than an unversioned reference.** The source draft listed accessibility features without a conformance target. "Screen reader compatibility" is not testable; "WCAG 2.2 Level AA" is, and it is what procurement will ask for. WCAG 2.2 is used rather than 2.1 because it is the current W3C Recommendation and adds success criteria (focus appearance, dragging movements, target size) that bear directly on a spatial drag-and-drop canvas.

---

---

## Requirements defined or cited here

- [[REQ-A11Y#PLX-A11Y-001|PLX-A11Y-001]] — The platform **MUST** conform to WCAG 2.2 Level AA. Conformance **MUST** be verified per release against the p
- [[REQ-A11Y#PLX-A11Y-002|PLX-A11Y-002]] — Every function **MUST** be operable by keyboard alone, with a visible focus indicator and no keyboard trap.
- [[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]] — The spatial Canvas **MUST** provide an equivalent non-spatial, linear, screen-reader-navigable representation
- [[REQ-A11Y#PLX-A11Y-004|PLX-A11Y-004]] — Context Health states **MUST** be distinguishable without reliance on colour, using shape, text, or iconograph
- [[REQ-A11Y#PLX-A11Y-005|PLX-A11Y-005]] — The platform **MUST** honour `prefers-reduced-motion` and provide an in-product reduced-motion setting that su
- [[REQ-A11Y#PLX-A11Y-006|PLX-A11Y-006]] — Interface text and layout **MUST** remain functional at 200% zoom and at user-configured text scaling, without
- [[REQ-A11Y#PLX-A11Y-007|PLX-A11Y-007]] — Voice interaction, dictation and transcription **MUST** be available for Resume review, Decision approval and
- [[REQ-A11Y#PLX-A11Y-008|PLX-A11Y-008]] — Accessibility review **MUST** be a blocking item in the Definition of Done (§74). A feature **MUST NOT** be ma

◀ [[S26 Notifications]] · [[Part III — User Experience|▲ Part III]] · [[S28 Mobile Experience]] ▶
