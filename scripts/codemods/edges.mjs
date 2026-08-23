#!/usr/bin/env node
// Edges + Glass mission codemod (plexidesk, 2026-08-23).
//
//   node scripts/codemods/edges.mjs --census              bucket the border debt
//   node scripts/codemods/edges.mjs --dir components/views   dry-run the rewrite (default)
//   node scripts/codemods/edges.mjs --dir components/views --write
//
// Census: counts every border idiom in renderer TSX and buckets the boxed
// `border border-[var(--edge-soft)]` idiom by fill, radius and interactivity,
// so the mapping the design-system owner ratifies is evidence.
//
// Rewrite (Phase 2; mapping put to plexidesk-08 2026-08-23, Caleb's Gate 0
// sheet is the taste gate):
//   raised + <button>/<a>/role=button   ->  `fb-btn-surface` (drops border, the
//                                           edge class, the fill, rounded-* and
//                                           shadow-*); capsules (rounded-full)
//                                           are left for the hand pass
//   raised + clickable div              ->  `fb-card fb-press`
//   raised + static                     ->  `fb-card`
//   sunken + <input|select|textarea>    ->  listed only (.fb-field by hand; it
//                                           is a full skin, width 100%)
//   sunken + interactive                ->  `fb-tile`
//   sunken + static                     ->  `border` + the edge class dropped
//                                           (luminance step); radius untouched
//   everything else                     ->  listed, never rewritten.
//
// Safety: dry-run by default; idempotent (a rewritten file has no idiom left
// to match); refuses to write a file when its own re-parse of the output does
// not account for every removed token; never touches the AI lane's paths.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(new URL('../../', import.meta.url).pathname)
const SRC = join(ROOT, 'src/renderer/src')

// Owned by the Plexii AI lane (2026-08-22 lane split). Never rewritten here;
// they adopt the ratified doctrine themselves.
const AI_LANE = [
  'components/ChatPanel.tsx',
  'components/ProposalCards.tsx',
  'components/ChatBlockView.tsx',
  'components/assistant/',
  'components/views/chat/',
  'stores/chat',
  'lib/chat',
  'lib/assistant'
]

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}
const rel = (p) => relative(SRC, p)
const isAiLane = (p) => AI_LANE.some((a) => rel(p).startsWith(a))

const SOFT = 'border-[var(--edge-soft)]'
const FIRM = 'border-[var(--edge-firm)]'

// Every string literal that could be a className: '...', "...", `...` (template
// literals are scanned as a whole; ${} segments are left in place untouched).
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g

function classStrings(src) {
  const out = []
  let m
  while ((m = STRING_RE.exec(src))) {
    const s = m[2]
    if (!/\bborder\b/.test(s) && !/outline-none/.test(s) && !/backdrop-blur/.test(s)) continue
    out.push({ start: m.index, end: m.index + m[0].length, quote: m[1], text: s })
  }
  return out
}

