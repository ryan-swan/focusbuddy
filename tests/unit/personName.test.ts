// Unit tests for personDisplayName / personFirstName / personInitials
// (src/renderer/src/lib/personName.ts) -- the single source of truth for how
// a person is SHOWN across chat, mentions, presence, People Map,
// collaborators and meetings. Covers the full fallback chain (full name ->
// pre-composed name -> handle -> email local-part -> neutral fallback) and
// the no-fakery guarantee that a nameless account never renders blank.

import { describe, it, expect } from 'vitest'
import { personDisplayName, personFirstName, personInitials } from '@renderer/lib/personName'

describe('personDisplayName', () => {
  it('prefers first + last name when both are present', () => {
    expect(personDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace')
  })

  it('uses first name alone when last name is absent', () => {
    expect(personDisplayName({ firstName: 'Ada', lastName: null })).toBe('Ada')
  })

  it('uses last name alone when first name is absent', () => {
    expect(personDisplayName({ firstName: null, lastName: 'Lovelace' })).toBe('Lovelace')
  })

  it('trims whitespace-only name parts and falls through', () => {
    expect(personDisplayName({ firstName: '  ', lastName: '  ', handle: 'ada99' })).toBe('ada99')
  })

  it('falls back to a pre-composed name when firstName/lastName are absent', () => {
    expect(personDisplayName({ name: 'Ada Lovelace' })).toBe('Ada Lovelace')
  })

  it('falls back to the handle when there is no name at all', () => {
    expect(personDisplayName({ handle: 'ada_legacy' })).toBe('ada_legacy')
  })

  it('falls back to the email local-part when there is no name or handle', () => {
    expect(personDisplayName({ email: 'ada@example.com' })).toBe('ada')
  })

  it('falls back to the neutral default when nothing at all is present (no blank, no fakery)', () => {
    expect(personDisplayName(null)).toBe('Someone')
    expect(personDisplayName(undefined)).toBe('Someone')
    expect(personDisplayName({})).toBe('Someone')
  })

  it('honours a custom fallback string', () => {
    expect(personDisplayName({}, 'Unknown teammate')).toBe('Unknown teammate')
  })

  it('never returns an empty string for a legacy handle-only account', () => {
    const result = personDisplayName({ firstName: null, lastName: null, handle: 'legacy_user', email: null })
    expect(result).toBe('legacy_user')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('personFirstName', () => {
  it('returns the real first name when present', () => {
    expect(personFirstName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada')
  })

  it('falls back through the display-name chain and takes the first word', () => {
    expect(personFirstName({ handle: 'ada_legacy' })).toBe('ada_legacy')
    expect(personFirstName({ name: 'Grace Hopper' })).toBe('Grace')
  })

  it('falls back to the neutral greeting default when nothing is present', () => {
    expect(personFirstName({})).toBe('there')
    expect(personFirstName(null)).toBe('there')
  })
})

describe('personInitials', () => {
  it('uses first+last initials when both name parts are present', () => {
    expect(personInitials({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('AL')
  })

  it('uses a single initial when only one name part is present', () => {
    expect(personInitials({ firstName: 'Ada', lastName: null })).toBe('A')
    expect(personInitials({ firstName: null, lastName: 'Lovelace' })).toBe('L')
  })

  it('falls back to two-word initials from a pre-composed name', () => {
    expect(personInitials({ name: 'Grace Hopper' })).toBe('GH')
  })

  it('falls back to the first two characters of a single-word display name', () => {
    expect(personInitials({ handle: 'legacy' })).toBe('LE')
  })

  it('falls back to "?" when there is nothing to initial', () => {
    expect(personInitials({})).toBe('?')
    expect(personInitials(null)).toBe('?')
  })
})
