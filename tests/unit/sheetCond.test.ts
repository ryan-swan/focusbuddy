import { describe, it, expect } from 'vitest'
import {
  colFromLetters,
  parseA1Range,
  rangeHas,
  matchCond,
  applyCondFormat,
  validationForCell,
  valueIsValid
} from '../../src/renderer/src/lib/sheetCond'
import type { SheetCondRule, SheetValidation } from '../../src/shared/types'

const rule = (p: Partial<SheetCondRule>): SheetCondRule => ({
  id: 'r',
  range: 'A1:Z100',
  op: 'gt',
  ...p
})

describe('sheetCond — A1 parsing', () => {
  it('colFromLetters', () => {
    expect(colFromLetters('A')).toBe(0)
    expect(colFromLetters('Z')).toBe(25)
    expect(colFromLetters('AA')).toBe(26)
    expect(colFromLetters('AB')).toBe(27)
    expect(colFromLetters('')).toBe(-1)
    expect(colFromLetters('1')).toBe(-1)
  })
  it('parseA1Range normalises corners', () => {
    expect(parseA1Range('B2')).toEqual({ r1: 1, c1: 1, r2: 1, c2: 1 })
    expect(parseA1Range('B2:D10')).toEqual({ r1: 1, c1: 1, r2: 9, c2: 3 })
    expect(parseA1Range('D10:B2')).toEqual({ r1: 1, c1: 1, r2: 9, c2: 3 })
    expect(parseA1Range('$A$1:$B$2')).toEqual({ r1: 0, c1: 0, r2: 1, c2: 1 })
    expect(parseA1Range('nonsense')).toBeNull()
  })
  it('rangeHas', () => {
    expect(rangeHas('B2:D4', 2, 2)).toBe(true)
    expect(rangeHas('B2:D4', 0, 0)).toBe(false)
    expect(rangeHas('B2:D4', 3, 3)).toBe(true)
    expect(rangeHas('B2:D4', 4, 3)).toBe(false)
  })
})

describe('sheetCond — matchCond', () => {
  it('numeric comparisons', () => {
    expect(matchCond('10', rule({ op: 'gt', value: '5' }))).toBe(true)
    expect(matchCond('3', rule({ op: 'gt', value: '5' }))).toBe(false)
    expect(matchCond('5', rule({ op: 'ge', value: '5' }))).toBe(true)
    expect(matchCond('5', rule({ op: 'le', value: '5' }))).toBe(true)
    expect(matchCond('4', rule({ op: 'lt', value: '5' }))).toBe(true)
  })
  it('currency/percent operands parse', () => {
    expect(matchCond('$1,200', rule({ op: 'gt', value: '1000' }))).toBe(true)
    expect(matchCond('50%', rule({ op: 'lt', value: '60' }))).toBe(true)
  })
  it('between is inclusive and order-agnostic', () => {
    expect(matchCond('5', rule({ op: 'between', value: '1', value2: '10' }))).toBe(true)
    expect(matchCond('5', rule({ op: 'between', value: '10', value2: '1' }))).toBe(true)
    expect(matchCond('11', rule({ op: 'between', value: '1', value2: '10' }))).toBe(false)
  })
  it('eq/ne handle numeric and text', () => {
    expect(matchCond('5.0', rule({ op: 'eq', value: '5' }))).toBe(true)
    expect(matchCond('hello', rule({ op: 'eq', value: 'hello' }))).toBe(true)
    expect(matchCond('hello', rule({ op: 'ne', value: 'world' }))).toBe(true)
  })
  it('contains is case-insensitive; empty/notEmpty', () => {
    expect(matchCond('Hello World', rule({ op: 'contains', value: 'world' }))).toBe(true)
    expect(matchCond('', rule({ op: 'empty' }))).toBe(true)
    expect(matchCond('x', rule({ op: 'notEmpty' }))).toBe(true)
    expect(matchCond('   ', rule({ op: 'empty' }))).toBe(true)
  })
  it('non-numeric value never matches a numeric op', () => {
    expect(matchCond('abc', rule({ op: 'gt', value: '5' }))).toBe(false)
  })
})

describe('sheetCond — applyCondFormat', () => {
  it('overlays a matching rule and leaves non-matching cells alone', () => {
    const rules = [rule({ id: '1', range: 'A1:A10', op: 'gt', value: '100', bg: '#f00', bold: true })]
    const hit = applyCondFormat(undefined, rules, 0, 0, '150')
    expect(hit?.bg).toBe('#f00')
    expect(hit?.bold).toBe(true)
    const miss = applyCondFormat(undefined, rules, 0, 0, '50')
    expect(miss).toBeUndefined()
  })
  it('later matching rule overrides earlier for the same property', () => {
    const rules = [
      rule({ id: '1', range: 'A1:A10', op: 'gt', value: '0', bg: '#aaa' }),
      rule({ id: '2', range: 'A1:A10', op: 'gt', value: '100', bg: '#bbb' })
    ]
    expect(applyCondFormat(undefined, rules, 0, 0, '150')?.bg).toBe('#bbb')
    expect(applyCondFormat(undefined, rules, 0, 0, '50')?.bg).toBe('#aaa')
  })
  it('preserves the base format when no rule applies', () => {
    const base = { bold: true }
    expect(applyCondFormat(base, undefined, 0, 0, 'x')).toBe(base)
  })
  it('out-of-range cells are untouched', () => {
    const rules = [rule({ id: '1', range: 'A1:A10', op: 'notEmpty', bg: '#f00' })]
    expect(applyCondFormat(undefined, rules, 0, 5, 'x')).toBeUndefined()
  })
})

describe('sheetCond — validation', () => {
  const vList: SheetValidation = { id: 'v1', range: 'B1:B10', rule: { kind: 'list', values: ['Open', 'Done'] } }
  const vNum: SheetValidation = { id: 'v2', range: 'C1:C10', rule: { kind: 'number', op: 'between', value: 1, value2: 5 } }

  it('validationForCell finds the covering rule', () => {
    expect(validationForCell([vList, vNum], 0, 1)?.id).toBe('v1')
    expect(validationForCell([vList, vNum], 0, 2)?.id).toBe('v2')
    expect(validationForCell([vList, vNum], 0, 0)).toBeUndefined()
  })
  it('list validation', () => {
    expect(valueIsValid('Open', vList.rule)).toBe(true)
    expect(valueIsValid('Nope', vList.rule)).toBe(false)
    expect(valueIsValid('', vList.rule)).toBe(true) // empty allowed
  })
  it('number validation', () => {
    expect(valueIsValid('3', vNum.rule)).toBe(true)
    expect(valueIsValid('9', vNum.rule)).toBe(false)
    expect(valueIsValid('abc', vNum.rule)).toBe(false)
  })
})