// The opening tag that carries this string (for interactivity + tag name).
function enclosingTag(src, at) {
  const open = src.lastIndexOf('<', at)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return src.slice(open, i + 1)
  }
  return src.slice(open, at + 400)
}
const isInteractive = (tag) =>
  /^<button\b/.test(tag) || /\bonClick=/.test(tag) || /\brole=["']button["']/.test(tag) || /^<a\b/.test(tag)

function bucketBoxed(tokens, tag) {
  const fill = tokens.find((t) => /^bg-\[var\(--surface-(raised|sunken|base)\)\]$/.test(t))
  const anyBg = tokens.some((t) => /^bg-/.test(t))
  const radius = tokens.find((t) => /^rounded(-[a-z0-9\[\]]+)?$/.test(t)) ?? '(none)'
  const fillKey = fill ? fill.replace('bg-[var(--surface-', '').replace(')]', '') : anyBg ? 'other-fill' : 'no-fill'
  return { fillKey, radius, interactive: isInteractive(tag) }
}

function census(files) {
  const counts = {
    'edge-soft (any)': 0, 'edge-firm (any)': 0, 'boxed edge-soft': 0, 'divider edge-soft': 0,
    'literal-colour borders': 0, 'border-stone-*': 0, 'border-white/*': 0, 'border-black/*': 0,
    'outline-none, no focus-visible ring on the element': 0, 'ad-hoc backdrop-blur (no fb-glass on element)': 0
  }
  const boxed = {}  // fillKey -> radius -> {count, interactive}
  const byDir = {}
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const s of classStrings(src)) {
      const toks = s.text.split(/\s+/).filter(Boolean)
      const tag = enclosingTag(src, s.start)
      if (toks.includes(SOFT)) counts['edge-soft (any)']++
      if (toks.includes(FIRM)) counts['edge-firm (any)']++
      if (toks.some((t) => /^border-\[(rgb|oklch|#)/.test(t))) counts['literal-colour borders']++
      if (toks.some((t) => /^border-stone-/.test(t))) counts['border-stone-*']++
      if (toks.some((t) => /^border-white\//.test(t))) counts['border-white/*']++
      if (toks.some((t) => /^border-black\//.test(t))) counts['border-black/*']++
      if (toks.some((t) => /^(focus:)?outline-none$/.test(t)) && !toks.some((t) => /^focus-visible:/.test(t)))
        counts['outline-none, no focus-visible ring on the element']++
      if (toks.some((t) => /^backdrop-blur/.test(t)) && !toks.some((t) => /^fb-glass-/.test(t)))
        counts['ad-hoc backdrop-blur (no fb-glass on element)']++
      if (toks.includes(SOFT) && toks.includes('border')) {
        counts['boxed edge-soft']++
        if (isFloating(toks)) counts['  of which floating (fixed/absolute + z): glass-panel tier by hand'] = (counts['  of which floating (fixed/absolute + z): glass-panel tier by hand'] ?? 0) + 1
        const b = bucketBoxed(toks, tag)
        boxed[b.fillKey] ??= {}
        boxed[b.fillKey][b.radius] ??= { count: 0, interactive: 0 }
        boxed[b.fillKey][b.radius].count++
        if (b.interactive) boxed[b.fillKey][b.radius].interactive++
        const d = rel(f).split('/').slice(0, -1).join('/') || '(root)'
        byDir[d] = (byDir[d] ?? 0) + 1
      } else if (toks.includes(SOFT) && toks.some((t) => /^border-[tblrxy]$/.test(t))) {
        counts['divider edge-soft']++
      }
    }
  }
  console.log(`# Edges census (${files.length} renderer TSX files, AI lane excluded)\n`)
  console.log('| Idiom | Count |\n|---|---|')
  for (const [k, v] of Object.entries(counts)) console.log(`| ${k} | ${v} |`)
  console.log('\n## Boxed `border border-[var(--edge-soft)]` by fill and radius\n')
  console.log('| Fill | Radius | Count | of which interactive |\n|---|---|---|---|')
  for (const [fill, radii] of Object.entries(boxed).sort())
    for (const [r, v] of Object.entries(radii).sort((a, b) => b[1].count - a[1].count))
      console.log(`| ${fill} | ${r} | ${v.count} | ${v.interactive} |`)
  console.log('\n## Boxed, by directory\n')
  console.log('| Directory | Boxed |\n|---|---|')
  for (const [d, n] of Object.entries(byDir).sort((a, b) => b[1] - a[1])) console.log(`| ${d} | ${n} |`)
}

// ---------------------------------------------------------------- rewrite ---
const RAISED = 'bg-[var(--surface-raised)]'
const SUNKEN = 'bg-[var(--surface-sunken)]'
const isRadius = (t) => /^rounded(-[a-z0-9\[\]]+)?$/.test(t)
const isShadow = (t) => /^shadow(-[a-z0-9\[\]().,/-]+)?$/.test(t) && !/^shadow-\[inset/.test(t)

// A fixed/absolute box with a z-index is a floating surface (popover, menu,
// toast). The glass law puts those on a tier; fb-card is wrong for them.
const isFloating = (words) =>
  words.some((t) => t === 'fixed' || t === 'absolute') && words.some((t) => /^z-/.test(t))
const isButtonTag = (tag) => /^<(button|a)\b/.test(tag) || /\brole=["']button["']/.test(tag)
const isFieldTag = (tag) => /^<(input|select|textarea)\b/.test(tag)

function rewriteString(text, tag) {
  const toks = text.split(/(\s+)/)  // keep whitespace so formatting survives
  const words = toks.filter((t) => t && !/^\s+$/.test(t))
  if (!(words.includes('border') && words.includes(SOFT))) return null
  if (words.includes('rounded-full')) return null  // capsules: hand pass
  if (isFloating(words)) return null  // popovers and menus: glass-panel tier by hand
  let removed = []
  let added = []
  if (words.includes(RAISED)) {
    removed = words.filter((t) => t === 'border' || t === SOFT || t === RAISED || isRadius(t) || isShadow(t))
    if (isButtonTag(tag)) added = ['fb-btn-surface']
    else if (isInteractive(tag)) added = ['fb-card', 'fb-press']
    else added = ['fb-card']
  } else if (words.includes(SUNKEN)) {
    if (isFieldTag(tag)) return null  // .fb-field by hand, per surface
    const interactive = isInteractive(tag)
    if (interactive) {
      removed = words.filter((t) => t === 'border' || t === SOFT || t === SUNKEN || isRadius(t))
      added = ['fb-tile']
    } else {
      removed = words.filter((t) => t === 'border' || t === SOFT)
      added = []
    }
  } else {
    return null  // listed by the census, rewritten by hand
  }
  const kept = words.filter((t) => !removed.includes(t))
  return { text: [...added, ...kept].join(' '), removed, added }
}

function rewriteFile(f, write) {
  const src = readFileSync(f, 'utf8')
  let out = ''
  let last = 0
  const log = []
  for (const s of classStrings(src)) {
    if (s.quote === '`' && /\$\{/.test(s.text)) {
      // Template literal with expressions: rewrite only the static class words.
      // Expressions are left byte-identical.
      const r = rewriteString(s.text.replace(/\$\{[^}]*\}/g, (m) => ` __EXPR${log.length}_${Buffer.from(m).toString('hex')}__ `), enclosingTag(src, s.start))
      if (!r) continue
      const restored = r.text.replace(/__EXPR\d+_([0-9a-f]+)__/g, (_, h) => Buffer.from(h, 'hex').toString())
      out += src.slice(last, s.start) + s.quote + restored + s.quote
      last = s.end
      log.push({ removed: r.removed, added: r.added })
      continue
    }
    const r = rewriteString(s.text, enclosingTag(src, s.start))
    if (!r) continue
    out += src.slice(last, s.start) + s.quote + r.text + s.quote
    last = s.end
    log.push({ removed: r.removed, added: r.added })
  }
  if (!log.length) return { changed: 0 }
  out += src.slice(last)
  // Integrity: the output must contain exactly one fewer boxed idiom per
  // rewrite, every added class must be present, and nothing but the planned
  // tokens may differ between input and output.
  const count = (s) => classStrings(s).filter((x) => {
    const w = x.text.split(/\s+/)
    if (!(w.includes('border') && w.includes(SOFT)) || w.includes('rounded-full') || isFloating(w)) return false
    if (w.includes(RAISED)) return true
    return w.includes(SUNKEN) && !isFieldTag(enclosingTag(s, x.start))
  }).length
  const before = count(src), after = count(out)
  const tokensOf = (s) => s.split(/[\s'"`]+/).filter(Boolean)
  const bag = (arr) => arr.reduce((m, t) => (m.set(t, (m.get(t) ?? 0) + 1), m), new Map())
  const a = bag(tokensOf(src)), b = bag(tokensOf(out))
  const planned = bag(log.flatMap((l) => l.removed)), plannedAdd = bag(log.flatMap((l) => l.added))
  let ok = before - after === log.length
  for (const [t, n] of a) { const d = n - (b.get(t) ?? 0); if (d > 0 && (planned.get(t) ?? 0) !== d) ok = false }
  for (const [t, n] of b) { const d = n - (a.get(t) ?? 0); if (d > 0 && (plannedAdd.get(t) ?? 0) !== d) ok = false }
  if (!ok) {
    console.error(`REFUSED ${rel(f)}: integrity check failed (before=${before} after=${after} rewrites=${log.length})`)
    return { changed: 0, refused: true }
  }
  if (write) writeFileSync(f, out)
  return { changed: log.length, log }
}

const all = walk(SRC).filter((f) => !isAiLane(f))
if (flag('--census')) {
  census(all)
} else {
  const dir = opt('--dir')
  if (!dir) { console.error('need --census or --dir <path under src/renderer/src>'); process.exit(2) }
  const files = all.filter((f) => rel(f).startsWith(dir))
  const write = flag('--write')
  let total = 0, refused = 0
  for (const f of files) {
    const r = rewriteFile(f, write)
    if (r.refused) refused++
    if (r.changed) { total += r.changed; console.log(`${write ? 'wrote' : 'would rewrite'} ${rel(f)}: ${r.changed} element(s)`) }
  }
  console.log(`\n${write ? 'WROTE' : 'DRY RUN'}: ${total} element(s) in ${files.length} file(s) under ${dir}; refused ${refused}`)
  if (refused) process.exit(1)
}
