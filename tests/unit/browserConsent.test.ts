import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// R26's standing-grant store (A6/B2): one canonical key per site, grants
// persist to disk, and revocation genuinely removes them. app.getPath is
// pointed at a fresh temp dir per test so the file round-trip is real.

let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

import {
  consentHostOf,
  hasConsent,
  grantConsent,
  revokeConsent,
  listConsent,
  _resetConsentCache
} from '../../src/main/browserConsent'

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'consent-test-'))
  _resetConsentCache()
})

describe('consentHostOf — one key per site', () => {
  test('lowercases, strips www and ignores port/path/query', () => {
    expect(consentHostOf('https://WWW.Example.COM:8443/checkout?x=1')).toBe('example.com')
    expect(consentHostOf('http://example.com')).toBe('example.com')
  })
  test('bare IPs and localhost keep their identity', () => {
    expect(consentHostOf('http://127.0.0.1:5000/page')).toBe('127.0.0.1')
  })
  test('garbage is null, never a guessed host', () => {
    expect(consentHostOf('not a url')).toBeNull()
    expect(consentHostOf('')).toBeNull()
  })
})

describe('the grant store', () => {
  test('grant → has → list → revoke round-trips', () => {
    expect(hasConsent('example.com')).toBe(false)
    grantConsent('example.com')
    expect(hasConsent('example.com')).toBe(true)
    expect(listConsent().map((g) => g.host)).toEqual(['example.com'])
    revokeConsent('example.com')
    expect(hasConsent('example.com')).toBe(false)
    expect(listConsent()).toEqual([])
  })
  test('grants persist to disk across a cache reset (a real file round-trip)', () => {
    grantConsent('example.com')
    grantConsent('another.test')
    _resetConsentCache()
    expect(hasConsent('example.com')).toBe(true)
    expect(listConsent().map((g) => g.host)).toEqual(['another.test', 'example.com'])
  })
  test('revoking a host that was never granted is a quiet no-op', () => {
    revokeConsent('never.granted')
    expect(listConsent()).toEqual([])
  })
})
