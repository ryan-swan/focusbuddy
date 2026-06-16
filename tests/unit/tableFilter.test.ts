// Unit tests for the table filter + grouping engine.
// These are pure-function tests: no DOM, no Electron, no IPC.
// They cover evaluateRule, applyFilters, groupRows, and the helpers
// so we can catch regressions without booting the full app.

import { describe, it, expect } from 'vitest'
import {
  evaluateRule,
  applyFilters,
  groupRows,
  operatorNeedsValue,
  operatorWantsMultiValue,
  isGroupableColumn,
  OPERATORS_BY_TYPE
} from '../../src/renderer/src/lib/tableFilter'
import type { FieldDefinition, FbRow, TableSchema } from '@shared/fields'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeRow(id: string, cells: Record<string, unknown>): FbRow {
  return { id, tableId: 't1', cells, sortOrder: 0, createdAt: 0, updatedAt: 0 }
}

function makeCol(id: string, type: FieldDefinition['type'], extra?: Partial<FieldDefinition>): FieldDefinition {
  const base = { id, type, label: id, config: {} as never, ...extra }
  if (type === 'single-select' || type === 'multi-select') {
    (base as { config: unknown }).config = { options: [] }
  }
  return base as FieldDefinition
}

function makeSchema(cols: FieldDefinition[]): TableSchema {
  return { columns: cols }
}

// ── operatorNeedsValue ───────────────────────────────────────────────────────

describe('operatorNeedsValue', () => {
  it('returns false for no-argument operators', () => {
    expect(operatorNeedsValue('is-empty')).toBe(false)
    expect(operatorNeedsValue('is-not-empty')).toBe(false)
    expect(operatorNeedsValue('is-checked')).toBe(false)
    expect(operatorNeedsValue('is-unchecked')).toBe(false)
  })
  it('returns true for value-taking operators', () => {
    expect(operatorNeedsValue('contains')).toBe(true)
    expect(operatorNeedsValue('gt')).toBe(true)
    expect(operatorNeedsValue('is-any-of')).toBe(true)
  })
})

// ── operatorWantsMultiValue ──────────────────────────────────────────────────

describe('operatorWantsMultiValue', () => {
  it('returns true for set operators only', () => {
    expect(operatorWantsMultiValue('is-any-of')).toBe(true)
    expect(operatorWantsMultiValue('has-all-of')).toBe(true)
    expect(operatorWantsMultiValue('has-none-of')).toBe(true)
    expect(operatorWantsMultiValue('contains')).toBe(false)
    expect(operatorWantsMultiValue('is')).toBe(false)
  })
})

// ── isGroupableColumn ────────────────────────────────────────────────────────

describe('isGroupableColumn', () => {
  it('returns false only for button columns', () => {
    expect(isGroupableColumn(makeCol('x', 'button'))).toBe(false)
    expect(isGroupableColumn(makeCol('x', 'text-short'))).toBe(true)
    expect(isGroupableColumn(makeCol('x', 'checkbox'))).toBe(true)
    expect(isGroupableColumn(makeCol('x', 'single-select'))).toBe(true)
    expect(isGroupableColumn(makeCol('x', 'number'))).toBe(true)
  })
})

// ── OPERATORS_BY_TYPE ────────────────────────────────────────────────────────

describe('OPERATORS_BY_TYPE', () => {
  it('button has no operators', () => {
    expect(OPERATORS_BY_TYPE['button']).toEqual([])
  })
  it('checkbox only has is-checked / is-unchecked', () => {
    expect(OPERATORS_BY_TYPE['checkbox']).toEqual(['is-checked', 'is-unchecked'])
  })
  it('number includes gt, lt, gte, lte', () => {
    const ops = OPERATORS_BY_TYPE['number']
    expect(ops).toContain('gt')
    expect(ops).toContain('lt')
    expect(ops).toContain('gte')
    expect(ops).toContain('lte')
  })
})

