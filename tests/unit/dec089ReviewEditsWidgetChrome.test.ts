import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { reorderOverSlots, type PlannedProposal } from '../../src/renderer/src/lib/attentionPlanner'

// ── DEC-089 — two operator asks off the live plan review ────────────────────
// (A) The review sheet becomes a workbench: drag rows to reorder (slot
//     ladder holds, items reassign — Attention-queue grammar), inline
//     day/time editing, inline duration editing, overlap warnings.
// (B) Widget chrome in dark mode: every header wash was light-only, so the
//     bell and completion circle sat light-on-light. Every wash now carries
//     a dark companion, and the frame gets a real resting edge in dark.

const P = (uid: string, startMs: number, durationMin = 30): PlannedProposal => ({
  itemId: `it-${uid}`,
  title: uid,
  startMs,
  durationMin,
  reason: '',
  uid
})
const H = 3_600_000

describe('DEC-089(A) — reorderOverSlots: the ladder holds, items reassign', () => {
  const base = [P('a', 9 * H), P('b', 10 * H), P('c', 11 * H)]

  it('dragging last before first: items rotate, times stay put', () => {
    const r = reorderOverSlots(base, 'c', 'a', 'before')
    expect(r.map((x) => x.uid)).toEqual(['c', 'a', 'b'])
    expect(r.map((x) => x.startMs)).toEqual([9 * H, 10 * H, 11 * H])
  })

  it('dragging first after last', () => {
    const r = reorderOverSlots(base, 'a', 'c', 'after')
    expect(r.map((x) => x.uid)).toEqual(['b', 'c', 'a'])
    expect(r.map((x) => x.startMs)).toEqual([9 * H, 10 * H, 11 * H])
  })

  it('duration travels with the item, not the slot', () => {
    const withLong = [P('a', 9 * H, 60), P('b', 10 * H), P('c', 11 * H)]
    const r = reorderOverSlots(withLong, 'a', 'c', 'after')
    const a = r.find((x) => x.uid === 'a')!
    expect(a.durationMin).toBe(60)
    expect(a.startMs).toBe(11 * H)
  })

  it('self-drop and unknown uids are noops', () => {
    expect(reorderOverSlots(base, 'a', 'a', 'before')).toBe(base)
    expect(reorderOverSlots(base, 'zz', 'a', 'before')).toBe(base)
  })

  it('"before" vs "after" land on either side of the target', () => {
    expect(reorderOverSlots(base, 'a', 'b', 'after').map((x) => x.uid)).toEqual(['b', 'a', 'c'])
    expect(reorderOverSlots(base, 'c', 'b', 'before').map((x) => x.uid)).toEqual(['a', 'c', 'b'])
  })
})

const SRC = join(__dirname, '../..', 'src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

describe('DEC-089(A) — the review sheet is editable in place', () => {
  const cal = read('renderer/src/components/views/CalendarView.tsx')
  it('rows are the drag surface, with a landing line', () => {
    expect(cal).toContain('data-testid="plan-review-row"')
    expect(cal).toContain("e.dataTransfer.setData('text/fb-planrow'")
    expect(cal).toContain('reorderProposal(from, pr.uid!, over.pos)')
  })
  it('day, start time and duration edit inline', () => {
    expect(cal).toContain('data-testid="plan-row-date"')
    expect(cal).toContain('data-testid="plan-row-time"')
    expect(cal).toContain('data-testid="plan-row-dur-input"')
  })
  it('collisions warn instead of silently reflowing', () => {
    expect(cal).toContain('data-testid="plan-row-clash"')
    expect(cal).toContain('Overlaps another block')
  })
  it('rows carry stable uids; dropping uses them', () => {
    expect(cal).toContain('withUids(out)')
    expect(cal).toContain('function dropProposal(uid: string)')
  })
  it('the footer teaches the grammar', () => {
    expect(cal).toContain('Drag rows to reorder · click a time or duration to edit it.')
  })
})

describe('DEC-089(B) — widget chrome survives dark mode', () => {
  const frame = read('renderer/src/components/widgets/WidgetFrame.tsx')
  it('the default wash and the resting edge have dark companions', () => {
    expect(frame).toContain("'bg-stone-200/70 dark:bg-white/[0.07]'")
    expect(frame).toContain("dark:border-[color:var(--edge-firm)]")
  })
  it('the idle bell is quiet, not gone', () => {
    expect(frame).toContain(
      "'text-[var(--ink-50)] opacity-80 hover:opacity-100 hover:bg-[var(--surface-sunken)]/60 hover:text-accent'"
    )
  })

  // The LOCK: no widget may declare a light-only header wash again. A wash
  // painted with a raw light palette class (stone/sky/violet/amber/indigo/
  // emerald/orange 100–300, or black/N) must carry a dark: companion in the
  // same attribute. Token washes (accent/…, edge tokens) pass by nature.
  it('LOCK — every headerAccent wash is dark-mode aware', () => {
    const dirs = [
      join(SRC, 'renderer/src/components/widgets'),
      join(SRC, 'renderer/src/components/views')
    ]
    const offenders: string[] = []
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.tsx')) continue
        const body = readFileSync(join(dir, f), 'utf-8')
        for (const m of body.matchAll(/headerAccent="([^"]+)"/g)) {
          const v = m[1]
          const light = /bg-(?:stone|sky|violet|amber|indigo|emerald|orange)-[123]00\/|bg-black\//.test(v)
          if (light && !v.includes('dark:')) offenders.push(`${f}: ${v}`)
          // GAP-019 — an opacity modifier on a var() token generates invalid
          // CSS and paints NOTHING (measured live: computed transparent).
          if (/\[var\(--[^\]]+\)\]\/\d/.test(v)) offenders.push(`${f}: INVALID var+modifier ${v}`)
        }
        for (const m of body.matchAll(/accent: '([^']+)' \}/g)) {
          const v = m[1]
          const light = /bg-(?:stone|sky|violet|amber|indigo|emerald|orange)-[123]00\//.test(v)
          if (light && !v.includes('dark:')) offenders.push(`${f}: ${v}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
