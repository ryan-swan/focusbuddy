import { describe, it, expect } from 'vitest'
import {
  coerceAgentStatus,
  normalizeBlocker,
  enforceAgentStatus,
  parseVerifyResult
} from '../../src/main/ai/agentEnvelope'

// Pure tests for the agent-step envelope discipline: status coercion, blocker
// normalisation, and the honesty downgrades (empty-blocker dead-end, and a
// 'done' that ignores prior failures).

describe('coerceAgentStatus', () => {
  it('passes known statuses through', () => {
    for (const s of ['working', 'done', 'blocked', 'need_input'] as const) {
      expect(coerceAgentStatus(s)).toBe(s)
    }
  })
  it('defaults unknown/absent to working (keep going, not a silent dead-end)', () => {
    expect(coerceAgentStatus('finished')).toBe('working')
    expect(coerceAgentStatus(undefined)).toBe('working')
    expect(coerceAgentStatus(3)).toBe('working')
  })
})

describe('normalizeBlocker', () => {
  it('keeps meaningful text (trimmed), else null', () => {
    expect(normalizeBlocker('  need the client name  ')).toBe('need the client name')
    expect(normalizeBlocker('')).toBeNull()
    expect(normalizeBlocker('   ')).toBeNull()
    expect(normalizeBlocker(42)).toBeNull()
    expect(normalizeBlocker(undefined)).toBeNull()
  })
})

describe('enforceAgentStatus', () => {
  const base = { actionCount: 0, narration: '', priorFailedCount: 0 }

  it('downgrades blocked/need_input with no reason to working', () => {
    expect(enforceAgentStatus({ ...base, status: 'blocked', blocker: null })).toEqual({ status: 'working', blocker: null })
    expect(enforceAgentStatus({ ...base, status: 'need_input', blocker: null })).toEqual({ status: 'working', blocker: null })
  })

  it('keeps a blocked/need_input that has a reason', () => {
    expect(enforceAgentStatus({ ...base, status: 'need_input', blocker: 'Which client?' })).toEqual({
      status: 'need_input',
      blocker: 'Which client?'
    })
  })

  it('keeps done when there were no prior failures', () => {
    expect(enforceAgentStatus({ ...base, status: 'done', blocker: null, priorFailedCount: 0 })).toEqual({
      status: 'done',
      blocker: null
    })
  })

  it('downgrades a done that ignored prior failures (claimed done, did nothing, no acknowledgement)', () => {
    const r = enforceAgentStatus({ status: 'done', blocker: null, actionCount: 0, narration: 'All set!', priorFailedCount: 2 })
    expect(r.status).toBe('blocked')
    expect(r.blocker).toMatch(/2 actions failed/)
  })

  it('keeps done when the failures were retried this round (actions present)', () => {
    expect(
      enforceAgentStatus({ status: 'done', blocker: null, actionCount: 1, narration: 'All set!', priorFailedCount: 2 })
    ).toEqual({ status: 'done', blocker: null })
  })

  it('keeps done when narration acknowledges the failure', () => {
    expect(
      enforceAgentStatus({ status: 'done', blocker: null, actionCount: 0, narration: "Couldn't set the cell; leaving it.", priorFailedCount: 1 })
    ).toEqual({ status: 'done', blocker: null })
  })

  it('does not touch working even with prior failures (only done is policed)', () => {
    expect(enforceAgentStatus({ ...base, status: 'working', blocker: null, priorFailedCount: 3 })).toEqual({
      status: 'working',
      blocker: null
    })
  })
})

describe('parseVerifyResult', () => {
  it('reads an explicit met verdict + gaps', () => {
    expect(parseVerifyResult('{"met":true,"score":0.95,"gaps":[]}')).toEqual({ met: true, score: 0.95, gaps: [] })
    expect(parseVerifyResult('{"met":false,"score":0.4,"gaps":["no table","no agent"]}')).toEqual({
      met: false,
      score: 0.4,
      gaps: ['no table', 'no agent']
    })
  })
  it('clamps score to [0,1]', () => {
    expect(parseVerifyResult('{"met":true,"score":1.7,"gaps":[]}').score).toBe(1)
    expect(parseVerifyResult('{"met":false,"score":-2,"gaps":["x"]}').score).toBe(0)
  })
  it('derives met from a high score + no gaps when met is absent', () => {
    expect(parseVerifyResult('{"score":0.95,"gaps":[]}').met).toBe(true)
    expect(parseVerifyResult('{"score":0.95,"gaps":["one thing left"]}').met).toBe(false)
    expect(parseVerifyResult('{"score":0.6,"gaps":[]}').met).toBe(false)
  })
  it('tolerates prose around the JSON', () => {
    expect(parseVerifyResult('Here is my verdict: {"met":true,"score":1,"gaps":[]} done').met).toBe(true)
  })
  it('an unreadable verdict is NOT met (never passes a goal by accident)', () => {
    expect(parseVerifyResult('I cannot produce JSON')).toEqual({ met: false, score: 0, gaps: [] })
  })
})
