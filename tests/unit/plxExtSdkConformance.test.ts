import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// PLX-EXT-012 — every SDK interface MUST be exercised by at least one first-party
// application, so the SDK's capability is continuously proven rather than asserted
// (PLX-EXT-002: extensions use the same public platform interfaces as first-party
// apps). The public platform interface is `window.api`, declared in the preload.
// The first-party application is the renderer. This test enumerates every api
// namespace from the preload and proves the renderer exercises each one, so a
// namespace added without a first-party caller (a dead or unproven SDK surface)
// fails the build.

const PRELOAD = resolve(process.cwd(), 'src/preload/index.ts')
const RENDERER = resolve(process.cwd(), 'src/renderer/src')

function apiNamespaces(): string[] {
  const src = readFileSync(PRELOAD, 'utf8')
  const body = src.slice(src.indexOf('const api = {'))
  const re = /^ {2}([a-zA-Z][a-zA-Z0-9]*):/gm
  const set = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) set.add(m[1])
  return [...set]
}

function collectSource(dir: string): string {
  let out = ''
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out += collectSource(p)
    else if (/\.(ts|tsx)$/.test(name)) out += '\n' + readFileSync(p, 'utf8')
  }
  return out
}

// Matches api.ns, api?.ns and api['ns'] / api?.['ns'] so wrapper modules that use
// optional chaining or bracket access still count as exercising the interface.
function isExercised(hay: string, ns: string): boolean {
  const re = new RegExp('api\\s*\\??\\s*(?:\\.\\s*' + ns + '\\b|\\[\\s*[\'"]' + ns + '[\'"])')
  return re.test(hay)
}

describe('plx_ext_012 — every SDK interface is exercised by a first-party application', () => {
  const namespaces = apiNamespaces()
  const rendererSource = collectSource(RENDERER)

  it('test_plx_ext_012_preload_declares_a_nontrivial_platform_interface', () => {
    expect(namespaces.length).toBeGreaterThan(20)
  })

  it('test_plx_ext_012_every_api_namespace_has_a_first_party_caller', () => {
    const unexercised = namespaces.filter((ns) => !isExercised(rendererSource, ns))
    expect(unexercised, `SDK namespaces with no first-party caller: ${unexercised.join(', ')}`).toEqual([])
  })
})
