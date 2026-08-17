#!/usr/bin/env node
// The "diagnose and recommend improvements" half of the suite. It reads the
// end-user journey results the AI runner produced (pass/fail + the on-screen
// survey and UX findings) plus a few real screenshots, and asks Claude to act
// as a senior product/QA lead: rank the functionality problems, then propose
// concrete, prioritised improvements. Output is recommendations.md.
//
// Run after run.mjs:  node diagnose.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(HERE, '.state')
const REPO = join(HERE, '..', '..')

function envFromFile(name) {
  try {
    const txt = readFileSync(join(REPO, '.env'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(new RegExp(`^${name}=(.*)$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return ''
}

const KEY = process.env.ANTHROPIC_API_KEY || envFromFile('ANTHROPIC_API_KEY')
const MODEL = process.env.DIAGNOSE_MODEL || 'claude-sonnet-4-5-20250929'
if (!KEY) {
  console.error('✗ no ANTHROPIC_API_KEY')
  process.exit(1)
}
// Which results file to diagnose (default the PWA run; pass results-desktop.json
// for the native pass).
const RESULTS = process.argv[2] || 'results.json'
const isDesktop = RESULTS.includes('desktop')
if (!existsSync(join(STATE, RESULTS))) {
  console.error(`✗ no ${RESULTS} — run the matching runner first`)
  process.exit(1)
}

const results = JSON.parse(readFileSync(join(STATE, RESULTS), 'utf8'))

// Attach a few real screenshots for grounding: every failed step, plus the
// survey and ux-scan screens. Cap at 5 to bound cost.
const shotsDir = join(STATE, isDesktop ? 'desktop-shots' : 'shots')
const allShots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => f.endsWith('.png')) : []
const failSteps = results.steps.filter((s) => s.status === 'FAIL').map((s) => s.step)
const wanted = new Set([...failSteps, '03-survey-home', '08-ux-scan'])
const picked = allShots.filter((f) => [...wanted].some((w) => f.startsWith(w))).slice(0, 5)
const images = picked.map((f) => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data: readFileSync(join(shotsDir, f)).toString('base64') }
}))

const brief = `You are a senior product and QA lead reviewing an AI-driven end-user test run of PlexiDesk's mobile web app (an all-in-one workspace: desks, documents, files, chat).

Here is the machine-readable result of the run. Each step is a real end-user journey the AI agent attempted by clicking and typing in the live UI. "detail" holds what the AI observed; "error" holds why a step failed.

${JSON.stringify(results, null, 2)}

The attached screenshots (${picked.join(', ') || 'none'}) are the actual screens at key/failed steps.

Produce a report in Markdown with three sections:

## Functionality problems
Ranked most severe first. For each: what is broken or missing (grounded in a specific step/screenshot), the user impact, and a concrete fix. Only include problems the evidence actually supports. If a step failed because the harness prompt was wrong rather than the product, say so and do not blame the product.

## UX and polish recommendations
Prioritised improvements a real user would benefit from, each with a one-line rationale and where it applies.

## What worked
Briefly, the journeys that passed cleanly.

Rules: no emoji, no em dashes, no colon-then-fragment label style, write real sentences. Do not invent problems that the results and screenshots do not support. Be specific and honest.`

console.log(`• asking ${MODEL} to diagnose (${images.length} screenshots attached) …`)
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: [{ type: 'text', text: brief }, ...images] }]
  })
})
const json = await res.json()
if (!res.ok) {
  console.error('✗ Anthropic error', res.status, JSON.stringify(json).slice(0, 400))
  process.exit(1)
}
const text = (json.content || []).map((b) => b.text || '').join('\n').trim()
const header = `# PlexiDesk AI E2E — diagnosis and recommendations

Run: ${results.when}  ·  target: ${results.target || results.surface}  ·  model: ${results.model}  ·  ${results.passed}/${results.passed + results.failed} journeys passed

`
const outName = RESULTS.replace(/results/, 'recommendations').replace(/\.json$/, '.md')
writeFileSync(join(STATE, outName), header + text + '\n')
console.log(`• wrote ${join(STATE, outName)}`)
