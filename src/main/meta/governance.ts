// Engineering and architecture governance, made checkable (spec §6, §72, §73, §74,
// §85, REQ-ENG/ARC/AI). Philosophy 1 rejects functionality that degrades Context
// (ENG-010); a feature is not done with a Definition-of-Done gate unmet unless the
// exception is a recorded accepted risk (ENG-020); a milestone needs its foreclosing
// decisions resolved as ADRs (ENG-030); every service publishes machine-readable API
// and Event contracts (ARC-020); and each deployed AI capability keeps a regulatory
// record (AI-045).

// ── ENG-010 — Philosophy 1 gate ──────────────────────────────────────────────
export interface ChangeAssessment {
  functionalityDelta: number // positive = more functionality
  contextAccuracyDelta: number // negative = less accurate/fresh context
}
// A change that increases functionality while reducing the accuracy or freshness of
// Context is rejected (ENG-010).
export function changeAllowedByPhilosophy1(a: ChangeAssessment): boolean {
  return !(a.functionalityDelta > 0 && a.contextAccuracyDelta < 0)
}

// ── ENG-020 — Definition-of-Done gate ────────────────────────────────────────
export interface DoDGate {
  name: string
  met: boolean
}
export interface AcceptedRisk {
  gate: string
  owner: string
  remediationDate: string
}
// A feature is done only when every gate is met, or an unmet gate is covered by a
// recorded accepted risk with a named owner and remediation date (ENG-020).
export function featureDone(gates: DoDGate[], exceptions: AcceptedRisk[] = []): boolean {
  const excused = new Set(exceptions.filter((e) => e.owner && e.remediationDate).map((e) => e.gate))
  return gates.every((g) => g.met || excused.has(g.name))
}

// ── ENG-030 — milestone requires resolved foreclosing decisions ──────────────
export interface ForeclosingDecision {
  id: string
  resolvedByAdr: string | null
}
// A milestone is complete only when every foreclosing decision it depends on is
// resolved and recorded as an ADR (ENG-030).
export function milestoneReady(decisions: ForeclosingDecision[]): boolean {
  return decisions.every((d) => !!d.resolvedByAdr)
}
export function unresolvedForeclosing(decisions: ForeclosingDecision[]): string[] {
  return decisions.filter((d) => !d.resolvedByAdr).map((d) => d.id)
}

// ── ARC-020 — service contracts published ────────────────────────────────────
interface ServiceContract {
  service: string
  apiContract: string | null // OpenAPI or equivalent
  eventContract: string | null // AsyncAPI or equivalent (the Event schema registry)
  version: string
}
const SERVICE_CONTRACTS = new Map<string, ServiceContract>()
export function registerServiceContract(c: ServiceContract): void {
  SERVICE_CONTRACTS.set(c.service, c)
}
// A service is contract-complete only when it publishes both an API and an Event
// contract, versioned (ARC-020).
export function serviceContractComplete(service: string): boolean {
  const c = SERVICE_CONTRACTS.get(service)
  return !!c && !!c.apiContract && !!c.eventContract && !!c.version
}

// ── AI-045 — per-capability regulatory record ────────────────────────────────
export interface RegulatoryRecord {
  capability: string
  jurisdiction: string
  modelIdentity: string
  purpose: string
  dataCategories: string[]
  humanOversight: string
}
export function assertRegulatoryRecord(r: Partial<RegulatoryRecord>): asserts r is RegulatoryRecord {
  const required: (keyof RegulatoryRecord)[] = ['capability', 'jurisdiction', 'modelIdentity', 'purpose', 'humanOversight']
  const missing = required.filter((k) => !r[k])
  if (missing.length > 0) throw new Error(`A deployed AI capability MUST keep a regulatory record; missing ${missing.join(', ')} (PLX-AI-045).`)
}
