// Per-site standing grants for agentic browsing (A6, R26): the first time a
// run wants to ACT on a site, the human confirms once; the grant persists,
// is listable, and is revocable — the reviewable middle between "confirm
// everything" and the zero-friction end state. Sites are keyed by hostname
// (scheme/port/path never widen or split a grant). Reading a page never
// needs a grant; acting does — the loop asks before its first mutating
// action per host.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface ConsentGrant {
  host: string
  grantedAt: string // ISO
}

interface ConsentShape {
  v: 1
  grants: Record<string, { grantedAt: string }>
}

const EMPTY: ConsentShape = { v: 1, grants: {} }

let cache: ConsentShape | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'browser-consent.json')
}

function load(): ConsentShape {
  if (cache) return cache
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as ConsentShape
      if (raw && raw.v === 1 && raw.grants && typeof raw.grants === 'object') {
        cache = { v: 1, grants: raw.grants }
        return cache
      }
    }
  } catch {
    /* unreadable file → start clean; grants only ever widen by explicit consent */
  }
  cache = { ...EMPTY, grants: {} }
  return cache
}

function save(shape: ConsentShape): void {
  cache = shape
  try {
    writeFileSync(filePath(), JSON.stringify(shape, null, 2))
  } catch {
    /* disk trouble — the in-memory grant still holds for this session */
  }
}

// One canonical key per site: lowercase hostname, no port, no www prefix —
// "www.Foo.com:8080/path" and "foo.com" are the same consent decision.
export function consentHostOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return h || null
  } catch {
    return null
  }
}

export function hasConsent(host: string): boolean {
  return Boolean(load().grants[host])
}

export function grantConsent(host: string): void {
  const s = load()
  save({ ...s, grants: { ...s.grants, [host]: { grantedAt: new Date().toISOString() } } })
}

export function revokeConsent(host: string): void {
  const s = load()
  if (!s.grants[host]) return
  const grants = { ...s.grants }
  delete grants[host]
  save({ ...s, grants })
}

export function listConsent(): ConsentGrant[] {
  const s = load()
  return Object.entries(s.grants)
    .map(([host, g]) => ({ host, grantedAt: g.grantedAt }))
    .sort((a, b) => a.host.localeCompare(b.host))
}

// Test seam: forget the cache so a spec can point app.getPath at a fresh dir.
export function _resetConsentCache(): void {
  cache = null
}
