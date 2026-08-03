# Plexi — specification vault

This repository is the **normative specification** for Plexi, a Context Operating System. It is not documentation of an existing system. It is the contract the system must be built to satisfy.

You are implementing from it. Read this file first, then the note the task points you at.

---

## Hard rules

**1. Requirements are binding, narrative is not.**
Anything in a table row with a `PLX-*` identifier and an RFC 2119 keyword (`MUST`, `MUST NOT`, `SHOULD`, `MAY` — capitalised) is binding. Surrounding prose explains intent and binds nothing. Where they disagree, the requirement wins. Precedence is: invariants → requirements → schemas → prose → diagrams.

**2. Cite the requirement in the test name.**
Every requirement you implement gets a test named for its ID: `PLX-EVT-014` → `test_plx_evt_014_*`. This is not a style preference — `PLX-ENG-021` makes requirement-to-test traceability machine-checkable, and gate 13 of the Definition of Done blocks on it. Untraceable work is unfinished work.

**3. Never resolve an open decision silently.**
`registers/Risk Register.md` holds 14 unresolved decisions. Five of them are **foreclosing** — the cost of changing your mind rises by orders of magnitude once production data exists. If an implementation forces one of these questions, **stop, write an ADR in `decisions/`, and ask.** Do not pick the convenient option and move on. Do not infer that a decision was made because a code path needs one.

**4. Invariants need detection tests, not just compliance.**
`registers/Invariants.md` holds 13 invariants. Each needs a test that **fails when the invariant is violated**, not merely a code path that happens to respect it (`PLX-ENG-001`). If you cannot write a test that catches the violation, you have not enforced the invariant.

**5. Deterministic first, AI second — always.**
`PLX-EVT-020`: deterministic processing completes before AI is invoked. `PLX-ARC-022`: no service requires a live AI Orchestrator to serve its core capability. If your design puts a model call on the critical path of Desk open, Context Health, or Relationship confirmation, the design is wrong. Loss of AI degrades the product to deterministic operation, never to unavailability.

**6. Permission checks belong at the data-access layer.**
`PLX-SEC-020`. Not the gateway. Not the orchestration layer. Not a prompt instruction — especially not a prompt instruction. Telling a model to withhold something you have already given it is not an access control (`PLX-AI-006`).

**7. When the spec is silent, say so.**
Gaps are real and expected — Part VIII is undrafted, and Appendix H §H.5 lists known open editorial items. Flag the gap and propose. Do not fill it with a plausible invention and leave it looking specified.

---

## Where to start, by task

| If you are… | Read this first |
|---|---|
| Implementing a service | `services/<Service Name>.md` — the implementation brief. Everything binding on that unit, quoted in full, in one file. |
| Implementing an entity or schema | `entities/<Entity>.md`, then `04-domain-model/S32 Canonical Entity Model.md` |
| Working on events | `services/Event Service.md`, `05-platform-architecture/S48 Event Architecture.md`, `06-data-apis-security/S64 Event Contracts.md` |
| Adding an API | `06-data-apis-security/S63 Canonical API Design.md` |
| Anything touching AI | `06-data-apis-security/S67 AI Prompt Framework.md`, `S70 AI Governance.md`, `05-platform-architecture/S55 AI Orchestration.md` |
| Anything touching permissions | `06-data-apis-security/S69 Security Architecture.md`, `registers/Invariants.md` → `PLX-INV-06` |
| Performance work | `05-platform-architecture/S58 Performance Requirements.md` — targets carry percentiles, measurement points and a defined reference load. All three, or it is not a target. |
| Checking whether something is decided | `registers/Risk Register.md` and `decisions/` |
| Finding a requirement by ID | `registers/REQ-<AREA>.md`, or grep the ID — every occurrence is either its definition heading or a citation |
| Querying requirements in bulk | `_index/requirements.json` — all 344 in one read |

**The service briefs in `services/` are the highest-value entry point.** Each inlines every binding requirement for that unit — its contract, its events, its SLOs, the invariants it can violate, and the open decisions blocking it — so you can read one file and start, rather than assembling context from twelve.

---

## Machine-readable indexes

`_index/` exists so you can answer questions in one read instead of traversing notes:

