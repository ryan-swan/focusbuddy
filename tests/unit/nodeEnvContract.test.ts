import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// F-001 lock. vitest.config.ts sets `environment: 'happy-dom'` for every unit test.
// A DOM environment cannot bundle a Node built-in, so any test that reaches
// `node:sqlite` — directly, or through the `_memdb` helper — fails to LOAD unless it
// opts back into the node environment with a `@vitest-environment node` docblock.
//
// That is not a hypothetical: 25 files shipped in exactly that state and had never
// passed in the committed configuration. This lock exists so the 26th cannot.
//
// The invariant is REACHABILITY, not a spelling: the set is computed from the import
// graph on every run, so a new test that imports _memdb is covered the moment it is
// written. A lock that grepped one literal filename would be evaded by the next file.

const UNIT_DIR = join(__dirname)

// A docblock anywhere in the leading comment region, in either comment form.
const DECLARES_NODE_ENV = /@vitest-environment\s+node\b/

// This file names `node:sqlite` and `@vitest-environment node` in its own prose and
// patterns. Without excluding itself it would count as "reaching" and then satisfy the
// requirement vacuously off its own regex literal — a lock that passes by talking about
// itself. Scan everything except this file.
const SELF = 'nodeEnvContract.test.ts'

function unitTestFiles(): string[] {
  return readdirSync(UNIT_DIR)
    .filter((f) => f.endsWith('.test.ts') && f !== SELF)
    .sort()
}

/** Files that reach node:sqlite directly, or via a helper in tests/unit that does. */
function filesReachingNodeSqlite(): string[] {
  const helpers = readdirSync(UNIT_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  const tainted = new Set<string>()
  for (const h of helpers) {
    if (readFileSync(join(UNIT_DIR, h), 'utf8').includes('node:sqlite')) {
      tainted.add(h.replace(/\.ts$/, ''))
    }
  }

  return unitTestFiles().filter((f) => {
    const src = readFileSync(join(UNIT_DIR, f), 'utf8')
    if (src.includes('node:sqlite')) return true
    for (const t of tainted) {
      // matches `from './_memdb'`, `from "./_memdb"`, and bare-specifier variants
      if (new RegExp(`from\\s+['"][^'"]*\\b${t}\\b['"]`).test(src)) return true
    }
    return false
  })
}

describe('F-001 — tests reaching node:sqlite must declare the node environment', () => {
  it('every reaching test file carries a @vitest-environment node docblock', () => {
    const reaching = filesReachingNodeSqlite()

    // Guard the guard: if reachability computes to nothing, the lock has gone blind
    // (helper renamed, import rewritten) and would pass vacuously forever.
    expect(reaching.length).toBeGreaterThan(0)

    const missing = reaching.filter(
      (f) => !DECLARES_NODE_ENV.test(readFileSync(join(UNIT_DIR, f), 'utf8'))
    )

    expect(missing, `these tests reach node:sqlite under happy-dom and will fail to load:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  it('the node environment is genuinely required — node:sqlite is absent before Node 22.5', () => {
    // Documents the second half of F-001: the environment fix alone is not enough.
    // 4.0's .nvmrc said 20, where this module does not exist at all.
    const [major, minor] = process.versions.node.split('.').map(Number)
    const hasSqlite = major > 22 || (major === 22 && minor >= 5)
    expect(
      hasSqlite,
      `Node ${process.versions.node} cannot provide node:sqlite. The repo must run on >=22.5 — see .nvmrc.`
    ).toBe(true)
  })
})
