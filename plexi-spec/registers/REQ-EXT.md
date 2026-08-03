---
type: requirement-register
area: EXT
domain: "Marketplace & SDK"
count: 10
tags:
  - requirements
  - area/ext
---

# REQ-EXT — Marketplace & SDK

10 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_ext_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-EXT-001]] | §83 | T, I | Extensions MUST execute within a sandbox with an explicitly granted capability set. Capability grants MUST be reviewed by the inst |
| [[#PLX-EXT-002]] | §83 | I, T | Extensions MUST use the same public platform interfaces as first-party applications (PLX-APP-002). No private interface MUST exist |
| [[#PLX-EXT-003]] | §83 | T | Extension actions MUST emit Events attributed to the extension, with onBehalfOf recording the authorising principal. |
| [[#PLX-EXT-004]] | §83 | T, A | Extensions MUST NOT exceed the permissions of the principal on whose behalf they act, and permission enforcement MUST occur at the |
| [[#PLX-EXT-005]] | §83 | T | Extension-registered Object types and Relationship types MUST be registered in the platform registries (PLX-PRD-011, PLX-GPH-020)  |
| [[#PLX-EXT-006]] | §83 | T, I | Extensions MUST declare their data egress. An extension that transmits tenant content externally MUST disclose destinations at ins |
| [[#PLX-EXT-007]] | §83 | T | Extension resource and cost consumption MUST be metered and attributable, and MUST be subject to the Organisation cost ceiling (PL |
| [[#PLX-EXT-010]] | §84 | I | The SDK MUST be versioned with a published support and deprecation policy of not less than 12 months (PLX-API-005). |
| [[#PLX-EXT-011]] | §84 | T, I | The SDK MUST be backward compatible within a major version. Breaking changes MUST require a major version increment. |
| [[#PLX-EXT-012]] | §84 | T, I | Every SDK interface MUST be exercised by at least one first-party application, so that the SDK's capability is continuously proven |

---

### PLX-EXT-001

Extensions **MUST** execute within a sandbox with an explicitly granted capability set. Capability grants **MUST** be reviewed by the installing Organisation and **MUST** be revocable.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]] |
| **Test name** | `test_plx_ext_001` |

### PLX-EXT-002

Extensions **MUST** use the same public platform interfaces as first-party applications (`[[REQ-APP#PLX-APP-002|PLX-APP-002]]`). No private interface **MUST** exist for first-party use.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]], [[S77 Native Workspace Applications|§77]] |
| **Test name** | `test_plx_ext_002` |

### PLX-EXT-003

Extension actions **MUST** emit Events attributed to the extension, with `onBehalfOf` recording the authorising principal.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]] |
| **Test name** | `test_plx_ext_003` |

### PLX-EXT-004

Extensions **MUST NOT** exceed the permissions of the principal on whose behalf they act, and permission enforcement **MUST** occur at the data-access layer, not in extension code.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_ext_004` |

### PLX-EXT-005

Extension-registered Object types and Relationship types **MUST** be registered in the platform registries (`[[REQ-PRD#PLX-PRD-011|PLX-PRD-011]]`, `[[REQ-GPH#PLX-GPH-020|PLX-GPH-020]]`) and **MUST** receive identical platform treatment to built-in types.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]], [[S11 Objects|§11]] |
| **Test name** | `test_plx_ext_005` |

### PLX-EXT-006

Extensions **MUST** declare their data egress. An extension that transmits tenant content externally **MUST** disclose destinations at install time and **MUST** be blockable by Organisation policy.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]], new |
| **Test name** | `test_plx_ext_006` |

### PLX-EXT-007

Extension resource and cost consumption **MUST** be metered and attributable, and **MUST** be subject to the Organisation cost ceiling (`[[REQ-AI#PLX-AI-030|PLX-AI-030]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S83 Marketplace Architecture|§83]] |
| **Derives from** | [[S83 Marketplace Architecture|§83]], [[S68 AI Cost Optimisation|§68]], new |
| **Test name** | `test_plx_ext_007` |

### PLX-EXT-010

The SDK **MUST** be versioned with a published support and deprecation policy of not less than 12 months (`[[REQ-API#PLX-API-005|PLX-API-005]]`).

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S84 Platform SDK|§84]] |
| **Derives from** | [[S84 Platform SDK|§84]] |
| **Test name** | `test_plx_ext_010` |

### PLX-EXT-011

The SDK **MUST** be backward compatible within a major version. Breaking changes **MUST** require a major version increment.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S84 Platform SDK|§84]] |
| **Derives from** | [[S84 Platform SDK|§84]] |
| **Test name** | `test_plx_ext_011` |

### PLX-EXT-012

Every SDK interface **MUST** be exercised by at least one first-party application, so that the SDK's capability is continuously proven rather than asserted (`[[REQ-APP#PLX-APP-002|PLX-APP-002]]`).

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S84 Platform SDK|§84]] |
| **Derives from** | [[S84 Platform SDK|§84]], new |
| **Test name** | `test_plx_ext_012` |
