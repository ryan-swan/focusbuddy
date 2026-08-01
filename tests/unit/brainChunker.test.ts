import { describe, it, expect } from 'vitest'
import { chunkText, CHUNK_SIZE, CHUNK_OVERLAP } from '../../src/main/brain/chunker'

// Regression lock for the plexi-brain P0 chunker. The correctness-critical
// properties are: (1) nothing is lost — every character of the source appears in
// some chunk; (2) a fact straddling a chunk boundary survives via overlap; (3)
// chunks respect the size bound (modulo a single over-long block being hard-split);
// (4) short text is one chunk, empty text is none.

const para = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `${tag} paragraph ${i} with some real words to fill space.`).join('\n\n')

describe('brain/chunker', () => {
  it('empty / whitespace text → no chunks', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('short text → exactly one chunk, unchanged', () => {
    const t = 'a single short paragraph under the size limit'
    expect(chunkText(t)).toEqual([t])
  })

  it('long text → multiple chunks, each within the size bound (paragraph-split)', () => {
    const text = para(200, 'X') // well over CHUNK_SIZE
    const chunks = chunkText(text, { size: CHUNK_SIZE, overlap: CHUNK_OVERLAP })
    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk respects the bound with a small tolerance for the boundary block
    // that pushed it over (we cut AFTER appending, then start fresh).
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE * 1.5)
  })

  it('coverage: every source paragraph appears in some chunk (nothing lost — I3 store-anyway)', () => {
    const text = para(120, 'COVER')
    const chunks = chunkText(text)
    const joined = chunks.join('\n')
    for (let i = 0; i < 120; i++) expect(joined).toContain(`COVER paragraph ${i} `)
  })

  it('overlap: consecutive chunks share text so a boundary-straddling fact survives', () => {
    const text = para(120, 'OV')
    const withOverlap = chunkText(text, { size: 1500, overlap: 0.15 })
    // At least one adjacent pair must share a non-trivial suffix/prefix overlap.
    let sawOverlap = false
    for (let i = 1; i < withOverlap.length; i++) {
      const prevTail = withOverlap[i - 1].slice(-120)
      // Some fragment of the previous chunk's tail should reappear at the head of this one.
      const headWords = withOverlap[i].slice(0, 120)
      if (prevTail.split(/\s+/).some((w) => w.length > 4 && headWords.includes(w))) sawOverlap = true
    }
    expect(sawOverlap).toBe(true)
  })

  it('zero overlap yields no re-prepended text (config is honored)', () => {
    const text = para(120, 'NOOV')
    const noOverlap = chunkText(text, { size: 1500, overlap: 0 })
    // With no overlap, total chunk length ≈ source length (no duplication).
    const total = noOverlap.reduce((a, c) => a + c.length, 0)
    // Allow for the \n\n joins we add; must not be inflated by an overlap fraction.
    expect(total).toBeLessThan(text.length * 1.1)
  })

  it('a single over-long block (no paragraph breaks) is hard-split, not dropped', () => {
    const wall = 'word '.repeat(2000).trim() // ~10000 chars, no blank lines
    const chunks = chunkText(wall, { size: 1500, overlap: 0.15 })
    expect(chunks.length).toBeGreaterThan(1)
    // The wall's content is preserved (first + last words present somewhere).
    expect(chunks.join(' ')).toContain('word')
  })
})

