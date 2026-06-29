// The organization Brand Kit store (local-first). One brand row the whole
// workspace reads, so every surface presents on-brand. Missing or corrupt rows
// resolve to the default brand rather than throwing, so a surface always has a
// usable brand to render against.

import { getDb } from './database'
import { DEFAULT_BRAND_KIT, type OrgBrandKit } from '@shared/brandKit'

const ROW_ID = 'default'

export function getBrandKit(): OrgBrandKit {
  const row = getDb().prepare('SELECT kit_json FROM fb_brand_kit WHERE id = ?').get(ROW_ID) as { kit_json?: string } | undefined
  if (!row?.kit_json) return { ...DEFAULT_BRAND_KIT }
  try {
    const parsed = JSON.parse(row.kit_json) as Partial<OrgBrandKit>
    // Merge over the default so a partial kit (e.g. only a primary color set) is
    // always complete enough to render with.
    return { ...DEFAULT_BRAND_KIT, ...parsed }
  } catch {
    return { ...DEFAULT_BRAND_KIT }
  }
}

export function saveBrandKit(kit: OrgBrandKit): OrgBrandKit {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO fb_brand_kit (id, kit_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET kit_json = excluded.kit_json, updated_at = excluded.updated_at`
    )
    .run(ROW_ID, JSON.stringify(kit), now)
  return getBrandKit()
}

// True once a brand has been explicitly saved (so the UI can distinguish "using
// the default brand" from "brand set").
export function hasBrandKit(): boolean {
  const row = getDb().prepare('SELECT 1 FROM fb_brand_kit WHERE id = ?').get(ROW_ID)
  return !!row
}
