import { describe, it, expect } from 'vitest'
import { toProjectXml } from '../../src/shared/projectXml'
import type { ProjectPlan, PlanTask } from '../../src/shared/projects'

function task(over: Partial<PlanTask>): PlanTask {
  return {
    id: 't1',
    title: 'Task',
    status: 'open',
    isMilestone: false,
    planStart: null,
    planDue: null,
    estimateMinutes: null,
    assignee: null,
    progressPct: 0,
    startedAt: null,
    completedAt: null,
    scheduledStartMs: new Date(2026, 0, 1).getTime(),
    scheduledEndMs: new Date(2026, 0, 3).getTime(),
    durationDays: 2,
    slackDays: 0,
    critical: true,
    deps: [],
    baselineStartMs: null,
    baselineEndMs: null,
    mustStartMs: null,
    deadlineMs: null,
    deadlineMiss: false,
    cost: null,
    ...over
  }
}

const plan: ProjectPlan = {
  projectId: 'p1',
  title: 'Launch Plan',
  anchorMs: new Date(2026, 0, 1).getTime(),
  projectEndMs: new Date(2026, 0, 6).getTime(),
  tasks: [task({ id: 'a', title: 'Design', assignee: 'Alice' }), task({ id: 'b', title: 'Build', deps: ['a'], progressPct: 50 })],
  deps: [{ id: 'd1', predId: 'a', succId: 'b', type: 'FS', lag: 1 }],
  criticalPath: ['a', 'b'],
  hasCycle: false,
  drift: [],
  hasBaseline: false,
  totalCost: 0
}

describe('toProjectXml (MSPDI)', () => {
  const xml = toProjectXml(plan)

  it('is a Project document with the title', () => {
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">')
    expect(xml).toContain('<Name>Launch Plan</Name>')
  })
  it('emits a task per plan task with name + percent complete', () => {
    expect(xml).toContain('<Name>Design</Name>')
    expect(xml).toContain('<Name>Build</Name>')
    expect(xml).toContain('<PercentComplete>50</PercentComplete>')
  })
  it('emits a typed predecessor link with the FS code (1) and lag', () => {
    expect(xml).toContain('<PredecessorLink>')
    expect(xml).toContain('<Type>1</Type>') // FS
    // lag 1 working day = 1*8*60*10 tenths-of-minutes = 4800
    expect(xml).toContain('<LinkLag>4800</LinkLag>')
  })
  it('emits a resource for the assignee and an assignment', () => {
    expect(xml).toContain('<Name>Alice</Name>')
    expect(xml).toContain('<Assignment>')
    expect(xml).toContain('<ResourceUID>1</ResourceUID>')
  })
  it('escapes XML special characters in titles', () => {
    const x = toProjectXml({ ...plan, title: 'A & B <test>' })
    expect(x).toContain('A &amp; B &lt;test&gt;')
  })
})
