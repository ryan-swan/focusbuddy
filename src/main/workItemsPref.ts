// Persisted work-items capability flag (Attention layer, S0).
//
// `workItems.enabled` gates everything the Attention build ships: while OFF
// (the default, and the only shipped state until the S1 migration and S3
// surfaces land) the AI prompt layer never documents "create-work-item",
// no work_item row can be created, and the reserved action kind no-ops with
// an honest message. Flipping it ON is a per-device opt-in that later stages
// additionally guard behind the schema migration check.
//
// Same persistence pattern as voiceProviderPref.ts: a one-line JSON file in
// userData, cached after first read, write-through on set. Not a secret.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface OrgAttestation {
  /** When the operator attested every peer in the org runs the S1 migration. */
  attestedAt: number
  /** Free-text provenance ("presence surface 3/3 migrated", "manual check w/ Caleb"). */
  note: string
}

interface PrefShape {
  enabled: boolean
  v: 1
  /**
   * P1 migrated-peer confirmation (ARCHITECTURE §2.6/§8): the org-scope switch
   * flips per-org ONLY after confirmation that every peer carries the S1
   * migration — the org presence/version surface where available, else this
   * recorded operator attestation. Absent entry = NOT confirmed = work items
   * stay personal (park-local) for that org. Revoking deletes the entry.
   */
  orgAttestations?: Record<string, OrgAttestation>
}

let cache: PrefShape | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'work-items.json')
}

function load(): PrefShape {
  if (cache) return cache
  try {
    if (!existsSync(filePath())) {
      cache = { enabled: false, v: 1 }
      return cache
    }
    const raw = readFileSync(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PrefShape>
    cache = {
      enabled: parsed.enabled === true,
      v: 1,
      // Carry attestations through the round-trip — dropping them here would
      // silently un-confirm every org on restart.
      ...(parsed.orgAttestations && typeof parsed.orgAttestations === 'object'
        ? { orgAttestations: parsed.orgAttestations }
        : {})
    }
    return cache
  } catch {
    cache = { enabled: false, v: 1 }
    return cache
  }
}

export function isWorkItemsEnabled(): boolean {
  return load().enabled
}

// ── P1 migrated-peer confirmation ───────────────────────────────────────────
// Pure record + gate. Nothing consults the gate to widen scope yet: the
// org-carry branch lands with the SPEC-027 architecture pass, and MUST check
// `workItemsOrgEnabled(orgId)` before letting a work item cross into org
// scope. Until then moveNodeToOrg parks work items locally unconditionally.

export function attestOrgMigrated(orgId: string, note: string): void {
  const p = load()
  cache = {
    ...p,
    orgAttestations: {
      ...(p.orgAttestations ?? {}),
      [orgId]: { attestedAt: Date.now(), note: note || 'operator attestation' }
    }
  }
  save()
}

export function revokeOrgAttestation(orgId: string): void {
  const p = load()
  const next = { ...(p.orgAttestations ?? {}) }
  delete next[orgId]
  cache = { ...p, orgAttestations: next }
  save()
}

export function orgMigrationAttested(orgId: string): OrgAttestation | null {
  return load().orgAttestations?.[orgId] ?? null
}

/** The P1 per-org switch: capability ON and this org's peers confirmed migrated. */
export function workItemsOrgEnabled(orgId: string): boolean {
  const p = load()
  return p.enabled && p.orgAttestations?.[orgId] != null
}

function save(): void {
  try {
    writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[workItemsPref] save failed:', err)
  }
}

export function setWorkItemsEnabled(enabled: boolean): void {
  cache = { ...load(), enabled }
  save()
}
