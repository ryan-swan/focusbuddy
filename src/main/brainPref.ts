// Per-org plexi-brain preferences (P0, DEC-012 constraint 1 + the rollout ladder).
//
// The brain is a TOGGLEABLE LAYER: each org (personal, each PlexiOffice business)
// enables it independently, and climbs a rollout stage (0 dev → 1 dogfood →
// 2 beta → 3 GA). NO base-app feature may depend on the brain — OFF means every
// caller falls back to today's v3.8.0 behavior. This module is the single home for
// that flag + stage + the embed-backend choice (DEC-015).
//
// Storage mirrors workspacePref.ts exactly: a tiny JSON blob under userData, keyed
// by org so businesses opt in independently. Empty/missing file = brain OFF for
// every org (the safe default — a fresh install is a normal v3.8.0 app until the
// user turns the brain on).

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getActiveOrgId } from './db/activeOrg'

export type RolloutStage = 0 | 1 | 2 | 3
export type EmbedBackendPref = 'local' | 'openai'

interface OrgBrainPref {
  enabled: boolean
  stage: RolloutStage
  // Which embedding backend this org uses (DEC-015). Default 'local' — free,
  // offline, and (measured) faster than cloud. 'openai' opts into the cloud path.
  embedBackend: EmbedBackendPref
}

interface PrefFile {
  orgs: Record<string, OrgBrainPref>
  v: 1
}

const DEFAULT_ORG_PREF: OrgBrainPref = { enabled: false, stage: 0, embedBackend: 'local' }

let cache: PrefFile | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'brain.json')
}

function load(): PrefFile {
  if (cache) return cache
  try {
    if (!existsSync(filePath())) {
      cache = { orgs: {}, v: 1 }
      return cache
    }
    const parsed = JSON.parse(readFileSync(filePath(), 'utf-8')) as Partial<PrefFile>
    cache = { orgs: parsed.orgs && typeof parsed.orgs === 'object' ? parsed.orgs : {}, v: 1 }
    return cache
  } catch {
    cache = { orgs: {}, v: 1 }
    return cache
  }
}

function save(): void {
  if (!cache) return
  try {
    writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[brainPref] save failed:', err)
  }
}

function orgPref(orgId: string): OrgBrainPref {
  const f = load()
  const p = f.orgs[orgId]
  if (!p) return { ...DEFAULT_ORG_PREF }
  return {
    enabled: p.enabled === true,
    stage: ([0, 1, 2, 3].includes(p.stage as number) ? p.stage : 0) as RolloutStage,
    embedBackend: p.embedBackend === 'openai' ? 'openai' : 'local'
  }
}

// ── Public API (all resolve for the ACTIVE org unless an orgId is passed) ─────

/** The one gate every brain code-path checks first. OFF ⇒ caller uses today's
 *  behavior. Default OFF, so nothing changes until the user turns it on. */
export function isBrainEnabled(orgId: string = getActiveOrgId()): boolean {
  return orgPref(orgId).enabled
}

/** The org's rollout stage (0 dev → 3 GA). Informational in P0; the gate for
 *  gradual rollout in later phases. */
export function getBrainStage(orgId: string = getActiveOrgId()): RolloutStage {
  return orgPref(orgId).stage
}

/** Which embedding backend the active org uses (DEC-015). Default 'local'. */
export function getBrainEmbedBackend(orgId: string = getActiveOrgId()): EmbedBackendPref {
  return orgPref(orgId).embedBackend
}

/** Enable/disable the brain for an org. */
export function setBrainEnabled(enabled: boolean, orgId: string = getActiveOrgId()): void {
  const f = load()
  f.orgs[orgId] = { ...orgPref(orgId), enabled }
  save()
}

/** Set the org's rollout stage. */
export function setBrainStage(stage: RolloutStage, orgId: string = getActiveOrgId()): void {
  const f = load()
  f.orgs[orgId] = { ...orgPref(orgId), stage }
  save()
}

/** Set the embedding backend for an org. */
export function setBrainEmbedBackend(embedBackend: EmbedBackendPref, orgId: string = getActiveOrgId()): void {
  const f = load()
  f.orgs[orgId] = { ...orgPref(orgId), embedBackend }
  save()
}

/** Full snapshot for the active org (settings UI / diagnostics). */
export function getBrainPref(orgId: string = getActiveOrgId()): OrgBrainPref {
  return orgPref(orgId)
}
