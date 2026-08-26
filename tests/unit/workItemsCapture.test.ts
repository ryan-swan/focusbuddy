// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureWorkItemSchema,
  decayLooseThoughtsCore,
  LOOSE_THOUGHT_DECAY_DAYS,
  setWorkItemStateCore
} from '../../src/main/db/workItems'
import type { LifecycleDb } from '../../src/main/db/nodeLifecycle'

// Attention S5 — the capture pipeline's non-UI guarantees: the loose-thought
// decay tier (Δ3), the closure-notification wiring, the executor's real apply
// path, and the gated prompt swaps (meeting + voice) that activate with the
// capability flag.

type Db = LifecycleDb & { exec(sql: string): void }

function freshDb(): { raw: DatabaseSync; db: Db } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      trashed_at INTEGER,
      org_id TEXT NOT NULL DEFAULT 'personal',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `)
  const db: Db = {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const s = raw.prepare(sql)
      return {
        run: (...a: unknown[]) => s.run(...(a as never[])),
        get: (...a: unknown[]) => s.get(...(a as never[])),
        all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
      }
    }
  }
  ensureWorkItemSchema(db)
  return { raw, db }
}

const DAY = 24 * 60 * 60 * 1000

describe('Δ3 — the loose-thought decay tier', () => {
  it('dismisses untouched loose thoughts after the window, reason "decayed", quietly', () => {
    const { raw, db } = freshDb()
    const now = 100 * DAY
    raw.prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, updated_at) VALUES (?, 'work_item', ?, 'open', 'to_remember', ?)"
    ).run('stale', 'Old idea', now - (LOOSE_THOUGHT_DECAY_DAYS + 1) * DAY)
    raw.prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, updated_at) VALUES (?, 'work_item', ?, 'open', 'to_remember', ?)"
    ).run('fresh', 'New idea', now - 2 * DAY)
    raw.prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, updated_at) VALUES (?, 'work_item', ?, 'open', 'to_do', ?)"
    ).run('task', 'Real task', now - 40 * DAY) // actionable items NEVER decay
    expect(decayLooseThoughtsCore(db, now)).toBe(1)
    const stale = raw
      .prepare('SELECT work_item_state, status, reason_code FROM nodes WHERE id = ?')
      .get('stale') as { work_item_state: string; status: string; reason_code: string }
    expect(stale).toEqual({ work_item_state: 'dismissed', status: 'parked', reason_code: 'decayed' })
    expect(
      (raw.prepare('SELECT work_item_state FROM nodes WHERE id = ?').get('fresh') as { work_item_state: string })
        .work_item_state
    ).toBe('open')
    expect(
      (raw.prepare('SELECT work_item_state FROM nodes WHERE id = ?').get('task') as { work_item_state: string })
        .work_item_state
    ).toBe('open')
    // A touch (promotion via reclassify, or any update) resets the clock —
    // and a decayed item never re-decays (terminal filter).
    expect(decayLooseThoughtsCore(db, now)).toBe(0)
  })

  it('a decayed thought remains promotable: reclassify-then-reopen path stays legal', () => {
    const { raw, db } = freshDb()
    raw.prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, updated_at) VALUES ('t', 'work_item', 'X', 'dismissed', 'to_remember', 0)"
    ).run()
    expect(setWorkItemStateCore(db, 't', 'open')).toBe(true)
    const row = raw.prepare('SELECT status FROM nodes WHERE id = ?').get('t') as { status: string }
    expect(row.status).toBe('open')
  })
})

describe('S5 wiring locks (file-level)', () => {
  const ROOT = join(__dirname, '..', '..')
  const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

  it('terminal setState posts the closure through the S4 substrate, deduped per transition', () => {
    const wi = read('src/main/db/workItems.ts')
    expect(wi).toContain("dedupeKey: `wi-close:${id}:${state}`")
    expect(wi).toContain("trigger: 'loop-closure'")
  })

  it('the executor applies create-work-item through the store (one code path), origin ai, approved', () => {
    const ex = read('src/renderer/src/lib/actionExecutor.ts')
    expect(ex).toContain('applyCreateWorkItem')
    expect(ex).toContain("wiOrigin: 'ai'")
    expect(ex).toContain("approvalState: 'approved'")
    expect(ex).not.toContain("Work items aren't enabled yet.")
  })

  it('the meeting system + voice system swap their capture routing with the flag', () => {
    const anthropic = read('src/main/ai/anthropic.ts')
    expect(anthropic).toContain('meetingEndSystem()')
    expect(anthropic).toContain('meetingCaptureRule(workItemsOn)')
    const voice = read('src/main/ai/voiceNote.ts')
    expect(voice).toContain('VOICE_WORK_ITEM_SHAPE')
    const vocab = read('src/main/ai/vocabulary.ts')
    expect(vocab).toContain('Use create-work-item for an action item')
    // The OFF phrasing still routes action items to create-task (no dead zone).
    expect(vocab).toContain('Use create-task for an action item someone needs to do')
  })

  it('the capture console + classifier + seam are wired end to end', () => {
    // DEC-028: the ONE confirm stop is the shared card — classify lives there,
    // and both hosts (console overlay + chat inline) render it.
    const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')
    expect(card).toContain('window.api.workItems')
    expect(card).toContain('.classify(')
    expect(read('src/renderer/src/components/CaptureConsole.tsx')).toContain('AttentionConfirmCard')
    expect(read('src/renderer/src/components/ChatPanel.tsx')).toContain('AttentionConfirmCard')
    expect(read('src/renderer/src/components/Sidebar.tsx')).toContain('openConsole(')
    expect(read('src/main/ipc/index.ts')).toContain("'workItems:classify'")
    // DEC-019(b): ONE universal entry, @attention prefix captures directly.
    expect(read('src/renderer/src/components/CommandCenter.tsx')).toContain('attention-capture')
    expect(read('src/renderer/src/components/CommandCenter.tsx')).toContain('@?attention')
    // The decay sweep rides the scheduler cadence.
    expect(read('src/main/notifications/scheduler.ts')).toContain('decayLooseThoughts(nowMs)')
  })

  it('DEC-027/028 — typeahead, chips, arming, and the inline chat card', () => {
    // The chat picker offers the capture COMMAND; picking inserts a VISUAL
    // chip whose title serialises to "@attention" — never a stored reference
    // (onPick skipped; a kind with no resolver must never become one).
    const sugg = read('src/renderer/src/components/assistant/MentionSuggestion.ts')
    expect(sugg).toContain("kind: 'capture'")
    expect(sugg).toContain("title: 'attention'")
    // A LEADING @attention send never reaches the model — it renders the
    // shared confirm card INLINE in the chat (DEC-028).
    const panel = read('src/renderer/src/components/ChatPanel.tsx')
    expect(panel).toContain('^@attention\\b')
    expect(panel).toContain('setInlineCapture')
    // ⌘K and the home bar both arm the Slack-style pill on Tab.
    expect(read('src/renderer/src/components/CommandCenter.tsx')).toContain('attnArmed')
    const home = read('src/renderer/src/components/views/StartOrAskPlexi.tsx')
    expect(home).toContain("'capture:attention'")
    expect(home).toContain('armAttention')
  })

  it('the @ picker owns Tab — the intent-cycler must yield while it is open', () => {
    // Operator live QA: Tab never selected the Attention row and silently
    // flipped the previewed intent to "Search the web" instead. The composer's
    // Tab cycler is CAPTURE-phase, so it ran before ProseMirror's suggestion
    // plugin and swallowed every Tab. The guard is the fix; this pins it so
    // the keyboard contract (DEC-028c) cannot regress.
    const panel = read('src/renderer/src/components/ChatPanel.tsx')
    const guard = panel.indexOf('[data-testid="mention-picker"]')
    expect(guard).toBeGreaterThan(-1)
    // …and it must come BEFORE the cycler, or it changes nothing.
    const cycler = panel.indexOf('setOmniPick((p) => (p + 1) % composerIntents.length)')
    expect(cycler).toBeGreaterThan(guard)
    // The picker really does carry the testid the guard looks for.
    expect(read('src/renderer/src/components/assistant/MentionList.tsx')).toContain(
      'data-testid="mention-picker"'
    )
  })

  it('the picker highlights its selected row visibly (the Enter/Tab target is legible)', () => {
    const list = read('src/renderer/src/components/assistant/MentionList.tsx')
    // A 10% tint read as "nothing is selected" in live QA.
    expect(list).not.toContain('bg-accent/10')
    expect(list).toContain('rgba(var(--accent),0.14)')
    expect(list).toContain('inset_2px_0_0_rgb(var(--accent))')
  })
})
