import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ActionProposal } from '../../src/shared/types'
import { resolveProposalDesk } from '../../src/renderer/src/lib/proposalDesk'

// DEC-032 — a desk-placed proposal may name the desk it belongs on, so the card
// applies it there instead of stopping to ask the user for a desk the
// assistant had already identified (operator live QA).

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8')

const DESKS = [
  { id: 'desk-cetra', title: 'Cetra Partners' },
  { id: 'desk-prep', title: 'Meeting Prep' }
]

const page = (deskId?: string): ActionProposal =>
  ({ id: 'p1', kind: 'create-page', title: 'Pitch deck', content: '{}', deskId }) as ActionProposal

describe('resolveProposalDesk', () => {
  it('resolves an exact id from the roster', () => {
    expect(resolveProposalDesk(page('desk-cetra'), DESKS)).toBe('desk-cetra')
  })

  it('accepts a title when the model named one instead of an id', () => {
    expect(resolveProposalDesk(page('Cetra Partners'), DESKS)).toBe('desk-cetra')
    expect(resolveProposalDesk(page('  cetra partners '), DESKS)).toBe('desk-cetra')
  })

  it('returns null for an unknown or empty target — never a silent retarget', () => {
    // A stale/hallucinated id must fall back to the chooser, NOT to some other
    // desk that happens to be nearby.
    expect(resolveProposalDesk(page('desk-deleted'), DESKS)).toBeNull()
    expect(resolveProposalDesk(page('   '), DESKS)).toBeNull()
    expect(resolveProposalDesk(page(undefined), DESKS)).toBeNull()
    expect(resolveProposalDesk(page('desk-cetra'), [])).toBeNull()
  })

  it('a proposal kind with no deskId at all is simply unplaced', () => {
    const todo = { id: 't', kind: 'create-todo-list', title: 'x', items: ['a'] } as ActionProposal
    expect(resolveProposalDesk(todo, DESKS)).toBeNull()
  })
})

describe('the wiring that makes it matter', () => {
  it('the card prefers a named desk over the chooser, in both apply paths', () => {
    const cards = read('src/renderer/src/components/ProposalCards.tsx')
    // Single apply: resolve, then only offer the chooser when nothing resolved.
    expect(cards).toContain("from '../lib/proposalDesk'")
    expect(cards).toContain('const named = resolveProposalDesk(p, desks)')
    expect(cards).toContain('const target = named ?? activeTaskId')
    expect(cards).toContain('if (!target && isDeskCapable(p.kind))')
    // The resolved target is what actually gets applied (not activeTaskId).
    expect(cards).toContain('applyProposal(p, { activeTaskId: target')
    expect(cards).toContain('ensureDependencies(p, proposals, { activeTaskId: target')
    // Batch apply: already-placed proposals are not dragged into the chooser.
    expect(cards).toContain('isDeskCapable(p.kind) && !resolveProposalDesk(p, desks)')
  })

  it('the model is shown real desk ids and told what to do with them', () => {
    const ai = read('src/main/ai/anthropic.ts')
    // The roster exists and rides BOTH brains' context (chat + agent loop).
    expect(ai).toContain('function deskRosterBlock()')
    expect((ai.match(/deskRosterBlock\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
    // The catalog documents the field and forbids invented ids.
    expect(ai).toContain('DESK PLACEMENT')
    expect(ai).toContain('never guess an id that is not in the roster')
    // …and every desk-placed kind actually parses it.
    expect((ai.match(/deskId: deskIdOf\(action\)/g) ?? []).length).toBe(4)
    expect(ai).toContain('function deskIdOf(')
  })
})
