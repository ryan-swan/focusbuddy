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

interface PrefShape {
  enabled: boolean
  v: 1
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
    cache = { enabled: parsed.enabled === true, v: 1 }
    return cache
  } catch {
    cache = { enabled: false, v: 1 }
    return cache
  }
}

export function isWorkItemsEnabled(): boolean {
  return load().enabled
}

export function setWorkItemsEnabled(enabled: boolean): void {
  cache = { enabled, v: 1 }
  try {
    writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[workItemsPref] save failed:', err)
  }
}
