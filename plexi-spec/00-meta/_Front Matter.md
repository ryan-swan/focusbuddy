---
type: front-matter
tags:
  - meta
---

# Plexi

## Business Requirements Document · Product Requirements Specification · Software Architecture & Engineering Handbook

---

| Field | Value |
|---|---|
| **Document ID** | PLEXI-0001 |
| **Version** | 2.0 — Consolidated Normative Edition |
| **Supersedes** | PLEXI-0001 v1.0 (Foundational Draft), Parts I–VII issued as separate documents |
| **Status** | Living Document — Baselined for Engineering |
| **Classification** | Internal Engineering |
| **Authors** | Plexi Product & Engineering |
| **Consolidated** | 29 July 2026 |
| **Scope of this edition** | Parts I–VII, fully consolidated and restated in normative form |
| **Not yet drafted** | Part VIII — Implementation Strategy, Governance, Risk Management, Open Research (see §88) |

---

## How to read this document

This document is the **single normative source** for the Plexi platform. It consolidates seven previously separate drafts into one specification and restates their content in the form engineering, QA, security and procurement can actually build and audit against.

It is written on three levels, and you should read the level that matches your role:

**Narrative sections** explain intent. They carry no requirement IDs and bind no one. They exist so that a reader can understand *why* a requirement exists. Product, design and leadership can read narrative sections alone and have a complete picture of the product.

**Requirement tables** are normative. Every row carries a unique identifier, an RFC 2119 keyword, and a verification method. Engineering builds against these. QA tests against these. Nothing ships without its requirements verified. If a requirement and a narrative section disagree, the requirement wins.

**Registers and appendices** are the machine-readable spine: the full requirement index (Appendix A), the invariant register (Appendix B), the glossary (Appendix C), the event and relationship catalogues (Appendices D and E), the architectural risk register (Appendix F), normative references (Appendix G), and the consolidation change log (Appendix H).

**Read Appendix F before committing to an implementation.** It records fourteen unresolved tensions in this specification — places where two stated requirements pull against each other, where a stated intention has a legal or economic constraint not yet accounted for, or where a decision has been deferred that cannot safely stay deferred. Several of them are architecturally load-bearing: they must be resolved *before* Phase 1 code is written, not after. They are recorded as open issues rather than silently resolved, because resolving them is a business decision, not an editorial one.

---

## Consolidation note

The seven source drafts used continuous, non-overlapping section numbering across parts (Part I §1–8, Part II §9–17, Part III §18–29, Part IV §30–44, Part V §45–60, Part VI §61–75, Part VII §76–87). The table of contents carried in the v1.0 front matter did **not** match that numbering from Part III onward — it described a six-part document with different section ranges and a different Part V/VI split.

The body numbering has been treated as authoritative and the table of contents regenerated from it. No section has been renumbered. The discrepancy and its resolution are recorded in Appendix H. Source section numbers are preserved throughout so that anyone holding a v1.0 part can locate the corresponding material here.

---

## Table of contents

