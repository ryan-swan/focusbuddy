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
      <div className="fixed z-50 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)]">menu</div>
      <span className="rounded-full border border-[var(--edge-soft)] bg-[var(--surface-raised)]">pill</span>
    </div>
  )
}
`

describe('edges codemod', () => {
  it('scans on the AST: apostrophes in JSX text and comments never desync it', () => {
    const strings = classStrings(SRC, 'T.tsx').map((s) => s.text)
    expect(strings).toHaveLength(8)
    expect(strings.every((t) => t.includes('border'))).toBe(true)
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
    expect(out).toContain('className="fixed z-50 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)]"') // floating: hand
    expect(out).toContain('className="rounded-full border border-[var(--edge-soft)] bg-[var(--surface-raised)]"') // capsule: hand
    expect(out).toContain("<p>don't break</p>")
    expect(r.log.filter((l: { removed?: string[] }) => l.removed)).toHaveLength(5)
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