| File | Contents |
|---|---|
| `requirements.json` | All 344 with area, section, statement, verification method, derivation |
| `requirements.csv` | Same, for spreadsheet or line-oriented work |
| `invariants.json` | 13 invariants and which services can violate each |
| `risks.json` | 14 open decisions: severity, deadline, which services they block |
| `services.json` | Service contracts: owns, must-not, store, events emitted and consumed, requirement set |

Generated — do not hand-edit. Regenerate with `build/mkvault.py`.

---

## Vault structure

```
CLAUDE.md                        ← you are here
Home.md                          ← human entry point / map of content
_index/                          ← generated JSON + CSV for one-shot querying
00-meta/                         ← §0 conventions
01-vision/                       ← §1–8      Part I
02-product-model/                ← §9–17     Part II
03-user-experience/              ← §18–29    Part III
04-domain-model/                 ← §30–44    Part IV
05-platform-architecture/        ← §45–60    Part V
06-data-apis-security/           ← §61–75    Part VI
07-applications-agents-roadmap/  ← §76–88    Part VII
registers/                       ← REQ-<AREA> ×24, Invariants, Risk Register, Appendices A–H
entities/                        ← 10 domain entities: schema + binding requirements
services/                        ← 11 implementation briefs   ← START HERE for build work
decisions/                       ← 14 ADR stubs, all status OPEN
build/                           ← regeneration and verification scripts
```

Section notes are named `S<nn> <Title>.md` so they sort correctly and grep predictably. Links are Obsidian wikilinks (`[[S48 Event Architecture]]`); requirement links target an anchor heading in the register (`[[REQ-EVT#PLX-EVT-014]]`).

---

## Conventions you must follow when writing code

**Identifiers.** UUIDv7 — client-generable, time-ordered (`PLX-DOM-010`). Not UUIDv4. Not auto-increment. Forced by offline capability plus event-store locality.

**Events.** Past tense, PascalCase in domain code; reverse-DNS with explicit version on the wire: `com.plexi.object.updated.v1` (`PLX-EVT-041`). CloudEvents v1.0.2 envelope with `plexi*` extension attributes (`PLX-EVT-040`). A command-shaped event name fails CI lint.

**Event emission.** Transactional outbox, always (`PLX-EVT-014`). State change and event publication are atomic or neither happens. Write-then-publish is a defect, not a shortcut.

**Consumers.** Idempotent, always (`PLX-EVT-015`). At-least-once delivery is assumed. Order by `sequence` within a partition, never by wall-clock timestamp (`PLX-EVT-013`).

**Large content.** Referenced by digest, never inlined in event payloads (`PLX-DOM-032`). This bounds event-store growth and confines personal data so crypto-shredding remains possible.

**Tenancy.** Every entity carries `organisationId`; every data-access path filters on it at the persistence layer, not in application code (`PLX-DOM-011`).

**Derived stores.** Graph, vector, search, Context DB and Resume DB are **projections**, never systems of record, and must be rebuildable from the Event Store (`PLX-DATA-002`, `PLX-DATA-003`). If you find yourself needing to back one up as authoritative, you have created a system of record nobody agreed to.

**AI output.** Marked `ai_generated` in storage and at every point of display and export (`PLX-DOM-014`, `PLX-UX-062`). Provenance never downgrades to `human`.

---

## What "done" means

`06-data-apis-security/S74 Definition of Done.md` has 14 gates, all blocking. The three most often skipped:

- **Gate 12** — every invariant the feature could violate has a passing detection test
- **Gate 13** — every requirement implemented is linked to its verifying test
- **Gate 14** — AI and infrastructure cost delta measured

A feature is not done because it works. It is done when it is traceable.

---

## Known gaps

- **Part VIII is undrafted.** Ten items other sections depend on it for are listed in `07-applications-agents-roadmap/S88 Part VIII — Forward Reference.md`.
- **All 14 ADRs are status OPEN.** Nothing in `decisions/` has been resolved.
- **Reference load figures in §58 are stated assumptions, not measured.** Re-derive before treating any latency target as validated.
- **Requirement-to-test traceability is specified but no test suite exists yet.** `PLX-ENG-021` describes the check; building it is unstarted.

---

## Verification

```bash
python3 build/mkvault.py       # rebuild vault from the master document
python3 build/checklinks.py    # 0 broken wikilinks and anchors required
python3 build/assemble.py      # refresh the single-file circulation copy
```
