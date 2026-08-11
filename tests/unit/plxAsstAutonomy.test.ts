import { describe, it, expect } from 'vitest'
import {
  resolveAutonomy,
  canActAutonomously,
  type AutonomyPolicy
} from '../../src/renderer/src/lib/autonomyPolicy'

// The autonomy resolver decides how much an assistant may do on its own, across
// three scopes (org ceiling/default, system, per-assistant). These lock the
// precedence and the org-ceiling clamp — the safety property that a user can never
// push an assistant ABOVE what their org allows.

describe('resolveAutonomy — precedence', () => {
  it('falls back to the built-in default when nothing is set', () => {
    const r = resolveAutonomy({})
    expect(r.level).toBe('ask')
    expect(r.source).toBe('system-default')
  })

  it('org default applies when the user has set nothing', () => {
    const p: AutonomyPolicy = { orgDefault: 'manual' }
    expect(resolveAutonomy(p)).toMatchObject({ level: 'manual', source: 'org-default' })
  })

  it('system choice overrides the org default', () => {
    const p: AutonomyPolicy = { orgDefault: 'manual', systemChoice: 'auto' }
    // No ceiling here, so the user's system choice wins.
    expect(resolveAutonomy(p)).toMatchObject({ level: 'auto', source: 'system' })
  })

  it('a per-assistant choice is the most specific and wins', () => {
    const p: AutonomyPolicy = { systemChoice: 'ask', assistantChoices: { standup: 'auto' } }
    expect(resolveAutonomy(p, 'standup')).toMatchObject({ level: 'auto', source: 'assistant' })
    // A different assistant with no override inherits the system choice.
    expect(resolveAutonomy(p, 'other')).toMatchObject({ level: 'ask', source: 'system' })
  })
})

describe('resolveAutonomy — org ceiling clamps', () => {
  it('caps a system choice that exceeds the org ceiling', () => {
    const p: AutonomyPolicy = { orgCeiling: 'ask', systemChoice: 'auto' }
    const r = resolveAutonomy(p)
    expect(r.level).toBe('ask')
    expect(r.cappedByOrg).toBe(true)
    // Source still records where the (over-)ambitious choice came from.
    expect(r.source).toBe('system')
  })

  it('caps a per-assistant choice that exceeds the ceiling', () => {
    const p: AutonomyPolicy = { orgCeiling: 'manual', assistantChoices: { x: 'auto' } }
    expect(resolveAutonomy(p, 'x')).toMatchObject({ level: 'manual', cappedByOrg: true })
  })

  it('does not raise a choice that is already below the ceiling', () => {
    const p: AutonomyPolicy = { orgCeiling: 'auto', systemChoice: 'manual' }
    expect(resolveAutonomy(p)).toMatchObject({ level: 'manual', cappedByOrg: false })
  })
})

describe('canActAutonomously', () => {
  it('manual and ask never self-act', () => {
    expect(canActAutonomously('manual', 'low')).toBe(false)
    expect(canActAutonomously('ask', 'low')).toBe(false)
  })
  it('auto self-acts on low risk but still asks on high risk', () => {
    expect(canActAutonomously('auto', 'low')).toBe(true)
    expect(canActAutonomously('auto', 'high')).toBe(false)
  })
})
