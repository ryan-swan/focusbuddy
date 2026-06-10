import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as XLSX from 'xlsx'
import { parseGridFromFile, inferColumnType, gridToTableDraft } from '../../src/main/gridImport'

const dir = mkdtempSync(join(tmpdir(), 'fb-grid-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('parseGridFromFile', () => {
  it('parses a CSV into headers + string-keyed rows', async () => {
    const p = join(dir, 'a.csv')
    writeFileSync(p, 'Email,MRR\na@x.com,100\nb@x.com,50\n')
    const res = await parseGridFromFile(p)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.grid.headers).toEqual(['Email', 'MRR'])
    expect(res.grid.rows).toEqual([
      { Email: 'a@x.com', MRR: '100' },
      { Email: 'b@x.com', MRR: '50' }
    ])
  })

  it('parses an array-of-objects JSON, unioning keys', async () => {
    const p = join(dir, 'a.json')
    writeFileSync(p, JSON.stringify([{ name: 'Al', mrr: 1 }, { name: 'Bo', plan: 'Pro' }]))
    const res = await parseGridFromFile(p)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.grid.headers).toEqual(['name', 'mrr', 'plan'])
    expect(res.grid.rows[1]).toEqual({ name: 'Bo', mrr: '', plan: 'Pro' })
  })

  it('rejects a non-array JSON with a clear error', async () => {
    const p = join(dir, 'obj.json')
    writeFileSync(p, JSON.stringify({ not: 'an array' }))
    const res = await parseGridFromFile(p)
    expect(res.ok).toBe(false)
  })

  it('parses a real XLSX workbook (first sheet) into headers + rows', async () => {
    const p = join(dir, 'a.xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ['Email', 'Name', 'MRR'],
      ['a@x.com', 'Alice', 100],
      ['c@x.com', 'Carol', 75]
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, p)

    const res = await parseGridFromFile(p)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.grid.headers).toEqual(['Email', 'Name', 'MRR'])
    expect(res.grid.rows[0]).toEqual({ Email: 'a@x.com', Name: 'Alice', MRR: '100' })
    expect(res.grid.rows).toHaveLength(2)
  })

  it('errors on an unsupported extension', async () => {
    const p = join(dir, 'a.pdf')
    writeFileSync(p, 'not a grid')
    const res = await parseGridFromFile(p)
    expect(res.ok).toBe(false)
  })
})

describe('inferColumnType', () => {
  it('classifies common shapes', () => {
    expect(inferColumnType(['1', '2', '3'])).toBe('number')
    expect(inferColumnType(['true', 'no', 'YES'])).toBe('checkbox')
    expect(inferColumnType(['2026-01-15', '2025-12-01'])).toBe('date')
    expect(inferColumnType(['alice', 'bob'])).toBe('text-short')
    expect(inferColumnType([])).toBe('text-short')
  })
})

describe('gridToTableDraft', () => {
  it('builds a table draft with inferred column types', () => {
    const draft = gridToTableDraft(
      { headers: ['Name', 'MRR'], rows: [{ Name: 'Al', MRR: '100' }] },
      'My table',
      '/tmp/x.csv'
    )
    expect(draft.kind).toBe('table')
    expect(draft.schema.columns.map((c) => c.type)).toEqual(['text-short', 'number'])
    expect(draft.rows).toHaveLength(1)
  })
})
