// The Edges + Glass codemod (scripts/codemods/edges.mjs) rewrites the boxed
// `border border-[var(--edge-soft)]` idiom to the kit's material classes.
// These tests pin the mapping put to plexidesk-08 on 2026-08-23 and the
// safety properties the sweep relies on: exact template round-trips,
// idempotence, and the integrity refusal.

import { describe, it, expect } from 'vitest'
// @ts-expect-error plain ESM script, no types
import { rewriteSource, rewriteString, classStrings } from '../../scripts/codemods/edges.mjs'

const SRC = `export function X({ n, size }: { n: number; size: string }) {
  // it's a comment with an apostrophe
  return (
    <div>
      <p>don't break</p>
      <div className={\`rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-3 \${n > 0 ? 'shadow-sm' : ''}\`}>a</div>
      <div className={\`rounded-\${size} border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-3\`}>glued</div>
      <button className="rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2 shadow-sm">b</button>
      <div onClick={() => n} className="rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2">clickable</div>
      <div className="rounded border border-[var(--edge-soft)] bg-[var(--surface-sunken)] p-2">c</div>
      <input className="rounded border border-[var(--edge-soft)] bg-[var(--surface-sunken)]" />
      <div className="fixed z-50 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl">menu</div>
      <div className="absolute z-50 w-[340px] rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] fb-pop-in">wide</div>
      <span className="rounded-full border border-[var(--edge-soft)] bg-[var(--surface-raised)]">pill</span>
      <div className="fixed inset-0 z-[180] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm">scrim</div>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-md">scrim2</div>
      <div className="rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)]/85 backdrop-blur p-4">blurred card</div>
    </div>
  )
}
`

describe('edges codemod', () => {
  it('scans on the AST: apostrophes in JSX text and comments never desync it', () => {
    const strings = classStrings(SRC, 'T.tsx').map((s) => s.text)
    expect(strings).toHaveLength(12)
    expect(strings.every((t) => /border|backdrop-blur/.test(t))).toBe(true)
  })

  it('applies the ratified mapping and leaves the hand-pass buckets alone', () => {
    const r = rewriteSource(SRC, 'T.tsx')
    expect(r.refused).toBeUndefined()
    const out = r.out as string
    expect(out).toContain("className={`fb-card p-3 ${n > 0 ? 'shadow-sm' : ''}`}")       // raised static, expression byte-exact
    expect(out).toContain('className={`fb-card rounded-${size} p-3`}')                   // glued expression stays one word
    expect(out).toContain('className="fb-btn-surface px-2"')                              // raised button, shadow dropped
    expect(out).toContain('className="fb-card fb-press px-2"')                            // raised clickable div
    expect(out).toContain('className="rounded bg-[var(--surface-sunken)] p-2"')           // sunken static: stroke only
    expect(out).toContain('<input className="rounded border border-[var(--edge-soft)] bg-[var(--surface-sunken)]" />') // field: hand
    expect(out).toContain('className="fb-glass-panel rounded-[var(--radius-row)] fb-pop-in fixed z-50"')        // popover: panel tier, row radius
    expect(out).toContain('className="fb-glass-panel rounded-[var(--radius-card)] absolute z-50 w-[340px] fb-pop-in"') // wide popover: card radius, own motion kept
    expect(out).toContain('className="rounded-full border border-[var(--edge-soft)] bg-[var(--surface-raised)]"') // capsule: hand
    expect(out).toContain('className="fb-scrim fixed inset-0 z-[180] flex items-center justify-center"')          // scrim
    expect(out).toContain('className="fb-scrim absolute inset-0"')                                                // scrim, dark variant dropped
    expect(out).toContain('className="fb-card p-4"')                                                              // content never glass
    expect(out).toContain("<p>don't break</p>")
    expect(r.log.filter((l: { removed?: string[] }) => l.removed)).toHaveLength(10)
    expect(r.log.some((l: { note?: string }) => l.note?.includes('radius built from an expression'))).toBe(true)
  })

  it('is idempotent', () => {
    const once = rewriteSource(SRC, 'T.tsx').out as string
    const twice = rewriteSource(once, 'T.tsx')
    expect(twice.out).toBe(once)
    expect(twice.log).toHaveLength(0)
  })

  it('rewrites only the exact idiom (no border word, no rewrite)', () => {
    expect(rewriteString('rounded-lg border-[var(--edge-soft)] bg-[var(--surface-raised)]', '<div>')).toBeNull()
    expect(rewriteString('rounded-lg border border-[var(--edge-soft)]', '<div>')).toBeNull()
  })
})
