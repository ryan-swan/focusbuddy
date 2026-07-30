import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// PLX-AI-001 — all model invocation flows through a single internal abstraction; no
// service other than the model-client seam holds a runtime provider-SDK dependency.
// This is a whole-codebase audit: it fails if any file outside modelClient.ts
// value-imports the provider SDK or instantiates it. Type-only imports (erased at
// compile time) are permitted for message shapes.

const SEAM = 'src/main/ai/modelClient.ts'
const ROOT = join(__dirname, '../../src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('plx_ai_001 — single model-client abstraction', () => {
  const files = walk(ROOT)

  it('test_plx_ai_001_no_value_sdk_import_outside_seam', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (f.endsWith('modelClient.ts')) continue
      const src = readFileSync(f, 'utf8')
      // A VALUE import of the SDK (not `import type`).
      if (/^import\s+Anthropic\s+from\s+['"]@anthropic-ai\/sdk['"]/m.test(src)) {
        offenders.push(f.replace(ROOT, 'src'))
      }
    }
    expect(offenders, `value SDK imports must live only in ${SEAM}`).toEqual([])
  })

  it('test_plx_ai_001_no_direct_instantiation_outside_seam', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (f.endsWith('modelClient.ts')) continue
      if (/new\s+Anthropic\s*\(/.test(readFileSync(f, 'utf8'))) offenders.push(f.replace(ROOT, 'src'))
    }
    expect(offenders, 'no service may instantiate the provider SDK directly (PLX-AI-001)').toEqual([])
  })

  it('test_plx_ai_001_seam_exists_and_is_the_only_holder', () => {
    const seam = files.find((f) => f.endsWith('modelClient.ts'))
    expect(seam, 'the model-client seam must exist').toBeTruthy()
    const src = readFileSync(seam!, 'utf8')
    expect(/import\s+Anthropic\s+from\s+['"]@anthropic-ai\/sdk['"]/.test(src)).toBe(true)
    expect(/new\s+Anthropic\s*\(/.test(src)).toBe(true)
  })
})
