#!/usr/bin/env node
// Edges + Glass mission codemod (plexidesk, 2026-08-23).
//
//   node scripts/codemods/edges.mjs --census              bucket the border debt
//   node scripts/codemods/edges.mjs --dir components/views   dry-run the rewrite (default)
//   node scripts/codemods/edges.mjs --dir components/views --write
//   node scripts/codemods/edges.mjs --dir components --rules scrim,popover,raised-blur   (Phase 1 only)
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
//   sunken + <input|select|textarea>    ->  `fb-field` (a base skin; width and
//                                           text utilities on the element win
//                                           in the cascade and stay)
//   sunken + interactive                ->  `fb-tile`
//   sunken + static                     ->  `border` + the edge class dropped
//                                           (luminance step); radius untouched
//   fixed/absolute inset-0 + dim + blur ->  the dim and blur become `fb-scrim`
//   floating boxed popover/menu         ->  `fb-glass-panel` + row radius (card
//                                           radius when wide) + fb-pop-in
//   in-flow bg-raised/NN + backdrop-blur ->  content never glass: `fb-card`
//   no-fill <button>/<a> (outlined)     ->  `fb-btn-surface` (rule ghost-button)
//   everything else                     ->  listed, never rewritten.
//
// Safety: dry-run by default; idempotent (a rewritten file has no idiom left
// to match); refuses to write a file when its own re-parse of the output does
// not account for every removed token; never touches the AI lane's paths.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

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

// Deferred until Caleb has talked to Michael (DESIGN_SYSTEM names these as the
// second workstream's live area). Skipped unless --include-deferred.
const DEFERRED = ['components/documents/', 'components/officeApp/']
// Owned by plexidesk-75 (icons, chrome marks, the desk breadcrumb): never
// rewritten here; findings go to them by message or inbox note.
const OWNED_BY_75 = ['components/CanvasBreadcrumb.tsx']

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
const isDeferred = (p) => DEFERRED.some((a) => rel(p).startsWith(a))
const isOwnedBy75 = (p) => OWNED_BY_75.some((a) => rel(p) === a)

const SOFT = 'border-[var(--edge-soft)]'
const FIRM = 'border-[var(--edge-firm)]'

// Every string-like literal, found on the TypeScript AST so apostrophes in
// JSX text and comments can never desync the scan (a regex scanner silently
// swallowed 129 real class strings into code spans). Template expressions
// are returned as ONE entry whose `text` is the static class words with each
// ${expression} replaced by a placeholder; `exprs` restores them byte-for-byte.
export function classStrings(src, file = 'x.tsx') {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  const interesting = (t) => /\bborder\b/.test(t) || /outline-none/.test(t) || /backdrop-blur/.test(t)
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const start = n.getStart(sf)
      if (interesting(n.text)) out.push({ start: start + 1, end: n.getEnd() - 1, quote: src[start], text: n.text, exprs: [] })
    } else if (ts.isTemplateExpression(n)) {
      const start = n.getStart(sf)
      const exprs = []
      let text = n.head.text
      n.templateSpans.forEach((span, i) => {
        const from = n.head === undefined ? 0 : (i === 0 ? n.head.getEnd() : n.templateSpans[i - 1].literal.getEnd())
        const to = span.literal.getStart(sf)
        exprs.push(src.slice(from, to))  // the raw `${ ... }` minus the head's trailing "${" and literal's leading "}"
        // No padding: an expression glued to text (rounded-${size}) must stay
        // one word, and one separated by whitespace must stay separate.
        text += `__EXPR${i}__` + span.literal.text
      })
      if (interesting(text)) out.push({ start: start + 1, end: n.getEnd() - 1, quote: '`', text, exprs, template: n })
      n.templateSpans.forEach((span) => visit(span.expression))
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out.sort((a, b) => a.start - b.start)
}

// Rebuild a template expression's source from rewritten static text.
function restoreTemplate(entry, text) {
  return text.replace(/__EXPR(\d+)__/g, (_, i) => '${' + entry.exprs[Number(i)] + '}')
}

