import { describe, it, expect } from 'vitest'
import {
  isEnabledValue,
  isCapabilityEnabled,
  limitForValue,
  limitFor,
  canCreateMore,
  canCreateWidget,
  capabilityForWidgetKind,
  limitLabel,
  defaultsForTier,
  type CapabilityMap
} from '@renderer/lib/gating'

// These tests are the contract: "the capability matrix governs access."
// If an admin flips a tick-box or changes a numeric limit, the resolved map
// the server returns changes, and these functions must change their verdict.

describe('isEnabledValue', () => {
  it('booleans pass through', () => {
    expect(isEnabledValue(true)).toBe(true)
    expect(isEnabledValue(false)).toBe(false)
  })
  it('numbers: >0 is on, 0 is off', () => {
    expect(isEnabledValue(3)).toBe(true)
    expect(isEnabledValue(0)).toBe(false)
  })
  it('strings: non-empty/not "off" is on', () => {
    expect(isEnabledValue('Unlimited')).toBe(true)
    expect(isEnabledValue('$5/mo')).toBe(true)
    expect(isEnabledValue('off')).toBe(false)
    expect(isEnabledValue('')).toBe(false)
  })
  it('undefined is off', () => {
    expect(isEnabledValue(undefined)).toBe(false)
  })
})

describe('isCapabilityEnabled — boolean gates from the matrix', () => {
  it('free user cannot use a Pro-only capability by default', () => {
    const free = defaultsForTier('free')
    expect(isCapabilityEnabled(free, 'widget_table')).toBe(false) // free:false
    expect(isCapabilityEnabled(free, 'body_double')).toBe(false)
    expect(isCapabilityEnabled(free, 'drift_detection')).toBe(false)
  })
  it('pro user can use Pro capabilities', () => {
    const pro = defaultsForTier('pro')
    expect(isCapabilityEnabled(pro, 'widget_table')).toBe(true)
    expect(isCapabilityEnabled(pro, 'body_double')).toBe(true)
  })
  it('an ADMIN OVERRIDE that enables a cap for free flips the verdict', () => {
    // Simulates the server having merged an admin override: free user, but
    // widget_table turned on for them in the matrix.
    const freeWithOverride: CapabilityMap = { ...defaultsForTier('free'), widget_table: true }
    expect(isCapabilityEnabled(freeWithOverride, 'widget_table')).toBe(true)
  })
  it('an ADMIN OVERRIDE that disables a cap for pro flips the verdict', () => {
    const proWithOverride: CapabilityMap = { ...defaultsForTier('pro'), body_double: false }
    expect(isCapabilityEnabled(proWithOverride, 'body_double')).toBe(false)
  })
})

describe('limitForValue — numeric limits', () => {
  it('a number is the literal limit', () => {
    expect(limitForValue(3)).toBe(3)
    expect(limitForValue(1)).toBe(1)
  })
  it('"Unlimited" (and other non-numeric truthy strings) → null = unlimited', () => {
    expect(limitForValue('Unlimited')).toBeNull()
  })
  it('numeric strings parse', () => {
    expect(limitForValue('5')).toBe(5)
  })
  it('false / "off" → 0 (feature off)', () => {
    expect(limitForValue(false)).toBe(0)
    expect(limitForValue('off')).toBe(0)
  })
  it('boolean true → null = unlimited', () => {
    expect(limitForValue(true)).toBeNull()
  })
})

describe('canCreateMore — desk limit (multiple_desks)', () => {
  const free = defaultsForTier('free') // multiple_desks: 3
  const pro = defaultsForTier('pro') // multiple_desks: 'Unlimited'

  it('free user: allowed up to the limit, blocked at it', () => {
    expect(limitFor(free, 'multiple_desks')).toBe(3)
    expect(canCreateMore(free, 'multiple_desks', 0)).toBe(true)
    expect(canCreateMore(free, 'multiple_desks', 2)).toBe(true) // creating the 3rd
    expect(canCreateMore(free, 'multiple_desks', 3)).toBe(false) // would be the 4th
    expect(canCreateMore(free, 'multiple_desks', 5)).toBe(false)
  })
  it('pro user: unlimited', () => {
    expect(limitFor(pro, 'multiple_desks')).toBeNull()
    expect(canCreateMore(pro, 'multiple_desks', 999)).toBe(true)
  })
  it('admin override raising a free user to 5 desks is respected', () => {
    const freeBumped: CapabilityMap = { ...free, multiple_desks: 5 }
    expect(canCreateMore(freeBumped, 'multiple_desks', 3)).toBe(true)
    expect(canCreateMore(freeBumped, 'multiple_desks', 5)).toBe(false)
  })
})

describe('canCreateWidget — palette gating', () => {
  const free = defaultsForTier('free')
  const pro = defaultsForTier('pro')

  it('maps known kinds to capability keys', () => {
    expect(capabilityForWidgetKind('table')).toBe('widget_table')
    expect(capabilityForWidgetKind('note')).toBe('widget_notes')
    expect(capabilityForWidgetKind('totally-unknown')).toBeNull()
  })
  it('free user blocked from the Table widget, allowed ungated widgets', () => {
    expect(canCreateWidget(free, 'table')).toBe(false) // widget_table free:false
    expect(canCreateWidget(free, 'note')).toBe(true) // widget_notes free:true
    expect(canCreateWidget(free, 'image')).toBe(true) // ungated kind
  })
  it('pro user can create the Table widget', () => {
    expect(canCreateWidget(pro, 'table')).toBe(true)
  })
  it('admin override enabling widget_table for a free user unlocks the palette tile', () => {
    const freeOverride: CapabilityMap = { ...free, widget_table: true }
    expect(canCreateWidget(freeOverride, 'table')).toBe(true)
  })
})

describe('limitLabel', () => {
  it('renders numeric + unlimited', () => {
    expect(limitLabel(defaultsForTier('free'), 'multiple_desks')).toBe('3')
    expect(limitLabel(defaultsForTier('pro'), 'multiple_desks')).toBe('Unlimited')
  })
})
