// Pure chunker for the plexi-brain RAG floor (P0), extended to a FORMAT-AWARE LADDER at I3
// (defect D1 / DEC-022). No DB, no model — just text in, chunks out — so it is unit-testable
// in isolation (like shared/semantic.ts).
//
// ── I3: the per-format ladder (DEC-022) ─────────────────────────────────────────────
// Cerebras (figures/07) chunks LANGUAGE-AWARE, coarse→fine — class → method → block, falling
// back a level at a time — contrasted on-screen against "NAIVE WINDOWS — CUT EVERY N TOKENS".
// P0 already cleared the naive bar (boundary-first, blank-line splitting). The transplant is
// MULTI-LEVEL + PER-FORMAT. So `chunkText` now takes a `strategy`, and the ONE thing it varies
// per strategy is how a source is split into boundary blocks (splitBlocks) and how packed
// blocks are re-joined. Everything else — the size bound, the overlap that carries a
// boundary-straddling fact across a cut, the hard-split of an over-long block — is shared.
//
//   prose     (default)  today's blank-line paragraph split. BYTE-IDENTICAL to pre-I3 — this
//                        is the invariant that preserves the P0 sweep (recall@1 71 / recall@3 93).
//   markdown             heading lines (# … ######) are ALSO block boundaries, so a section
//                        starts a fresh chunk. Falls back to prose when there are no headings.
//   table                each row is a boundary, so a wide sheet is never hard-cut mid-row.
//   code                 structural declarations (class/interface/function/def…) are
//                        boundaries, coarse→fine into blank-line blocks. Forward-looking: no
//                        internal connector emits 'code' yet (I5's external code sources will).
//
// ── P0 heritage (unchanged) ─────────────────────────────────────────────────────────
// The config below is the empirically-chosen winner from p0-sweep.mjs on the real corpus:
// 1500 chars / 15% overlap / paragraph-boundary-first took recall@3 from 50% (whole-doc
// baseline) to 93%, and deep-buried-fact recall from 14% to 100%. See
// 05-ARCHITECTURE/P0-CHUNKING-SWEEP-RESULTS.md in the plexi-brain repo.

export type ChunkStrategy = 'prose' | 'markdown' | 'table' | 'code'

export interface ChunkOpts {
  size?: number      // target max chunk size in characters
  overlap?: number   // fraction [0,1) of size to re-prepend from the prior chunk
  strategy?: ChunkStrategy // I3 — the format ladder; default 'prose' (byte-identical to P0)
}

// Empirically-chosen P0 defaults (see sweep results). Exported so the indexer and
// the content-hash both read one source of truth.
export const CHUNK_SIZE = 1500
export const CHUNK_OVERLAP = 0.15

// How packed blocks are re-joined, per strategy. Prose/markdown/code join paragraphs and
// sections with a blank line (faithful to their source shape); a table joins rows with a
// single newline (rows are line-delimited, not paragraph-delimited). Prose MUST stay '\n\n'
// — that is the byte-identical guarantee (pre-I3 hard-coded '\n\n').
const BLOCK_SEP: Record<ChunkStrategy, string> = {
  prose: '\n\n',
  markdown: '\n\n',
  table: '\n',
  code: '\n\n'
}

// Split cleaned text into the coarse boundary blocks the packer then fills to `size`. The
// ONLY strategy-dependent step; the packer below is shared and identical for every strategy.
function splitBlocks(clean: string, strategy: ChunkStrategy): string[] {
  switch (strategy) {
    case 'markdown':
      return splitMarkdown(clean)
    case 'table':
      // Each row is a block, so packing never cuts mid-row. Consecutive newlines collapse so
      // fully-blank grid rows don't become empty blocks.
      return clean.split(/\n+/).filter((b) => b.trim().length > 0)
    case 'code':
      return splitCode(clean)
    case 'prose':
    default:
      // TODAY's exact split — do not touch. The prose byte-identical invariant lives here.
      return clean.split(/\n{2,}/)
  }
}

