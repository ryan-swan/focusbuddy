// Unit tests for coerceFieldValue in src/shared/fields.ts
// Covers the conversions described in the diff: text<->number<->date carry-over,
// checkbox, and the "start clean" cases for selects / relation / attachment / button.

import { describe, test, expect } from 'vitest'
import {
  coerceFieldValue,
  defaultValue
} from '../../src/shared/fields'

describe('coerceFieldValue — identity', () => {
  test('same type returns same value (string)', () => {
    expect(coerceFieldValue('text-short', 'text-short', 'hello')).toBe('hello')
  })
  test('same type returns same value (number)', () => {
    expect(coerceFieldValue('number', 'number', 42)).toBe(42)
  })
  test('same type returns same value (checkbox)', () => {
    expect(coerceFieldValue('checkbox', 'checkbox', true)).toBe(true)
  })
})

describe('coerceFieldValue — null/undefined resets to default', () => {
  test('null from number → text-short gives empty string', () => {
    const result = coerceFieldValue('number', 'text-short', null)
    expect(result).toBe(defaultValue('text-short'))
    expect(result).toBe('')
  })
  test('undefined from text-short → number gives null', () => {
    expect(coerceFieldValue('text-short', 'number', undefined)).toBe(null)
  })
})

describe('coerceFieldValue — text-short ↔ text-long', () => {
  test('text-short → text-long keeps string', () => {
    expect(coerceFieldValue('text-short', 'text-long', 'hello')).toBe('hello')
  })
  test('text-long → text-short keeps string', () => {
    expect(coerceFieldValue('text-long', 'text-short', 'world')).toBe('world')
  })
})

describe('coerceFieldValue — number ↔ text', () => {
  test('number → text-short stringifies', () => {
    expect(coerceFieldValue('number', 'text-short', 42)).toBe('42')
  })
  test('number → text-long stringifies', () => {
    expect(coerceFieldValue('number', 'text-long', 3.14)).toBe('3.14')
  })
  test('text-short "42" → number parses to 42', () => {
    expect(coerceFieldValue('text-short', 'number', '42')).toBe(42)
  })
  test('text-short "3.14" → number parses to 3.14', () => {
    expect(coerceFieldValue('text-short', 'number', '3.14')).toBe(3.14)
  })
  test('text-short "hello" → number gives null', () => {
    expect(coerceFieldValue('text-short', 'number', 'hello')).toBe(null)
  })
  test('text-short "" → number gives null', () => {
    expect(coerceFieldValue('text-short', 'number', '')).toBe(null)
  })
})

describe('coerceFieldValue — date ↔ number', () => {
  const ts = 1700000000000
  test('date → number returns the timestamp unchanged', () => {
    expect(coerceFieldValue('date', 'number', ts)).toBe(ts)
  })
  test('number → date passes through as a timestamp', () => {
    expect(coerceFieldValue('number', 'date', ts)).toBe(ts)
  })
  test('date → text-short gives an ISO date string', () => {
    const val = coerceFieldValue('date', 'text-short', ts)
    expect(typeof val).toBe('string')
    expect((val as string).startsWith('2023')).toBe(true)
  })
  test('text-short parseable date → date gives a finite number', () => {
    const val = coerceFieldValue('text-short', 'date', '2024-01-15')
    expect(typeof val).toBe('number')
    expect(Number.isFinite(val as number)).toBe(true)
  })
  test('text-short non-date string → date gives null', () => {
    expect(coerceFieldValue('text-short', 'date', 'not-a-date')).toBe(null)
  })
})

describe('coerceFieldValue — checkbox conversions', () => {
  test('number 1 → checkbox is true', () => {
    expect(coerceFieldValue('number', 'checkbox', 1)).toBe(true)
  })
  test('number 0 → checkbox is false', () => {
    expect(coerceFieldValue('number', 'checkbox', 0)).toBe(false)
  })
  test('text-short "hi" → checkbox is true (non-empty)', () => {
    expect(coerceFieldValue('text-short', 'checkbox', 'hi')).toBe(true)
  })
  test('text-short "" → checkbox is false (empty)', () => {
    expect(coerceFieldValue('text-short', 'checkbox', '')).toBe(false)
  })
  test('text-short whitespace only → checkbox is false', () => {
    expect(coerceFieldValue('text-short', 'checkbox', '   ')).toBe(false)
  })
  test('checkbox true → text-short gives "true"', () => {
    expect(coerceFieldValue('checkbox', 'text-short', true)).toBe('true')
  })
  test('checkbox false → text-short gives ""', () => {
    expect(coerceFieldValue('checkbox', 'text-short', false)).toBe('')
  })
})

describe('coerceFieldValue — start-clean types (no carry-over)', () => {
  test('text-short → single-select resets to null', () => {
    expect(coerceFieldValue('text-short', 'single-select', 'some-option-id')).toBe(null)
  })
  test('text-short → multi-select resets to []', () => {
    expect(coerceFieldValue('text-short', 'multi-select', 'abc')).toEqual([])
  })
  test('number → attachment resets to []', () => {
    expect(coerceFieldValue('number', 'attachment', 42)).toEqual([])
  })
  test('text-short → relation resets to []', () => {
    expect(coerceFieldValue('text-short', 'relation', 'row-id-xyz')).toEqual([])
  })
  test('text-short → text-rich resets to default (empty string)', () => {
    const result = coerceFieldValue('text-short', 'text-rich', 'hello')
    expect(result).toBe(defaultValue('text-rich'))
  })
  test('number → single-select resets to null', () => {
    expect(coerceFieldValue('number', 'single-select', 42)).toBe(null)
  })
})
