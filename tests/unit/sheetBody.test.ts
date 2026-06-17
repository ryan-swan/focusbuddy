import { describe, it, expect } from 'vitest'
import { normalizeBody, isV2, activeTab, colLabel } from '@renderer/lib/sheetBody'
import type { SheetBodyV2 } from '@shared/types'

// The body normalizer is the backward-compat funnel: legacy v1 grids must lift
// to v2 cleanly and v2 bodies must pass through intact.

describe('normalizeBody', () => {
  it('lifts a v1 grid into a single v2 tab', () => {
    const v2 = normalizeBody({ columns: ['A', 'B'], rows: [['1', '2'], ['3', '4']] })
    expect(isV2(v2)).toBe(true)
    expect(v2.sheets).toHaveLength(1)
    expect(v2.sheets[0].name).toBe('Sheet 1')
    expect(v2.sheets[0].columns).toEqual(['A', 'B'])
    expect(v2.sheets[0].rows).toEqual([['1', '2'], ['3', '4']])
  })

  it('defaults an empty v1 body to three columns', () => {
    const v2 = normalizeBody({ columns: [], rows: [] })
    expect(v2.sheets[0].columns).toEqual(['A', 'B', 'C'])
  })

  it('passes a v2 body through and clones its grids', () => {
    const body: SheetBodyV2 = {
      version: 2,
      sheets: [{ id: 's1', name: 'Data', columns: ['X'], rows: [['9']], formats: { '0,0': { bold: true } } }],
      activeSheet: 0
    }
    const out = normalizeBody(body)
    expect(out.sheets[0].name).toBe('Data')
    expect(out.sheets[0].formats?.['0,0']?.bold).toBe(true)
    // rows are cloned, not shared
    expect(out.sheets[0].rows).not.toBe(body.sheets[0].rows)
  })

  it('clamps a bad activeSheet index', () => {
    const out = normalizeBody({ version: 2, sheets: [], activeSheet: 5 } as SheetBodyV2)
    expect(out.sheets.length).toBeGreaterThan(0)
    expect(activeTab(out)).toBeTruthy()
  })
})

describe('colLabel', () => {
  it('produces spreadsheet column letters', () => {
    expect(colLabel(0)).toBe('A')
    expect(colLabel(25)).toBe('Z')
    expect(colLabel(26)).toBe('AA')
    expect(colLabel(27)).toBe('AB')
  })
})
