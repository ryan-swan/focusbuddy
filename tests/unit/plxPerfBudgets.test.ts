// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { memSqlDb } from './_memdb'
import { seedWorkspace, PERF_PROFILES, type SeededWorkspace } from '../../src/main/perf/seed'
import { measure, checkBudget, type BudgetCheck } from '../../src/main/perf/benchmark'
import { deriveHealthSnapshot } from '../../src/main/context/health'
import { propagateHealth, graphFromRelationships } from '../../src/main/context/propagation'
import { generateResume } from '../../src/main/resume/resume'
import { createRelationshipStore } from '../../src/main/db/relationshipStore'
import { rankSearch, type SearchCandidate } from '../../src/main/search/ranking'
import type { MaterialityInput } from '../../src/main/context/materiality'

// Performance budgets under seeded small/medium/large team load (spec §58). The
// benchmark measures the REAL deterministic code paths and asserts the spec p99
// budgets at the MEDIUM (reference) load; small and large are recorded for scale
// visibility. Operations that are end-to-end UI/gateway/live-model (PERF-001/002/
// 010/012/041/050) or production-instrumentation (PERF-070+) are out of scope here.

const material: MaterialityInput = {
  affectedObjectCount: 8, decisionImpact: 'high', relationshipDepth: 1,
  organisationalReach: 'org', userRole: 'owner', workflowStage: 'final', historicalSignificance: 0.6
}

function buildWorkspaces(): Record<string, SeededWorkspace> {
  const out: Record<string, SeededWorkspace> = {}
  for (const name of ['small', 'medium', 'large'] as const) out[name] = seedWorkspace(memSqlDb(), PERF_PROFILES[name])
  return out
}

// One benchmark closure per operation, over a given seeded workspace.
function benchOps(ws: SeededWorkspace): Record<string, () => void> {
  const rels = createRelationshipStore(ws.db, ws.org)
  const graph = graphFromRelationships(rels)
  const object = ws.objectIds[Math.floor(ws.objectIds.length / 2)]
  const desk = ws.deskIds[Math.floor(ws.deskIds.length / 2)]
  const deskObjects = ws.objectIds.filter((o) => o.startsWith(`${desk.replace('desk-', 'obj-')}-`))
  const candidates: SearchCandidate[] = ws.objectIds.slice(0, 500).map((id, i) => ({ id, keywordScore: (i % 10) / 10, semanticScore: (i % 7) / 7, embeddingStale: i % 5 === 0 }))
  return {
    healthDirect: () => deriveHealthSnapshot(ws.db, 'user-0', object, material, []),
    healthPropagated: () => propagateHealth(object, graph),
    resume: () => generateResume(ws.db, { deskId: desk, forUserId: 'user-0', objectIds: [desk, ...deskObjects], sinceCursor: -1 }),
    traversal: () => rels.activeFor(object),
    search: () => rankSearch(candidates, () => true)
  }
}

// operation -> [spec req, p99 budget ms]
const BUDGETS: Record<string, { req: string; p99: number }> = {
  healthDirect: { req: 'PLX-PERF-020', p99: 250 },
  healthPropagated: { req: 'PLX-PERF-021', p99: 500 },
  resume: { req: 'PLX-PERF-011', p99: 2000 },
  traversal: { req: 'PLX-PERF-022', p99: 250 },
  search: { req: 'PLX-PERF-040', p99: 300 }
}

describe('performance budgets under seeded team load (spec §58)', () => {
  const workspaces = buildWorkspaces()
  const report: BudgetCheck[] = []
  for (const [name, ws] of Object.entries(workspaces)) {
    const ops = benchOps(ws)
    for (const [op, budget] of Object.entries(BUDGETS)) {
      report.push(checkBudget(op, name, measure(ops[op], name === 'large' ? 60 : 150), budget.p99))
    }
  }
  try {
    mkdirSync('build', { recursive: true })
    writeFileSync('build/perf.report.json', JSON.stringify(report, null, 2))
  } catch {
    /* report is best-effort */
  }
  const medium = (op: string): BudgetCheck => report.find((r) => r.profile === 'medium' && r.operation === op)!

  it('test_plx_perf_020_context_health_direct_under_budget', () => {
    const r = medium('healthDirect')
    expect(r.p99, `direct health p99=${r.p99.toFixed(2)}ms budget=${r.budgetP99Ms}`).toBeLessThanOrEqual(r.budgetP99Ms)
  })
  it('test_plx_perf_021_context_health_propagated_under_budget', () => {
    const r = medium('healthPropagated')
    expect(r.p99, `propagated health p99=${r.p99.toFixed(2)}ms`).toBeLessThanOrEqual(r.budgetP99Ms)
  })
  it('test_plx_ctx_014_health_meets_both_perf_budgets', () => {
    // CTX-014: direct AND propagated are separate budgets and both must be met.
    expect(medium('healthDirect').withinBudget).toBe(true)
    expect(medium('healthPropagated').withinBudget).toBe(true)
  })
  it('test_plx_perf_011_resume_deterministic_under_budget', () => {
    const r = medium('resume')
    expect(r.p99, `resume p99=${r.p99.toFixed(2)}ms`).toBeLessThanOrEqual(r.budgetP99Ms)
  })
  it('test_plx_perf_022_graph_traversal_under_budget', () => {
    const r = medium('traversal')
    expect(r.p99, `traversal p99=${r.p99.toFixed(2)}ms`).toBeLessThanOrEqual(r.budgetP99Ms)
  })
  it('test_plx_perf_040_search_under_budget', () => {
    const r = medium('search')
    expect(r.p99, `search p99=${r.p99.toFixed(2)}ms`).toBeLessThanOrEqual(r.budgetP99Ms)
  })
  it('test_plx_sch_004_search_meets_budget_ai_off', () => {
    expect(medium('search').withinBudget).toBe(true) // SCH-004: search meets PERF-040 with AI re-ranking disabled
  })
  it('seeded all three team scales', () => {
    expect(workspaces.small.profile.events).toBe(2000)
    expect(workspaces.medium.profile.events).toBe(20000)
    expect(workspaces.large.profile.events).toBe(100000)
  })
})