// ── evaluateRule — text ──────────────────────────────────────────────────────

describe('evaluateRule — text-short', () => {
  const col = makeCol('c1', 'text-short')
  const makeRule = (operator: Parameters<typeof evaluateRule>[0]['operator'], value?: string) =>
    ({ id: 'r1', columnId: 'c1', operator, value })

  it('contains — matches substring (case insensitive)', () => {
    expect(evaluateRule(makeRule('contains', 'ello'), col, 'Hello World')).toBe(true)
    expect(evaluateRule(makeRule('contains', 'xyz'), col, 'Hello World')).toBe(false)
  })
  it('not-contains', () => {
    expect(evaluateRule(makeRule('not-contains', 'xyz'), col, 'Hello World')).toBe(true)
    expect(evaluateRule(makeRule('not-contains', 'Hello'), col, 'Hello World')).toBe(false)
  })
  it('is — exact match (case insensitive)', () => {
    expect(evaluateRule(makeRule('is', 'hello world'), col, 'Hello World')).toBe(true)
    expect(evaluateRule(makeRule('is', 'hello'), col, 'Hello World')).toBe(false)
  })
  it('is-not', () => {
    expect(evaluateRule(makeRule('is-not', 'other'), col, 'Hello World')).toBe(true)
    expect(evaluateRule(makeRule('is-not', 'hello world'), col, 'Hello World')).toBe(false)
  })
  it('is-empty / is-not-empty', () => {
    expect(evaluateRule(makeRule('is-empty'), col, '')).toBe(true)
    expect(evaluateRule(makeRule('is-empty'), col, 'hi')).toBe(false)
    expect(evaluateRule(makeRule('is-not-empty'), col, 'hi')).toBe(true)
    expect(evaluateRule(makeRule('is-not-empty'), col, '')).toBe(false)
    expect(evaluateRule(makeRule('is-not-empty'), col, null)).toBe(false)
  })
  it('passes through (returns true) when value is missing for contains', () => {
    // A rule with no value set yet should not blank the table.
    expect(evaluateRule({ id: 'r', columnId: 'c1', operator: 'contains' }, col, 'anything')).toBe(true)
  })
})

// ── evaluateRule — checkbox ──────────────────────────────────────────────────

describe('evaluateRule — checkbox', () => {
  const col = makeCol('c2', 'checkbox')
  it('is-checked matches true only', () => {
    expect(evaluateRule({ id: 'r', columnId: 'c2', operator: 'is-checked' }, col, true)).toBe(true)
    expect(evaluateRule({ id: 'r', columnId: 'c2', operator: 'is-checked' }, col, false)).toBe(false)
    expect(evaluateRule({ id: 'r', columnId: 'c2', operator: 'is-checked' }, col, null)).toBe(false)
  })
  it('is-unchecked matches anything that is not true', () => {
    expect(evaluateRule({ id: 'r', columnId: 'c2', operator: 'is-unchecked' }, col, false)).toBe(true)
    expect(evaluateRule({ id: 'r', columnId: 'c2', operator: 'is-unchecked' }, col, null)).toBe(true)
    expect(evaluateRule({ id: 'r', columnId: 'c2', operator: 'is-unchecked' }, col, true)).toBe(false)
  })
})

// ── evaluateRule — number ────────────────────────────────────────────────────

describe('evaluateRule — number', () => {
  const col = makeCol('c3', 'number')
  const rule = (op: Parameters<typeof evaluateRule>[0]['operator'], val: number) =>
    ({ id: 'r', columnId: 'c3', operator: op, value: val })
  it('gt / lt / gte / lte', () => {
    expect(evaluateRule(rule('gt', 10), col, 15)).toBe(true)
    expect(evaluateRule(rule('gt', 15), col, 15)).toBe(false)
    expect(evaluateRule(rule('lt', 20), col, 15)).toBe(true)
    expect(evaluateRule(rule('gte', 15), col, 15)).toBe(true)
    expect(evaluateRule(rule('lte', 15), col, 15)).toBe(true)
    expect(evaluateRule(rule('lte', 14), col, 15)).toBe(false)
  })
  it('is / is-not', () => {
    expect(evaluateRule(rule('is', 42), col, 42)).toBe(true)
    expect(evaluateRule(rule('is-not', 42), col, 43)).toBe(true)
  })
  it('returns false when cell or target is not a number', () => {
    expect(evaluateRule(rule('gt', 10), col, null)).toBe(false)
    expect(evaluateRule(rule('gt', 10), col, undefined)).toBe(false)
  })
})

