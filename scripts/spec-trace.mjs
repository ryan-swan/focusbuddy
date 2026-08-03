#!/usr/bin/env node
// Requirement-to-test traceability harness (PLX-ENG-021 / Definition of Done gate 13).
//
// The Plexi spec (plexi-spec/) is the normative contract: 344 PLX-* requirements,
// each of which is meant to be verified by a test whose name cites the id, e.g.
// PLX-CTX-001 -> a test containing "plx_ctx_001" (or the literal id). This script
// reads the spec's machine index (_index/requirements.json), scans the test tree,
// and reports which requirements are traceable to a test and which are not.
//
// It is REPORT-mode by default so it can run while coverage is still near zero.
// Pass --strict --min <pct> to fail the build once we want to gate on it, or
// --area <AREA> to focus a single area. Writes a JSON report to
// build/spec-trace.report.json for dashboards.
//
// Usage:
//   node scripts/spec-trace.mjs                 # full report
//   node scripts/spec-trace.mjs --area CTX      # one area
//   node scripts/spec-trace.mjs --strict --min 10   # exit 1 if coverage < 10%

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_INDEX = join(ROOT, 'plexi-spec', '_index', 'requirements.json')
const TEST_DIR = join(ROOT, 'tests')
const REPORT = join(ROOT, 'build', 'spec-trace.report.json')

const args = process.argv.slice(2)
const opt = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? (args[i + 1] ?? true) : undefined
}
const areaFilter = opt('--area')
const strict = args.includes('--strict')
const minPct = Number(opt('--min') ?? 0)

if (!existsSync(SPEC_INDEX)) {
  console.error(`spec index not found at ${SPEC_INDEX}. Is the plexi-spec vault present?`)
  process.exit(2)
}

const spec = JSON.parse(readFileSync(SPEC_INDEX, 'utf8'))
let requirements = spec.requirements ?? []
if (areaFilter) requirements = requirements.filter((r) => r.area === areaFilter)

// Collect the full text of every test file once.
const TEST_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs'])
function walk(dir) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) out.push(...walk(p))
    else if (TEST_EXT.has(extname(name))) out.push(p)
  }
  return out
}
const testFiles = walk(TEST_DIR)
const haystack = testFiles.map((f) => readFileSync(f, 'utf8').toLowerCase()).join('\n')

// A requirement is "traceable" if a test cites its id in any accepted form:
//   PLX-CTX-001  ->  plx-ctx-001 | plx_ctx_001 | plxctx001
function variants(id) {
  const lower = id.toLowerCase() // plx-ctx-001
  return [lower, lower.replace(/-/g, '_'), lower.replace(/-/g, '')]
}
const covered = []
const uncovered = []
for (const r of requirements) {
  const hit = variants(r.id).some((v) => haystack.includes(v))
  ;(hit ? covered : uncovered).push(r.id)
}

// Per-area rollup.
const byArea = {}
for (const r of requirements) {
  byArea[r.area] ??= { total: 0, covered: 0 }
  byArea[r.area].total++
  if (covered.includes(r.id)) byArea[r.area].covered++
}

const total = requirements.length
const cov = covered.length
const pct = total ? (cov / total) * 100 : 0

// ── Report ──────────────────────────────────────────────────────────────────
const bar = (c, t, w = 24) => {
  const filled = t ? Math.round((c / t) * w) : 0
  return '█'.repeat(filled) + '░'.repeat(w - filled)
}
console.log(`\nPlexi spec traceability (PLX-ENG-021 / DoD gate 13)`)
console.log(`Spec: ${spec.document ?? 'PLX'} v${spec.version ?? '?'} · ${testFiles.length} test files scanned\n`)
console.log(`  ${bar(cov, total)}  ${cov}/${total} requirements traceable to a test (${pct.toFixed(1)}%)\n`)
const areas = Object.keys(byArea).sort()
for (const a of areas) {
  const { covered: c, total: t } = byArea[a]
  console.log(`  ${a.padEnd(6)} ${bar(c, t, 14)} ${String(c).padStart(3)}/${String(t).padEnd(3)}`)
}

try {
  mkdirSync(dirname(REPORT), { recursive: true })
  writeFileSync(
    REPORT,
    JSON.stringify(
      { generatedFrom: 'scripts/spec-trace.mjs', specVersion: spec.version, total, covered: cov, pct: Number(pct.toFixed(2)), byArea, uncovered },
      null,
      2
    )
  )
  console.log(`\n  report -> ${REPORT.replace(ROOT + '/', '')}`)
} catch (e) {
  console.warn('  (could not write report:', e.message, ')')
}

if (strict && pct < minPct) {
  console.error(`\nFAIL: traceability ${pct.toFixed(1)}% is below the --min ${minPct}% gate.`)
  process.exit(1)
}
console.log('')