**Front matter**
- [§0 Conventions, requirement identifiers and verification](#0-conventions-requirement-identifiers-and-verification)

**Part I — Vision**
- [§1 Executive Summary](#1-executive-summary)
- [§2 The Problem](#2-the-problem)
- [§3 Why Existing Software Fails](#3-why-existing-software-fails)
- [§4 Vision](#4-vision)
- [§5 Mission](#5-mission)
- [§6 Product Philosophy](#6-product-philosophy)
- [§7 Design Principles](#7-design-principles)
- [§8 Success Criteria](#8-success-criteria)

**Part II — Product Model**
- [§9 What is Plexi?](#9-what-is-plexi)
- [§10 The Desk](#10-the-desk)
- [§11 Objects](#11-objects)
- [§12 Context](#12-context)
- [§13 Workspace Memory](#13-workspace-memory)
- [§14 Resume Intelligence](#14-resume-intelligence)
- [§15 Knowledge Graph](#15-knowledge-graph)
- [§16 Shared Objects](#16-shared-objects)
- [§17 Organisational Intelligence](#17-organisational-intelligence)

**Part III — User Experience**
- [§18 User Experience Philosophy](#18-user-experience-philosophy)
- [§19 Cognitive Design Principles](#19-cognitive-design-principles)
- [§20 Context Health](#20-context-health)
- [§21 Workspace Navigation](#21-workspace-navigation)
- [§22 Search Experience](#22-search-experience)
- [§23 Resume Experience](#23-resume-experience)
- [§24 AI Experience](#24-ai-experience)
- [§25 Collaboration](#25-collaboration)
- [§26 Notifications](#26-notifications)
- [§27 Accessibility](#27-accessibility)
- [§28 Mobile Experience](#28-mobile-experience)
- [§29 Future Interaction Models](#29-future-interaction-models)

**Part IV — Domain Model**
- [§30 Domain Model](#30-domain-model)
- [§31 Core Philosophy](#31-core-philosophy)
- [§32 Canonical Entity Model](#32-canonical-entity-model)
- [§33 Desk Entity](#33-desk-entity)
- [§34 Object Entity](#34-object-entity)
- [§35 Event Entity](#35-event-entity)
- [§36 Relationship Entity](#36-relationship-entity)
- [§37 Decision Entity](#37-decision-entity)
- [§38 Context Entity](#38-context-entity)
- [§39 Resume Entity](#39-resume-entity)
- [§40 Session Entity](#40-session-entity)
- [§41 Agent Entity](#41-agent-entity)
- [§42 Organisation Entity](#42-organisation-entity)
- [§43 Entity Relationships](#43-entity-relationships)
- [§44 Domain Invariants](#44-domain-invariants)

**Part V — Platform Architecture**
- [§45 Platform Architecture](#45-platform-architecture)
- [§46 High-Level System Architecture](#46-high-level-system-architecture)
- [§47 Service Architecture](#47-service-architecture)
- [§48 Event Architecture](#48-event-architecture)
- [§49 Event Store](#49-event-store)
- [§50 Synchronisation Engine](#50-synchronisation-engine)
- [§51 Context Engine](#51-context-engine)
- [§52 Resume Engine](#52-resume-engine)
- [§53 Knowledge Graph Runtime](#53-knowledge-graph-runtime)
- [§54 Search Architecture](#54-search-architecture)
- [§55 AI Orchestration](#55-ai-orchestration)
- [§56 Multi-Agent Architecture](#56-multi-agent-architecture)
- [§57 Connector Framework](#57-connector-framework)
- [§58 Performance Requirements](#58-performance-requirements)
- [§59 Architectural Invariants](#59-architectural-invariants)
- [§60 Engineering Principle](#60-engineering-principle)

**Part VI — Data, APIs, Security & Engineering Standards**
- [§61 Purpose](#61-purpose)
- [§62 Canonical Data Architecture](#62-canonical-data-architecture)
- [§63 Canonical API Design](#63-canonical-api-design)
- [§64 Event Contracts](#64-event-contracts)
- [§65 Knowledge Graph Schema](#65-knowledge-graph-schema)
- [§66 Workspace Memory Architecture](#66-workspace-memory-architecture)
- [§67 AI Prompt Framework](#67-ai-prompt-framework)
- [§68 AI Cost Optimisation](#68-ai-cost-optimisation)
- [§69 Security Architecture](#69-security-architecture)
- [§70 AI Governance](#70-ai-governance)
- [§71 Deployment Architecture](#71-deployment-architecture)
- [§72 Observability](#72-observability)
- [§73 Engineering Standards](#73-engineering-standards)
- [§74 Definition of Done](#74-definition-of-done)
- [§75 Engineering Manifesto](#75-engineering-manifesto)

**Part VII — Applications, Agents, Algorithms & Roadmap**
- [§76 Native Application Philosophy](#76-native-application-philosophy)
- [§77 Native Workspace Applications](#77-native-workspace-applications)
- [§78 AI Agent Framework](#78-ai-agent-framework)
- [§79 Agent Collaboration](#79-agent-collaboration)
- [§80 Context Engine Algorithms](#80-context-engine-algorithms)
- [§81 Resume Algorithms](#81-resume-algorithms)
- [§82 Collaboration Framework](#82-collaboration-framework)
- [§83 Marketplace Architecture](#83-marketplace-architecture)
- [§84 Platform SDK](#84-platform-sdk)
- [§85 Five-Year Product Roadmap](#85-five-year-product-roadmap)
- [§86 Product Success Metrics](#86-product-success-metrics)
- [§87 Long-Term Vision](#87-long-term-vision)
- [§88 Part VIII — Forward Reference](#88-part-viii--forward-reference)

**Appendices**
- [Appendix A — Requirement Index](#appendix-a--requirement-index)
- [Appendix B — Invariant Register](#appendix-b--invariant-register)
- [Appendix C — Glossary](#appendix-c--glossary)
- [Appendix D — Event Type Catalogue](#appendix-d--event-type-catalogue)
- [Appendix E — Relationship Type Catalogue](#appendix-e--relationship-type-catalogue)
- [Appendix F — Architectural Risk Register & Open Issues](#appendix-f--architectural-risk-register--open-issues)
- [Appendix G — Normative References](#appendix-g--normative-references)
- [Appendix H — Consolidation Change Log](#appendix-h--consolidation-change-log)

---
