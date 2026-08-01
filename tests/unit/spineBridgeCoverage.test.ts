import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// SPINE BRIDGE COVERAGE — every ingested source type must be able to reach its graph node.
//
// The bug this locks: the indexer stamps each chunk with its connector's `sourceType`, and
// spine.ts maps sourceType -> the projection's source_table so a retrieved candidate can be
// bridged back to its brain node. The widget connector shipped (P4.5 Inc 1) without a
// matching bridge entry, so every widget candidate resolved to a NULL spine — findable by
// raw recall, but invisible to importance, room, lifecycle, cross-room unification and
// disagreement. The graph simply did not apply to a whole class of content.
//
// Locked as a CLASS invariant rather than a hardcoded 'widget' assertion, so the next
// connector added (the I5 external connectors) cannot repeat it: any connector whose
// sourceType has no bridge entry fails here.
//
// Read as SOURCE TEXT, not imports: the connector modules pull in the DB layer
// (better-sqlite3 is compiled for Electron's ABI and will not load under vitest), so a
// runtime import is not available to this lock.

const CONNECTOR_DIR = resolve(__dirname, '../../src/main/brain/connectors')
const SPINE = resolve(__dirname, '../../src/main/brain/spine.ts')

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

// The sourceType each connector declares on its exported Connector object.
function declaredSourceTypes(): string[] {
  const out = new Set<string>()
  for (const f of readdirSync(CONNECTOR_DIR)) {
    if (!f.endsWith('.ts') || f === 'types.ts' || f === 'registry.ts' || f === 'orchestrate.ts') continue
    const code = stripComments(readFileSync(resolve(CONNECTOR_DIR, f), 'utf8'))
    for (const m of code.matchAll(/sourceType:\s*'([a-z0-9_-]+)'/gi)) out.add(m[1])
  }
  return [...out].sort()
}

// The keys of SOURCE_TYPE_TO_TABLE in spine.ts.
function bridgedSourceTypes(): string[] {
  const code = stripComments(readFileSync(SPINE, 'utf8'))
  const block = code.match(/SOURCE_TYPE_TO_TABLE[^=]*=\s*\{([\s\S]*?)\}/)
  if (!block) return []
  return [...block[1].matchAll(/([a-z0-9_-]+)\s*:/gi)].map((m) => m[1]).sort()
}

describe('spine bridge covers every ingested source type', () => {
  it('finds the connectors and the bridge (the lock itself is wired)', () => {
    expect(declaredSourceTypes().length).toBeGreaterThanOrEqual(4)
    expect(bridgedSourceTypes().length).toBeGreaterThanOrEqual(3)
  })

  it('every connector sourceType has a SOURCE_TYPE_TO_TABLE entry', () => {
    const declared = declaredSourceTypes()
    const bridged = new Set(bridgedSourceTypes())
    const unbridged = declared.filter((t) => !bridged.has(t))
    expect(unbridged).toEqual([])
  })

  it('widget specifically is bridged (the regression that prompted this lock)', () => {
    expect(bridgedSourceTypes()).toContain('widget')
  })
})
