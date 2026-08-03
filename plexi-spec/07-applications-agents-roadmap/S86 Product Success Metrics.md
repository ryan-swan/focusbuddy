---
id: S86
section: §86
title: "Product Success Metrics"
part: VII
type: section
defines:
  - PLX-MET-001
  - PLX-MET-011
  - PLX-MET-020
  - PLX-MET-021
tags:
  - section
  - part/vii
---

# §86 Product Success Metrics

◀ [[S85 Five-Year Product Roadmap]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S87 Long-Term Vision]] ▶

---

The platform measures success by improvements in **understanding** rather than activity.

### 86.1 Primary metrics

Average resume time · context reconstruction time · decision latency · duplicate work detected · knowledge reuse · cross-team collaboration · search reduction · meeting preparation time · workspace continuity · user confidence in AI recommendations.

Instrumented as `[[REQ-MET#PLX-MET-001|PLX-MET-001]]` through `[[REQ-MET#PLX-MET-011|PLX-MET-011]]` (§8.1).

### 86.2 Secondary metrics

Daily active users · retention · response latency · agent completion rate · search success rate · platform reliability · infrastructure cost per active user.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-MET#PLX-MET-020|PLX-MET-020]] | Primary metrics **MUST** take precedence over secondary metrics in product decision-making. Where a change improves a secondary metric while degrading a primary metric, it **MUST** be rejected or explicitly accepted with recorded rationale. | I | §86, new |
| [[REQ-MET#PLX-MET-021|PLX-MET-021]] | "Time in product" and equivalent engagement-maximising metrics **MUST NOT** be adopted as success metrics. The platform's stated purpose is to reduce time spent reconstructing context. | I | §86, new |

> **On `[[REQ-MET#PLX-MET-021|PLX-MET-021]]`.** This is the metric that will destroy the product if it is ever adopted, and it will be proposed — probably by someone well-intentioned, probably in year two, probably in a board deck. Plexi's entire value proposition is that users spend *less* time in the reconstruction loop. A product optimising for session length will, by ordinary incremental pressure, start withholding the summary to drive exploration, adding engagement surfaces, and notifying more. Every one of those moves is locally rational and directly contradicts [[S06 Product Philosophy|§6]] Philosophy 7. Ruling it out in writing, now, is cheap; arguing against it later without a written commitment is not.

---

---

## Requirements defined or cited here

- [[REQ-MET#PLX-MET-001|PLX-MET-001]] — Resume accuracy — Proportion of Resume assertions the user marks correct when prompted, sampled Baseline: In-p
- [[REQ-MET#PLX-MET-011|PLX-MET-011]] — Infrastructure cost per active user — Fully loaded cost including AI inference, per monthly active user, per t
- [[REQ-MET#PLX-MET-020|PLX-MET-020]] — Primary metrics **MUST** take precedence over secondary metrics in product decision-making. Where a change imp
- [[REQ-MET#PLX-MET-021|PLX-MET-021]] — "Time in product" and equivalent engagement-maximising metrics **MUST NOT** be adopted as success metrics. The

◀ [[S85 Five-Year Product Roadmap]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S87 Long-Term Vision]] ▶
