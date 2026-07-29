---
type: requirement-register
area: A11Y
domain: "Accessibility"
count: 8
tags:
  - requirements
  - area/a11y
---

# REQ-A11Y — Accessibility

8 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_a11y_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-A11Y-001]] | §27 | T, D, I | The platform MUST conform to WCAG 2.2 Level AA. Conformance MUST be verified per release against the published success criteria. |
| [[#PLX-A11Y-002]] | §27 | T, D | Every function MUST be operable by keyboard alone, with a visible focus indicator and no keyboard trap. |
| [[#PLX-A11Y-003]] | §27 | T, D | The spatial Canvas MUST provide an equivalent non-spatial, linear, screen-reader-navigable representation of Desk contents, struct |
| [[#PLX-A11Y-004]] | §27 | T, D | Context Health states MUST be distinguishable without reliance on colour, using shape, text, or iconography in addition to colour. |
| [[#PLX-A11Y-005]] | §27 | T, D | The platform MUST honour prefers-reduced-motion and provide an in-product reduced-motion setting that suppresses non-essential ani |
| [[#PLX-A11Y-006]] | §27 | T, D | Interface text and layout MUST remain functional at 200% zoom and at user-configured text scaling, without loss of content or func |
| [[#PLX-A11Y-007]] | §27 | D | Voice interaction, dictation and transcription MUST be available for Resume review, Decision approval and Object capture. |
| [[#PLX-A11Y-008]] | §27 | I | Accessibility review MUST be a blocking item in the Definition of Done (§74). A feature MUST NOT be marked done with an open Level |

---

### PLX-A11Y-001

The platform **MUST** conform to WCAG 2.2 Level AA. Conformance **MUST** be verified per release against the published success criteria.

| | |
|---|---|
| **Verification** | `T, D, I` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]] |
| **Test name** | `test_plx_a11y_001` |

### PLX-A11Y-002

Every function **MUST** be operable by keyboard alone, with a visible focus indicator and no keyboard trap.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]] |
| **Test name** | `test_plx_a11y_002` |

### PLX-A11Y-003

The spatial Canvas **MUST** provide an equivalent non-spatial, linear, screen-reader-navigable representation of Desk contents, structure and Object relationships.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]], new |
| **Test name** | `test_plx_a11y_003` |

### PLX-A11Y-004

Context Health states **MUST** be distinguishable without reliance on colour, using shape, text, or iconography in addition to colour.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]] |
| **Test name** | `test_plx_a11y_004` |

### PLX-A11Y-005

The platform **MUST** honour `prefers-reduced-motion` and provide an in-product reduced-motion setting that suppresses non-essential animation, including Canvas transitions and presence animation.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]] |
| **Test name** | `test_plx_a11y_005` |

### PLX-A11Y-006

Interface text and layout **MUST** remain functional at 200% zoom and at user-configured text scaling, without loss of content or functionality.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]] |
| **Test name** | `test_plx_a11y_006` |

### PLX-A11Y-007

Voice interaction, dictation and transcription **MUST** be available for Resume review, Decision approval and Object capture.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]], [[S28 Mobile Experience|§28]] |
| **Test name** | `test_plx_a11y_007` |

### PLX-A11Y-008

Accessibility review **MUST** be a blocking item in the Definition of Done ([[S74 Definition of Done|§74]]). A feature **MUST NOT** be marked done with an open Level AA defect.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S27 Accessibility|§27]] |
| **Derives from** | [[S27 Accessibility|§27]], [[S74 Definition of Done|§74]] |
| **Test name** | `test_plx_a11y_008` |
