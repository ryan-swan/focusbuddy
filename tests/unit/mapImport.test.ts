import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseVsdx } from '../../src/main/mapImport'

// Build a minimal .vsdx (OOXML zip) with a masters part, a pages index, and one
// page holding two shapes wired by a connector. This exercises the real parser
// against a real (if tiny) Visio package — no mocking of the unzip/parse path.
function makeVsdx(pageXml: string, opts?: { masters?: string; pages?: string }): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'visio/pages/page1.xml': strToU8(pageXml)
  }
  files['visio/masters/masters.xml'] = strToU8(
    opts?.masters ??
      '<Masters><Master ID="2" NameU="Decision"/><Master ID="3" NameU="Process"/></Masters>'
  )
  files['visio/pages/pages.xml'] = strToU8(opts?.pages ?? '<Pages><Page Name="My Flow"/></Pages>')
  return zipSync(files)
}

const PAGE = `<?xml version="1.0"?>
<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main">
  <Shapes>
    <Shape ID="1" Master="3">
      <Cell N="PinX" V="1"/><Cell N="PinY" V="10"/>
      <Cell N="Width" V="1.5"/><Cell N="Height" V="0.75"/>
      <Text>Start</Text>
    </Shape>
    <Shape ID="2" Master="2">
      <Cell N="PinX" V="1"/><Cell N="PinY" V="8"/>
      <Cell N="Width" V="1.5"/><Cell N="Height" V="0.75"/>
      <Text>Decide?</Text>
    </Shape>
    <Shape ID="5">
      <Cell N="BeginX" V="1"/><Cell N="EndX" V="1"/>
      <Text>next</Text>
    </Shape>
  </Shapes>
  <Connects>
    <Connect FromSheet="5" FromCell="BeginX" ToSheet="1" ToCell="PinX"/>
    <Connect FromSheet="5" FromCell="EndX" ToSheet="2" ToCell="PinX"/>
  </Connects>
</PageContents>`

describe('parseVsdx', () => {
  it('imports shapes as nodes and a connector as an edge', async () => {
    const r = await parseVsdx(makeVsdx(PAGE))
    expect(r.ok).toBe(true)
    expect(r.title).toBe('My Flow')
    const body = r.body!
    // The connector (shape 5) is not a node; only the two 2-D shapes are.
    expect(body.nodes.map((n) => n.id)).toEqual(['p0_1', 'p0_2'])
    expect(body.nodes[0].label).toBe('Start')
    expect(body.nodes[1].label).toBe('Decide?')
  })

  it('maps Visio masters to the nearest stencil, defaulting unknown to process', async () => {
    const r = await parseVsdx(makeVsdx(PAGE))
    const [start, decide] = r.body!.nodes
    expect(start.shape).toBe('process')
    expect(decide.shape).toBe('decision')
  })

  it('flips Visio bottom-up Y so a higher PinY renders above (smaller screen y)', async () => {
    const r = await parseVsdx(makeVsdx(PAGE))
    const [start, decide] = r.body!.nodes
    // Start has the larger PinY (10 vs 8), so it must sit above Decide on screen.
    expect(start.y).toBeLessThan(decide.y)
    // Origin normalised to a small positive padding, never negative coordinates.
    expect(Math.min(...r.body!.nodes.map((n) => n.x))).toBeGreaterThanOrEqual(0)
    expect(Math.min(...r.body!.nodes.map((n) => n.y))).toBeGreaterThanOrEqual(0)
  })

  it('builds the edge from the connector Begin/End endpoints with its text label', async () => {
    const r = await parseVsdx(makeVsdx(PAGE))
    expect(r.body!.edges).toHaveLength(1)
    const e = r.body!.edges[0]
    expect(e.source).toBe('p0_1')
    expect(e.target).toBe('p0_2')
    expect(e.label).toBe('next')
  })

  it('scales inches to pixels (1.5in width → 144px)', async () => {
    const r = await parseVsdx(makeVsdx(PAGE))
    expect(r.body!.nodes[0].width).toBe(144)
    expect(r.body!.nodes[0].height).toBe(72)
  })

  it('drops a connector whose endpoints are missing rather than inventing an edge', async () => {
    const page = PAGE.replace('<Connect FromSheet="5" FromCell="EndX" ToSheet="2" ToCell="PinX"/>', '')
    const r = await parseVsdx(makeVsdx(page))
    expect(r.body!.edges).toHaveLength(0)
  })

  it('returns an honest error for a non-zip buffer, not a fabricated diagram', async () => {
    const r = await parseVsdx(new Uint8Array([1, 2, 3, 4]))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/could not read/i)
  })

  it('returns an error when the package has no Visio pages', async () => {
    const zip = zipSync({ 'docProps/app.xml': strToU8('<Properties/>') })
    const r = await parseVsdx(zip)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no visio pages/i)
  })

  it('stacks a second page below the first without overlap or id collisions', async () => {
    const files: Record<string, Uint8Array> = {
      'visio/pages/page1.xml': strToU8(PAGE),
      'visio/pages/page2.xml': strToU8(PAGE),
      'visio/masters/masters.xml': strToU8('<Masters><Master ID="2" NameU="Decision"/><Master ID="3" NameU="Process"/></Masters>'),
      'visio/pages/pages.xml': strToU8('<Pages><Page Name="My Flow"/></Pages>')
    }
    const r = await parseVsdx(zipSync(files))
    expect(r.ok).toBe(true)
    const ids = r.body!.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length) // all unique across pages
    expect(ids).toContain('p0_1')
    expect(ids).toContain('p1_1')
    // Page 2's shapes sit strictly below page 1's lowest shape.
    const page0Bottom = Math.max(...r.body!.nodes.filter((n) => n.id.startsWith('p0_')).map((n) => n.y))
    const page1Top = Math.min(...r.body!.nodes.filter((n) => n.id.startsWith('p1_')).map((n) => n.y))
    expect(page1Top).toBeGreaterThan(page0Bottom)
  })
})