// ── applyFilters ─────────────────────────────────────────────────────────────

describe('applyFilters', () => {
  const textCol = makeCol('name', 'text-short')
  const numCol = makeCol('score', 'number')
  const chkCol = makeCol('done', 'checkbox')
  const schema = makeSchema([textCol, numCol, chkCol])

  const rows = [
    makeRow('r1', { name: 'Alice', score: 90, done: true }),
    makeRow('r2', { name: 'Bob', score: 50, done: false }),
    makeRow('r3', { name: 'Alice Smith', score: 80, done: false }),
    makeRow('r4', { name: 'Carol', score: 70, done: true })
  ]

  it('returns all rows when filter is undefined', () => {
    expect(applyFilters(rows, schema, undefined)).toHaveLength(4)
  })
  it('returns all rows when rules is empty', () => {
    expect(applyFilters(rows, schema, { conjunction: 'and', rules: [] })).toHaveLength(4)
  })

  it('text contains narrows correctly', () => {
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'name', operator: 'contains', value: 'Alice' }]
    })
    expect(result.map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  it('checkbox is-checked narrows correctly', () => {
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'done', operator: 'is-checked' }]
    })
    expect(result.map((r) => r.id)).toEqual(['r1', 'r4'])
  })

  it('checkbox is-unchecked narrows correctly', () => {
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'done', operator: 'is-unchecked' }]
    })
    expect(result.map((r) => r.id)).toEqual(['r2', 'r3'])
  })

  it('number greater-than narrows correctly', () => {
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'score', operator: 'gt', value: 75 }]
    })
    expect(result.map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  it('and conjunction: both rules must match', () => {
    // name contains Alice AND done is-checked
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [
        { id: 'f1', columnId: 'name', operator: 'contains', value: 'Alice' },
        { id: 'f2', columnId: 'done', operator: 'is-checked' }
      ]
    })
    // Only Alice (r1) is checked; Alice Smith (r3) is not.
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('or conjunction: either rule must match', () => {
    // name contains Alice OR score > 85
    const result = applyFilters(rows, schema, {
      conjunction: 'or',
      rules: [
        { id: 'f1', columnId: 'name', operator: 'contains', value: 'Alice' },
        { id: 'f2', columnId: 'score', operator: 'gt', value: 85 }
      ]
    })
    // r1 (Alice, 90), r3 (Alice Smith, 80) — both match via Alice; r1 also matches score.
    expect(result.map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  it('filters out all rows when no row matches', () => {
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'name', operator: 'is', value: 'Nobody' }]
    })
    expect(result).toHaveLength(0)
  })

  it('skips rules whose column no longer exists', () => {
    const result = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'deleted-col', operator: 'contains', value: 'x' }]
    })
    // deleted-col is not in schema → rule skipped → all rows pass.
    expect(result).toHaveLength(4)
  })
})

// ── groupRows — checkbox ─────────────────────────────────────────────────────