// Markdown: a heading line (# … ######) that sits OUTSIDE a fenced code block starts a new
// block. Scanned line-by-line and FENCE-AWARE — a '#' inside a ``` or ~~~ fence is a code
// comment (shell/python/yaml/ruby), not a heading, so a code snippet is never shredded at its
// comment lines. A heading must have a space/tab after its hashes (a bare '###' or a '#tag' is
// not a boundary) and ≤3 leading spaces (CommonMark). Content WITH NO headings inserts no
// breaks and no line is mutated, so the result is BYTE-IDENTICAL to prose (the join round-trips
// clean, the split below is the prose split). A heading keeps its own body — no break AFTER it.
function splitMarkdown(clean: string): string[] {
  const lines = clean.split('\n')
  let inFence = false
  const withBreaks: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence // a fence opener/closer toggles the state; never itself a heading
    } else if (!inFence && i > 0 && /^ {0,3}#{1,6}[ \t]/.test(line)) {
      withBreaks.push('') // a blank line before an out-of-fence heading → a paragraph boundary
    }
    withBreaks.push(line)
  }
  return withBreaks.join('\n').split(/\n{2,}/)
}

// Code: break BEFORE a structural declaration (coarse), then on blank lines (fine) — Cerebras's
// class → method → block, one level at a time. Inert on today's corpus (no connector emits
// 'code'); locked by unit test so I5's code connectors inherit a real ladder, not a stub.
function splitCode(clean: string): string[] {
  const isDecl = (l: string): boolean =>
    /^\s*(export\s+|default\s+|public\s+|private\s+|protected\s+|static\s+|abstract\s+)*(async\s+)?(class|interface|enum|struct|impl|trait|namespace|module|function|func|def|fn|type|const\s+\w+\s*=\s*(async\s+)?\()/.test(
      l
    )
  const blocks: string[] = []
  let cur: string[] = []
  const flush = (): void => {
    if (cur.length) {
      blocks.push(cur.join('\n'))
      cur = []
    }
  }
  for (const line of clean.split('\n')) {
    if (isDecl(line)) flush() // a new declaration starts a new block
    if (line.trim() === '') flush() // a blank line is a fine-grained boundary
    else cur.push(line)
  }
  flush()
  return blocks.filter((b) => b.trim().length > 0)
}

// Split text into overlapping, boundary-aware chunks via the per-format ladder (I3). Splits on
// the strategy's boundaries first (prose: blank lines; markdown: +headings; table: rows; code:
// declarations); hard-cuts only when a single block exceeds size. Overlap re-prepends the tail
// of the previous chunk so a boundary-straddling fact survives. Deterministic and pure.
export function chunkText(text: string, opts: ChunkOpts = {}): string[] {
  const size = Math.max(200, opts.size ?? CHUNK_SIZE)
  const overlapFrac = Math.min(0.5, Math.max(0, opts.overlap ?? CHUNK_OVERLAP))
  const overlap = Math.floor(size * overlapFrac)
  const strategy = opts.strategy ?? 'prose'
  const sep = BLOCK_SEP[strategy]
  const sepLen = sep.length

  const clean = (text || '').replace(/\r/g, '').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]

  // Prefer the strategy's boundaries. A single over-long block (e.g. a wide sheet row or an
  // unbroken wall of text) is hard-split.
  const blocks = splitBlocks(clean, strategy)
  const chunks: string[] = []
  let cur = ''

  const flush = (): void => {
    const t = cur.trim()
    if (t) chunks.push(t)
  }
  const tail = (): string => (overlap > 0 && cur ? cur.slice(-overlap) : '')

  for (let block of blocks) {
    // Hard-split a block that alone exceeds size, carrying overlap across cuts.
    while (block.length > size) {
      const room = Math.max(1, size - cur.length)
      cur = cur ? `${cur}${sep}${block.slice(0, room)}` : block.slice(0, room)
      flush()
      const carry = tail()
      block = block.slice(room)
      cur = carry
    }
    if (cur && cur.length + block.length + sepLen > size) {
      flush()
      const carry = tail()
      cur = carry ? `${carry}${sep}${block}` : block
    } else {
      cur = cur ? `${cur}${sep}${block}` : block
    }
  }
  flush()
  return chunks
}