// ── I3: the format-aware ladder (DEC-022) ─────────────────────────────────────────
// The prose byte-identical invariant is proven exhaustively in _byteIdentical.scratch.test.ts
// (388 inputs incl. all 379 real corpus chunk texts × 5 configs, old-vs-new). These locks pin
// the NEW ladder behaviours and the invariant that keeps prose safe.
describe('brain/chunker — the format ladder', () => {
  it('default strategy IS prose (the byte-identical invariant lives on the default)', () => {
    const t = Array.from({ length: 40 }, (_, i) => `para ${i} with words`).join('\n\n')
    for (const size of [200, 800, 1500]) {
      expect(chunkText(t, { size })).toEqual(chunkText(t, { size, strategy: 'prose' }))
    }
  })

  it('markdown with NO headings === prose, byte-identical (incl. whitespace-only blocks)', () => {
    const t = Array.from({ length: 30 }, (_, i) => `paragraph ${i} carrying enough words to matter`).join('\n\n')
    expect(chunkText(t, { size: 300, strategy: 'markdown' })).toEqual(chunkText(t, { size: 300, strategy: 'prose' }))
    // GUARDS the byte-identical claim against whitespace-only paragraph blocks + indentation:
    // a prior filter/regex made markdown diverge from prose here even with no headings.
    const ws = 'a'.repeat(1000) + '\n\n   \n\n' + '  indented line kept as-is\n\n' + 'b'.repeat(1000)
    for (const size of [400, 1500]) {
      expect(chunkText(ws, { size, strategy: 'markdown' })).toEqual(chunkText(ws, { size, strategy: 'prose' }))
    }
  })

  it('markdown is FENCE-AWARE: a # comment inside a ``` code block does NOT split the fence', () => {
    // GUARDS the MINOR: a heading regex that ignores fences shreds a code snippet at every
    // shell/python comment. The whole fenced block must survive as ONE boundary.
    const fence = '```bash\n# install deps first\nnpm install\n# then build the thing\nnpm run build\n# finally run tests\nnpm test\n```'
    const t = '# Setup guide\n' + 'run these real setup steps carefully '.repeat(20).trim() + '\n\n' + fence + '\n\n' + 'done here'
    const chunks = chunkText(t, { size: 400, overlap: 0, strategy: 'markdown' })
    // the fenced block appears intact in exactly one chunk (its # comment lines were not split)
    expect(chunks.some((c) => c.includes(fence))).toBe(true)
    // and the comment lines never became their own heading-blocks
    expect(chunks.some((c) => c.trim() === '# install deps first')).toBe(false)
  })

  it('markdown: an empty-title heading does not swallow the NEXT heading boundary', () => {
    // GUARDS the NIT: a trailing \s in the old regex consumed the empty heading's newline, so a
    // real heading right after a bare "###" lost its own block. Sections sized to stay whole
    // (no hard-split) so the heading cleanly starts its own chunk.
    const secA = 'Alpha ' + 'word '.repeat(50).trim() // ~255 chars, no heading, < size
    const beta = 'Beta ' + 'word '.repeat(45).trim() // ~229 chars
    const t = secA + '\n###\n## Real Section\n' + beta
    const md = chunkText(t, { size: 300, overlap: 0, strategy: 'markdown' })
    expect(md.some((c) => c.startsWith('## Real Section'))).toBe(true)
  })

  it('markdown: a heading (on a single-newline boundary) starts a new chunk where prose would not', () => {
    // GUARDS: markdown collapsing to prose (headings ignored). Sections separated by a SINGLE
    // newline — prose does NOT split there (no blank line) and hard-cuts mid-content; markdown
    // splits at each heading. (size is floored to 200, so sections must be substantial.)
    const secA = '# Section A\n' + 'alpha '.repeat(30).trim()
    const secB = '# Section B\n' + 'beta '.repeat(30).trim()
    const secC = '# Section C\n' + 'gamma '.repeat(30).trim()
    const t = [secA, secB, secC].join('\n') // single-newline joined — no blank lines
    const prose = chunkText(t, { size: 200, overlap: 0, strategy: 'prose' })
    const md = chunkText(t, { size: 200, overlap: 0, strategy: 'markdown' })
    expect(md.length).toBeGreaterThanOrEqual(3)
    expect(md.some((c) => c.startsWith('# Section A'))).toBe(true)
    expect(md.some((c) => c.startsWith('# Section B'))).toBe(true)
    expect(md.some((c) => c.startsWith('# Section C'))).toBe(true)
    expect(md).not.toEqual(prose)
  })

  it('table: a wide sheet is split on ROW boundaries, never mid-row', () => {
    // GUARDS: a table falling through to prose (which, with single-newline rows and no blank
    // lines, would hard-cut mid-row). Each chunk must contain only whole rows.
    const header = 'Name | Role | Team'
    const rows = Array.from({ length: 40 }, (_, i) => `Person${i} | Engineer number ${i} | Platform`)
    const sheet = [header, ...rows].join('\n')
    const chunks = chunkText(sheet, { size: 200, overlap: 0, strategy: 'table' })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      for (const line of c.split('\n')) {
        // no partial row: every non-empty line is one of the real rows (or the header)
        if (line.trim()) expect([header, ...rows]).toContain(line)
      }
    }
  })

  it('code: a structural declaration starts a new block (coarse→fine)', () => {
    // GUARDS: code falling through to prose (declarations invisible without blank lines). Bodies
    // are padded so the source clears the 200-char size floor and actually splits.
    const body = (name: string): string =>
      `    // ${name} does real work here with enough text to matter for the size floor\n    return ${name}Value`
    const src = [
      'class Alpha {',
      body('alpha'),
      '}',
      'function beta(x) {',
      body('beta'),
      '}',
      'export class Gamma {',
      body('gamma'),
      '}'
    ].join('\n')
    const chunks = chunkText(src, { size: 200, overlap: 0, strategy: 'code' })
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.some((c) => c.startsWith('class Alpha'))).toBe(true)
    expect(chunks.some((c) => c.startsWith('function beta'))).toBe(true)
    expect(chunks.some((c) => c.startsWith('export class Gamma'))).toBe(true)
  })
})