describe('groupRows — checkbox', () => {
  const col = makeCol('done', 'checkbox')
  const rows = [
    makeRow('r1', { done: true }),
    makeRow('r2', { done: false }),
    makeRow('r3', { done: true }),
    makeRow('r4', { done: null })
  ]

  it('splits into Checked / Unchecked groups', () => {
    const groups = groupRows(rows, col)
    // Checked comes first (true > false in checkbox sort), then Unchecked/null.
    const keys = groups.map((g) => g.key)
    expect(keys).toContain('true')
    expect(keys).toContain('false')
  })

  it('Checked group contains the right rows', () => {
    const groups = groupRows(rows, col)
    const checked = groups.find((g) => g.key === 'true')
    expect(checked?.rows.map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  it('empty (null) values land in the Empty group, sorted last', () => {
    const groups = groupRows(rows, col)
    const last = groups[groups.length - 1]
    expect(last.key).toBe('∅')
    expect(last.rows.map((r) => r.id)).toEqual(['r4'])
  })
})

// ── groupRows — single-select ────────────────────────────────────────────────

describe('groupRows — single-select', () => {
  const options = [
    { id: 'opt-a', label: 'Alpha', color: '#ff0000' },
    { id: 'opt-b', label: 'Beta', color: '#00ff00' },
    { id: 'opt-c', label: 'Gamma', color: '#0000ff' }
  ]
  const col: FieldDefinition = {
    id: 'status',
    type: 'single-select',
    label: 'Status',
    config: { options } as never
  }
  const rows = [
    makeRow('r1', { status: 'opt-b' }),
    makeRow('r2', { status: 'opt-a' }),
    makeRow('r3', { status: 'opt-c' }),
    makeRow('r4', { status: null }),
    makeRow('r5', { status: 'opt-a' })
  ]

  it('groups follow option definition order (Alpha before Beta before Gamma)', () => {
    const groups = groupRows(rows, col)
    const labels = groups.filter((g) => g.key !== '∅').map((g) => g.label)
    expect(labels).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('desc direction reverses non-empty groups, empty still last', () => {
    const groups = groupRows(rows, col, 'desc')
    const labels = groups.map((g) => g.label)
    expect(labels[0]).toBe('Gamma')
    expect(labels[1]).toBe('Beta')
    expect(labels[2]).toBe('Alpha')
    expect(labels[labels.length - 1]).toBe('Empty')
  })

  it('each group contains the correct rows', () => {
    const groups = groupRows(rows, col)
    const alpha = groups.find((g) => g.key === 'opt-a')
    expect(alpha?.rows.map((r) => r.id)).toEqual(['r2', 'r5'])
  })

  it('group picks up the option color', () => {
    const groups = groupRows(rows, col)
    const alpha = groups.find((g) => g.key === 'opt-a')
    expect(alpha?.color).toBe('#ff0000')
  })

  it('null values land in the Empty group last', () => {
    const groups = groupRows(rows, col)
    const last = groups[groups.length - 1]
    expect(last.key).toBe('∅')
    expect(last.rows.map((r) => r.id)).toEqual(['r4'])
  })
})

// ── filter + group composition ───────────────────────────────────────────────

describe('filter + group composition', () => {
  const textCol = makeCol('name', 'text-short')
  const chkCol = makeCol('done', 'checkbox')
  const schema = makeSchema([textCol, chkCol])

  const rows = [
    makeRow('r1', { name: 'Alice', done: true }),
    makeRow('r2', { name: 'Bob', done: false }),
    makeRow('r3', { name: 'Alice Smith', done: false }),
    makeRow('r4', { name: 'Carol', done: true })
  ]

  it('grouping operates on the filtered set', () => {
    // Filter to only "Alice" rows, then group by done.
    const filtered = applyFilters(rows, schema, {
      conjunction: 'and',
      rules: [{ id: 'f1', columnId: 'name', operator: 'contains', value: 'Alice' }]
    })
    // filtered = r1, r3
    const groups = groupRows(filtered, chkCol)
    const allGroupedIds = groups.flatMap((g) => g.rows.map((r) => r.id))
    // Only Alice rows, none from Bob or Carol.
    expect(allGroupedIds).not.toContain('r2')
    expect(allGroupedIds).not.toContain('r4')
    expect(allGroupedIds).toContain('r1')
    expect(allGroupedIds).toContain('r3')
  })
})
