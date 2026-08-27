// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FbNode } from '../../src/shared/types'
import {
  detectCompletion,
  quietWinLines,
  type CompletionSignal
} from '../../src/renderer/src/lib/completionDetect'
import {
  ensureSignalSchema,
  recordSignal,
  listSignals,
  matchState,
  markPrompted,
  recordOutcome,
  type SignalDb
} from '../../src/main/db/signals'

// DEC-052 Track D tier 1 — the completion loop's rules. The two hard
// requirements from the ruling are tested as BEHAVIOUR: never auto-complete
// (the matcher only ever returns an offer) and never nag (the pairing table
// is a once-ever guarantee, exercised against a real database).

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8')

const wi = (over: Partial<FbNode> & { id: string }): FbNode =>
  ({
    parentId: null,
    kind: 'work_item',
    title: over.id,
    description: '',
    status: 'open',
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    workItemState: 'open',
    intentClass: 'to_do',
    groupId: null,
    ...over
  }) as FbNode

const sig = (over: Partial<CompletionSignal> & { id: string; kind: string }): CompletionSignal => ({
  targetKind: null,
  targetRef: null,
  occurredAt: 0,
  ...over
})

describe('detectCompletion — the matcher', () => {
  it('a finished block/session on a linked ACTIVE item is the strongest offer', () => {
    const items = [wi({ id: 'a' })]
    const offer = detectCompletion(sig({ id: 's1', kind: 'block_completed', targetRef: 'a' }), items)
    expect(offer?.itemId).toBe('a')
    expect(offer?.confidence).toBe(1)
    // The queue's OWN verb, never a generic "done".
    expect(offer?.verbState).toBe('completed')
    const meet = detectCompletion(
      sig({ id: 's2', kind: 'focus_finished', targetRef: 'm' }),
      [wi({ id: 'm', intentClass: 'to_meet' })]
    )
    expect(meet?.verbState).toBe('scheduled')
    expect(meet?.verbLabel).toBe('Scheduled')
  })

  it('a closed or detached item never generates an offer', () => {
    expect(
      detectCompletion(sig({ id: 's', kind: 'block_completed', targetRef: 'a' }), [
        wi({ id: 'a', workItemState: 'completed' })
      ])
    ).toBeNull()
    expect(
      detectCompletion(sig({ id: 's', kind: 'block_completed', targetRef: 'a' }), [
        wi({ id: 'a', detachedFromId: 'gone' })
      ])
    ).toBeNull()
  })

  it('a chat message matches the item captured FROM that conversation — newest wins', () => {
    const items = [
      wi({ id: 'old', sourceType: 'chat', sourceRef: 'conv1', createdAt: 1 }),
      wi({ id: 'new', sourceType: 'chat', sourceRef: 'conv1', createdAt: 2 }),
      wi({ id: 'other', sourceType: 'chat', sourceRef: 'conv2', createdAt: 3 })
    ]
    const offer = detectCompletion(
      sig({ id: 's', kind: 'chat_message_sent', targetRef: 'conv1' }),
      items
    )
    expect(offer?.itemId).toBe('new')
    expect(offer?.confidence).toBeLessThan(1)
  })

  it('desk_closed NEVER prompts — analytics only', () => {
    expect(
      detectCompletion(sig({ id: 's', kind: 'desk_closed', targetRef: 'desk1' }), [
        wi({ id: 'a', parentId: 'desk1' })
      ])
    ).toBeNull()
  })
})

describe('quietWinLines — unlogged work counts (#7)', () => {
  it('desks closed and sittings finished this week, in plain language', () => {
    const now = 10 * 86_400_000
    const lines = quietWinLines(
      [
        { kind: 'desk_closed', occurredAt: now - 1000 },
        { kind: 'desk_closed', occurredAt: now - 2000 },
        { kind: 'focus_finished', occurredAt: now - 3000 },
        { kind: 'block_completed', occurredAt: now - 4000 },
        // Old signals age out of the claim.
        { kind: 'desk_closed', occurredAt: now - 8 * 86_400_000 }
      ],
      now
    )
    expect(lines[0]).toBe('2 desks closed this week — counted from the work, not the checkboxes.')
    expect(lines[1]).toBe('2 focused sittings finished this week.')
  })

  it('thin data stays silent', () => {
    expect(quietWinLines([], 0)).toEqual([])
  })
})

describe('the ledger — once-ever is a DATABASE guarantee', () => {
  function freshDb(): SignalDb {
    const raw = new DatabaseSync(':memory:')
    const db: SignalDb = {
      exec: (sql) => raw.exec(sql),
      prepare: (sql) => {
        const st = raw.prepare(sql)
        return {
          run: (...a: unknown[]) => st.run(...(a as never[])),
          get: (...a: unknown[]) => st.get(...(a as never[])),
          all: (...a: unknown[]) => st.all(...(a as never[])) as unknown[]
        }
      }
    }
    ensureSignalSchema(db)
    return db
  }

  it('record → list round-trips; ensure is idempotent', () => {
    const db = freshDb()
    ensureSignalSchema(db) // second run must not throw
    const s = recordSignal({ kind: 'desk_closed', targetKind: 'desk', targetRef: 'd1' }, db)
    const listed = listSignals(0, db)
    expect(listed.map((x) => x.id)).toEqual([s.id])
    expect(listed[0].kind).toBe('desk_closed')
  })

  it('a prompted pairing is visible forever; an outcome sticks', () => {
    const db = freshDb()
    const s = recordSignal({ kind: 'block_completed', targetRef: 'item1' }, db)
    expect(matchState(s.id, 'item1', db)).toBeNull() // never seen → may prompt
    markPrompted(s.id, 'item1', 1, db)
    expect(matchState(s.id, 'item1', db)?.promptedAt).not.toBeNull()
    recordOutcome(s.id, 'item1', 'dismissed', db)
    expect(matchState(s.id, 'item1', db)?.outcome).toBe('dismissed')
    // Prompting again does not erase the outcome (the never-nag core).
    markPrompted(s.id, 'item1', 1, db)
    expect(matchState(s.id, 'item1', db)?.outcome).toBe('dismissed')
  })
})

describe('the surfaces (file pins)', () => {
  it('the offer store checks the pairing BEFORE showing, and records every outcome', () => {
    const store = read('src/renderer/src/stores/completionOffer.ts')
    expect(store).toContain('await window.api.signals.matchState(offer.signalId, offer.itemId)')
    expect(store).toContain('if (state?.promptedAt != null || state?.outcome != null) return')
    expect(store).toContain("get().resolve('ignored')")
  })

  it('the toast completes through the SAME accounted close path as every surface', () => {
    const toast = read('src/renderer/src/components/CompletionToast.tsx')
    expect(toast).toContain("from '../stores/completionOffer'")
    expect(toast).toContain('useCloseWorkItem')
    expect(toast).toContain('closeItem(item, offer.verbState)')
  })

  it('all four emitters observe at their seams', () => {
    expect(read('src/renderer/src/stores/timeBlocks.ts')).toContain("kind: 'block_completed'")
    expect(read('src/renderer/src/stores/focusSession.ts')).toContain("kind: 'focus_finished'")
    expect(read('src/renderer/src/stores/chat.ts')).toContain("kind: 'chat_message_sent'")
    expect(read('src/renderer/src/stores/nodes.ts')).toContain("kind: 'desk_closed'")
  })

  it('nothing anywhere calls setState from a signal — the offer is the only path', () => {
    const store = read('src/renderer/src/stores/completionOffer.ts')
    expect(store).not.toContain('setState(')
    expect(store).not.toContain('closeItem')
  })
})
