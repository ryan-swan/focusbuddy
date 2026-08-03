---
type: appendix
appendix: G
title: "Normative References"
tags:
  - appendix
---

# Appendix G — Normative References

[[Home|▲ Home]]

---

### G.1 Specification language

- [BCP 14](https://www.rfc-editor.org/info/bcp14) — comprising:
  - [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) — *Key words for use in RFCs to Indicate Requirement Levels*
  - [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — *Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words*

### G.2 Event and API standards

- [CloudEvents v1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) — event envelope; REQUIRED attributes `id`, `source`, `specversion`, `type`; producer guarantee that `source` + `id` is unique per distinct event; extension attribute naming rules
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) — timestamp format
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562) — UUID formats including UUIDv7 (time-ordered)
- [OpenAPI Specification](https://spec.openapis.org/) — REST contracts
- [AsyncAPI Specification](https://www.asyncapi.com/docs/reference/specification/latest) — event contracts
- [OpenTelemetry](https://opentelemetry.io/docs/specs/otel/) — metrics, logs and traces semantics

### G.3 Accessibility

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — Level AA conformance target
- [WAI-ARIA](https://www.w3.org/TR/wai-aria-1.2/) — accessible rich internet applications

### G.4 Security and privacy

- [OAuth 2.1](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/), [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html), [SAML 2.0](https://docs.oasis-open.org/security/saml/v2.0/)
- [Regulation (EU) 2016/679 (GDPR)](https://eur-lex.europa.eu/eli/reg/2016/679/oj) — in particular Article 17 (erasure) and Article 15 (access)
- [Regulation (EU) 2024/1689 (AI Act)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) — transparency obligations; Annex III high-risk categories; deployer obligations under Article 26
- [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) — Zero Trust Architecture

### G.5 Architectural patterns

- [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — AWS Prescriptive Guidance; atomicity of state change and event publication (`[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]`)
- [SaaS Tenant Isolation Strategies — silo, pool and bridge models](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html) — AWS Well-Architected SaaS Lens (`[[REQ-OPS#PLX-OPS-002|PLX-OPS-002]]`, `[[Risk Register#PLX-RSK-07|PLX-RSK-07]]`)
- [Eventsourcing Patterns: Crypto-Shredding](https://verraes.net/2019/05/eventsourcing-patterns-throw-away-the-key/) — Mathias Verraes; cryptographic erasure in append-only stores (§69.7, `[[Risk Register#PLX-RSK-01|PLX-RSK-01]]`)
- [GDPR considerations for event-sourced systems](https://railseventstore.org/docs/v1/gdpr/) — Rails Event Store; practical erasure strategies
- [Real Differences between OT and CRDT for Consistency Maintenance in Co-Editors](https://dl.acm.org/doi/10.1145/3392825) — Sun et al., PACM HCI; OT/CRDT comparison underlying `[[REQ-SYN#PLX-SYN-001|PLX-SYN-001]]`

---
