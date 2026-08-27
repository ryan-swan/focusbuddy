import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import { startPromptForItem, startPromptForMany } from '../../src/renderer/src/lib/startPrompt'

// DEC-038 — the prompt is built from what was ALREADY captured. No model call,
// no invention; it works with the key removed.

const node = (over: Partial<FbNode> & { id: string }): FbNode =>
  ({ kind: 'work_item', title: over.id, description: '', parentId: null, isPlan: false, ...over }) as FbNode

const plan = node({ id: 'plan', kind: 'folder', isPlan: true, title: 'Q3 Launch' })
const desk = node({ id: 'desk', kind: 'task', title: 'Cetra Review', parentId: 'plan' })
const byId = new Map([plan, desk].map((n) => [n.id, n]))

describe('startPromptForItem', () => {
  it('carries the capture, its notes, and its context — verbatim', () => {
    const p = startPromptForItem(
      node({
        id: 'i',
        title: 'Draft the Cetra pitch deck',
        description: 'They asked for pricing tiers and a rollout timeline.',
        parentId: 'desk',
        intentClass: 'to_do',
        dueAt: '2026-09-04T17:00:00.000Z',
        tags: 'client,rush',
        wiUrgency: 'high'
      }),
      byId
    )
    expect(p).toContain('Draft the Cetra pitch deck')
    expect(p).toContain('They asked for pricing tiers and a rollout timeline.')
    expect(p).toContain('Where: Cetra Review')
    expect(p).toContain('Plan: Q3 Launch')
    expect(p).toContain('Urgency: high')
    expect(p).toContain('Tags: client, rush')
    expect(p).toMatch(/Due: /)
  })

  it('asks for the RIGHT KIND of help per class — deciding is not doing', () => {
    const of = (cls: string): string =>
      startPromptForItem(node({ id: 'i', title: 'X', intentClass: cls }), byId)
    expect(of('to_decide')).toContain('Lay out the real options')
    expect(of('to_respond')).toContain('Draft something I can edit')
    expect(of('to_review')).toContain('what would make it a yes')
    expect(of('to_meet')).toContain('agenda')
    expect(of('to_do')).toContain('first concrete step')
    // A legacy class still resolves through canonicalisation.
    expect(of('action')).toContain('first concrete step')
  })

  it('omits what it does not know rather than emitting empty labels', () => {
    const p = startPromptForItem(node({ id: 'i', title: 'Bare item' }), byId)
    expect(p).toContain('Bare item')
    expect(p).not.toContain('Where:')
    expect(p).not.toContain('Due:')
    expect(p).not.toContain('Tags:')
    expect(p).not.toMatch(/What I captured/)
  })
})

describe('startPromptForMany', () => {
  const a = node({ id: 'a', title: 'Call the notary', parentId: 'desk', dueAt: '2026-09-01T17:00:00.000Z' })
  const b = node({ id: 'b', title: 'Send the invoice', wiUrgency: 'urgent' })

  it('one selection falls through to the single-item prompt', () => {
    expect(startPromptForMany([a], byId)).toBe(startPromptForItem(a, byId))
  })

  it('several become ONE prompt that lists them with their context', () => {
    const p = startPromptForMany([a, b], byId)
    expect(p).toContain('these 2 items')
    expect(p).toContain('- Call the notary (Cetra Review · due')
    expect(p).toContain('- Send the invoice (urgent)')
    expect(p).toContain('what order would you do them in')
  })

  it('an empty selection produces nothing to send', () => {
    expect(startPromptForMany([], byId)).toBe('')
  })
})

describe('the wiring (file-level pins)', () => {
  it('the hand-off STAGES the prompt — it must never auto-send', async () => {
    const { readFileSync } = await import('fs')
    const view = readFileSync('src/renderer/src/components/views/AttentionView.tsx', 'utf8')
    expect(view).toContain('startWithPlexii')
    expect(view).toContain("fb:composer-stage")
    // The chat store's send() must NOT be called by the hand-off.
    const fn = view.slice(view.indexOf('function startWithPlexii'), view.indexOf('/** Open the DESK'))
    expect(fn).not.toContain('.send(')
    // Single-item starts go to the item's desk first, for desk context.
    expect(fn).toContain('goTask(deskId)')
    // Both entry points exist: the per-row action and the selection bar.
    expect(view).toContain('Start it with Plexii')
    expect(view).toContain('Get started with Plexii')
    expect(view).toContain('Select all')
  })
})
