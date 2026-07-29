---
type: appendix
appendix: D
title: "Event Type Catalogue"
tags:
  - appendix
---

# Appendix D — Event Type Catalogue

[[Home|▲ Home]]

---

Event names are past tense, PascalCase in domain usage, and reverse-DNS with an explicit version on the wire: `com.plexi.<aggregate>.<pasttenseverb>.v<n>` (§64.2).

Every Event carries a category (`[[REQ-EVT#PLX-EVT-023|PLX-EVT-023]]`) and an owning service ([[S47 Service Architecture|§47]]).

| Event | Category | Owner | Notes |
|---|---|---|---|
| `DeskCreated` | Lifecycle | Workspace | |
| `DeskActivated` | Lifecycle | Workspace | |
| `DeskPaused` | Lifecycle | Workspace | |
| `DeskArchived` | Lifecycle | Workspace | Never destroys content (`[[REQ-PRD#PLX-PRD-005|PLX-PRD-005]]`) |
| `DeskArchetypeChanged` | Administrative | Workspace | `[[REQ-PRD#PLX-PRD-003|PLX-PRD-003]]` |
| `LayoutChanged` | User | Workspace | Per (user, Desk, device class) |
| `SessionStarted` | User | Workspace | |
| `SessionEnded` | User | Workspace | Triggers snapshot |
| `ObjectPlaced` | User | Workspace | Visual only |
| `ObjectMoved` | User | Workspace | Visual only |
| `ObjectResized` | User | Workspace | Visual only |
| `ObjectCreated` | User | Object | |
| `ObjectUpdated` | User | Object | Content by digest (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`) |
| `ObjectVersioned` | User | Object | |
| `ObjectShared` | User | Object | Carries sync mode |
| `ObjectArchived` | Lifecycle | Object | |
| `ObjectDeleted` | Lifecycle | Object | Visibility only (`[[Invariants#PLX-INV-05|PLX-INV-05]]`) |
| `ObjectViewed` | User | Object | Presence-class retention |
| `ObjectCommented` | User | Object | |
| `ObjectMentioned` | User | Object | |
| `ObjectAssigned` | User | Object | |
| `ObjectCompleted` | Lifecycle | Object | |
| `ObjectMerged` | User | Object | |
| `ObjectSplit` | User | Object | |
| `ObjectImported` | Integration | Object | |
| `ObjectExported` | Integration | Object | |
| `RelationshipDiscovered` | System | Graph | Always provisional if AI-originated |
| `RelationshipConfirmed` | User / System | Graph | Records threshold if auto-promoted |
| `RelationshipRejected` | User | Graph | Retained (`[[REQ-GPH#PLX-GPH-005|PLX-GPH-005]]`) |
| `RelationshipSuperseded` | System | Graph | |
| `DuplicateDetected` | System | Graph | Asynchronous (`[[REQ-GPH#PLX-GPH-013|PLX-GPH-013]]`) |
| `ClusterFormed` | System | Graph | Asynchronous |
| `DecisionProposed` | User | Object | |
| `DecisionReviewRequested` | Workflow | Automation | |
| `DecisionApproved` | User | Object | Human approver only (`[[REQ-DOM#PLX-DOM-040|PLX-DOM-040]]`) |
| `DecisionRejected` | User | Object | |
| `DecisionImplemented` | User | Object | |
| `DecisionSuperseded` | User | Object | Triggers Context Health re-evaluation |
| `DecisionCancelled` | User | Object | |
| `ContextHealthChanged` | System | Context | Records materiality and propagation path |
| `MaterialityScored` | System | Context | Records function version (`[[REQ-CTX#PLX-CTX-021|PLX-CTX-021]]`) |
| `DependencyImpactDetected` | System | Context | |
| `ContextGenerated` | System | Context | |
| `AttentionRaised` | System | Context | |
| `ResumeGenerated` | System | Resume | |
| `ResumeSuperseded` | System | Resume | |
| `MemoryCompressed` | System | Resume | Never deletes Events (`[[REQ-PRD#PLX-PRD-032|PLX-PRD-032]]`) |
| `CatchupEstimated` | System | Resume | |
| `SearchExecuted` | User | Search | |
| `EmbeddingUpdated` | System | Search | |
| `ReasoningRequested` | AI | Orchestrator | |
| `ReasoningCompleted` | AI | Orchestrator | Records model, tokens, cost |
| `ReasoningRejected` | AI | Orchestrator | Capability mismatch (`[[REQ-AI#PLX-AI-003|PLX-AI-003]]`) |
| `ModelRouted` | AI | Orchestrator | Records routing rationale |
| `CostRecorded` | AI | Orchestrator | |
| `CostCeilingExceeded` | AI | Orchestrator | Suspends, never degrades (`[[REQ-AI#PLX-AI-030|PLX-AI-030]]`) |
| `AiSuggested` | AI | Orchestrator | |
| `AiAccepted` | AI | Orchestrator | |
| `AiRejected` | AI | Orchestrator | High-value training signal |
| `AgentCompletedTask` | AI | Orchestrator | |
| `AgentSuspended` | AI | Orchestrator | Cost ceiling or missing principal |
| `WorkflowStarted` | Workflow | Automation | |
| `WorkflowStepCompleted` | Workflow | Automation | |
| `WorkflowCompleted` | Workflow | Automation | |
| `WorkflowFailed` | Workflow | Automation | |
| `WorkflowPaused` | Workflow | Automation | |
| `WorkflowResumed` | Workflow | Automation | |
| `ApprovalRequested` | Workflow | Automation | |
| `ApprovalGranted` | Workflow | Automation | Human only |
| `ApprovalDeclined` | Workflow | Automation | |
| `ConnectorConnected` | Integration | Connector | |
| `ConnectorDisconnected` | Integration | Connector | Never destroys context (`[[REQ-CON#PLX-CON-006|PLX-CON-006]]`) |
| `ConnectorSyncStarted` | Integration | Connector | |
| `ConnectorSyncCompleted` | Integration | Connector | |
| `ConnectorSyncFailed` | Integration | Connector | User-visible (`[[REQ-CON#PLX-CON-007|PLX-CON-007]]`) |
| `ExternalObjectImported` | Integration | Connector | |
| `UserCreated` | Administrative | Identity | |
| `UserDeactivated` | Administrative | Identity | Triggers ownership reassignment |
| `RoleAssigned` | Security | Identity | |
| `PermissionChanged` | Security | Identity | Propagates to derived stores |
| `PolicyChanged` | Security | Identity | |
| `AuthenticationFailed` | Security | Identity | |
| `ErasureExecuted` | Security | Identity | Key destruction (§44.1) |
| `ReplayStarted` | Administrative | Event | |
| `ReplayCompleted` | Administrative | Event | |
| `RetentionPolicyApplied` | Administrative | Event | Cannot prune Events or alternatives |
| `ExtensionInstalled` | Administrative | Identity | Records granted capabilities |
| `ExtensionActionPerformed` | Administrative | Identity | Records `onBehalfOf` |

---