// The opening tag that carries this string (for interactivity + tag name).
export function enclosingTag(src, at) {
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
    for (const s of classStrings(src, f)) {
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

const isDimBg = (t) => /^(dark:)?bg-(black|stone-9[05]0)\/\d+$/.test(t)
const isBlur = (t) => /^backdrop-blur/.test(t)
const isRaisedAlpha = (t) => /^bg-\[var\(--surface-raised\)\]\/\d+$/.test(t)
const hasMotion = (words) => words.some((t) => /^(animate-|fb-pop-in|fb-fade|fb-spring|motion-)/.test(t))
// A wide popover is a sheet and takes the card radius; a menu takes the row radius.
const popoverRadius = (words) =>
  words.some((t) => /^(w-(80|96|\[(3[2-9]\d|[4-9]\d\d|min\()|max-w-(lg|xl|2xl)))/.test(t))
    ? 'rounded-[var(--radius-card)]'
    : 'rounded-[var(--radius-row)]'

// Which rule (if any) a class list falls under. The integrity check counts
// the same thing, so the two can never disagree.
let activeRules = null  // null = every rule; set from --rules a,b,c
export const setActiveRules = (list) => { activeRules = list ? new Set(list) : null }
const allowed = (rule) => (rule && (!activeRules || activeRules.has(rule)) ? rule : null)

export function matchRule(words, tag) {
  return allowed(matchAnyRule(words, tag))
}

function matchAnyRule(words, tag) {
  const boxed = words.includes('border') && words.includes(SOFT)
  const floating = isFloating(words)
  if (words.some((t) => t === 'inset-0') && (words.includes('fixed') || words.includes('absolute'))
      && words.some(isDimBg) && words.some(isBlur)) return 'scrim'
  if (floating && boxed && !words.includes('rounded-full') && !isButtonTag(tag)
      && (words.includes(RAISED) || words.includes(SUNKEN) || words.some(isRaisedAlpha))) return 'popover'
  if (!floating && boxed && words.some(isRaisedAlpha) && words.some(isBlur) && !words.includes('rounded-full')) return 'raised-blur'
  if (!boxed || words.includes('rounded-full') || floating) return null
  if (words.includes(RAISED)) return 'raised'
  if (words.includes(SUNKEN)) return isFieldTag(tag) ? 'field' : 'sunken'
  // Outlined ghost buttons: a stroke is the only thing making them a control.
  // Apple's secondary buttons are filled, not outlined (R5.4); they take the
  // raised surface-button skin. Caleb rules the bucket on the first sheet.
  if (!words.some((t) => /^bg-/.test(t)) && isButtonTag(tag)) return 'ghost-button'
  return null
}

export function rewriteString(text, tag) {
  const words = text.split(/\s+/).filter(Boolean)
  const rule = matchRule(words, tag)
  if (!rule) return null
  let removed = []
  let added = []
  switch (rule) {
    case 'scrim':
      removed = words.filter((t) => isDimBg(t) || isBlur(t))
      added = ['fb-scrim']
      break
    case 'popover':
      removed = words.filter((t) => t === 'border' || t === SOFT || /^dark:border-/.test(t) || t === RAISED || t === SUNKEN
        || isRaisedAlpha(t) || isRadius(t) || isShadow(t) || isBlur(t))
      added = ['fb-glass-panel', popoverRadius(words), ...(hasMotion(words) ? [] : ['fb-pop-in'])]
      break
    case 'raised-blur':
      removed = words.filter((t) => t === 'border' || t === SOFT || isRaisedAlpha(t) || isBlur(t) || isRadius(t) || isShadow(t))
      added = isButtonTag(tag) ? ['fb-btn-surface'] : isInteractive(tag) ? ['fb-card', 'fb-press'] : ['fb-card']
      break
    case 'raised':
      removed = words.filter((t) => t === 'border' || t === SOFT || t === RAISED || isRadius(t) || isShadow(t))
      added = isButtonTag(tag) ? ['fb-btn-surface'] : isInteractive(tag) ? ['fb-card', 'fb-press'] : ['fb-card']
      break
    case 'field':
      // .fb-field is a base skin in the components layer: width, padding and
      // text utilities on the element stay and win in the cascade, so only
      // the stroke, the fill, the radius and hand-rolled focus styling go.
      removed = words.filter((t) => t === 'border' || t === SOFT || t === SUNKEN || isRadius(t)
        || /^focus:(outline-none|border-|ring-)/.test(t) || t === 'outline-none')
      added = ['fb-field']
      break
    case 'ghost-button':
      removed = words.filter((t) => t === 'border' || t === SOFT || isRadius(t) || isShadow(t))
      added = ['fb-btn-surface']
      break
    case 'sunken':
      if (isInteractive(tag)) {
        removed = words.filter((t) => t === 'border' || t === SOFT || t === SUNKEN || isRadius(t))
        added = ['fb-tile']
      } else {
        removed = words.filter((t) => t === 'border' || t === SOFT)
        added = []
      }
      break
  }
  const kept = words.filter((t) => !removed.includes(t))
  return { text: [...added, ...kept].join(' '), removed, added, rule }
}

// Pure: rewrite one file's source. Returns { out, log } or { refused: true }.
export function rewriteSource(src, file = 'x.tsx') {
  let out = ''
  let last = 0
  const log = []
  for (const s of classStrings(src, file)) {
    const r = rewriteString(s.text, enclosingTag(src, s.start))
    if (!r) continue
    if (r.text.split(/\s+/).some((w) => /^rounded-.*__EXPR/.test(w)))
      log.push({ note: `${file}: a radius built from an expression sits beside the kit class; check by hand` })
    const body = s.exprs.length ? restoreTemplate(s, r.text) : r.text
    out += src.slice(last, s.start) + body
    last = s.end
    log.push({ removed: r.removed, added: r.added, rule: r.rule })
  }
  const rewrites = log.filter((l) => l.removed)
  if (!rewrites.length) return { out: src, log: [] }
  out += src.slice(last)
  // Integrity: the output must contain exactly one fewer boxed idiom per
  // rewrite, every added class must be present, and nothing but the planned
  // tokens may differ between input and output.
  const count = (text) => classStrings(text, file).filter((x) => matchRule(x.text.split(/\s+/).filter(Boolean), enclosingTag(text, x.start))).length
  const before = count(src), after = count(out)
  const tokensOf = (t) => t.split(/[\s'"`]+/).filter(Boolean)
  const bag = (arr) => arr.reduce((m, t) => (m.set(t, (m.get(t) ?? 0) + 1), m), new Map())
  const a = bag(tokensOf(src)), b = bag(tokensOf(out))
  const planned = bag(rewrites.flatMap((l) => l.removed)), plannedAdd = bag(rewrites.flatMap((l) => l.added))
  let ok = before - after === rewrites.length
  for (const [t, n] of a) { const d = n - (b.get(t) ?? 0); if (d > 0 && (planned.get(t) ?? 0) !== d) ok = false }
  for (const [t, n] of b) { const d = n - (a.get(t) ?? 0); if (d > 0 && (plannedAdd.get(t) ?? 0) !== d) ok = false }
  if (!ok) return { refused: true, before, after, rewrites: rewrites.length }
  return { out, log }
}

function rewriteFile(f, write) {
  const src = readFileSync(f, 'utf8')
  const r = rewriteSource(src, rel(f))
  if (r.refused) {
    console.error(`REFUSED ${rel(f)}: integrity check failed (before=${r.before} after=${r.after} rewrites=${r.rewrites})`)
    return { changed: 0, refused: true }
  }
  for (const l of r.log) if (l.note) console.log(`NOTE ${l.note}`)
  const changed = r.log.filter((l) => l.removed).length
  if (changed && write) writeFileSync(f, r.out)
  return { changed, log: r.log }
}

// --inventory glass: every floating boxed element and every ad-hoc blur, with
// file:line and the class string, bucketed for the Phase 1 glass rollout.
function inventoryGlass(files) {
  const rows = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const s of classStrings(src, f)) {
      const toks = s.text.split(/\s+/).filter(Boolean)
      const line = src.slice(0, s.start).split('\n').length
      const floating = isFloating(toks)
      const blur = toks.some((t) => /^backdrop-blur/.test(t))
      const tier = toks.find((t) => /^fb-glass-/.test(t))
      const boxed = toks.includes('border') && toks.includes(SOFT)
      if (!(floating && boxed) && !(blur && !tier)) continue
      rows.push({ file: rel(f), line, floating, blur, boxed, tier: tier ?? '', text: s.text.slice(0, 110) })
    }
  }
  const sect = (title, pred) => {
    const r = rows.filter(pred)
    console.log(`\n## ${title} (${r.length})\n`)
    for (const x of r) console.log(`- ${x.file}:${x.line}  \`${x.text}\``)
  }
  sect('Floating boxed (fixed/absolute + z, border edge-soft): panel tier candidates', (x) => x.floating && x.boxed)
  sect('Ad-hoc backdrop-blur on a FLOATING element (no tier): adopt a tier', (x) => x.blur && !x.tier && x.floating)
  sect('Ad-hoc backdrop-blur on an IN-FLOW element (no tier): content, flatten or justify', (x) => x.blur && !x.tier && !x.floating)
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
const all = isCli ? walk(SRC).filter((f) => !isAiLane(f)) : []
if (!isCli) {
  // imported by tests: no side effects
} else if (flag('--census')) {
  census(all)
} else if (opt('--inventory') === 'glass') {
  inventoryGlass(all)
} else {
  const dir = opt('--dir')
  if (!dir) { console.error('need --census or --dir <path under src/renderer/src>'); process.exit(2) }
  if (opt('--rules')) setActiveRules(opt('--rules').split(','))
  const files = all.filter((f) => rel(f).startsWith(dir))
    .filter((f) => flag('--include-deferred') || !isDeferred(f))
    .filter((f) => !isOwnedBy75(f))
  const write = flag('--write')
  let total = 0, refused = 0
  for (const f of files) {
    const r = rewriteFile(f, write)
    if (r.refused) refused++
    if (r.changed) {
      total += r.changed
      const rules = r.log.filter((l) => l.rule).map((l) => l.rule).join(', ')
      console.log(`${write ? 'wrote' : 'would rewrite'} ${rel(f)}: ${r.changed} element(s) [${rules}]`)
    }
  }
  console.log(`\n${write ? 'WROTE' : 'DRY RUN'}: ${total} element(s) in ${files.length} file(s) under ${dir}; refused ${refused}`)
  if (refused) process.exit(1)
}
