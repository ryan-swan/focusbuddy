// Desk layout persistence (spec §21, PLX-APP-010 / PLX-PRD-002). A Desk persists its
// complete visual layout — object positions, sizes, z-order, scroll, selection and
// zoom — per (user, Desk, device class), and restores it exactly on reopen. Keyed on
// device class so a user's desktop arrangement is never overwritten by their tablet
// (PLX-UX-032).

import type { SqlDb } from './eventStore'
import type { DeskLayout, DeviceClass } from '../../shared/deskLayout'

export function ensureDeskLayoutSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS desk_layouts (
      user_id TEXT NOT NULL,
      desk_id TEXT NOT NULL,
      device_class TEXT NOT NULL,
      layout_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, desk_id, device_class)
    );
  `)
}

export interface DeskLayoutStore {
  save: (layout: DeskLayout, at: string) => void
  load: (userId: string, deskId: string, deviceClass: DeviceClass) => DeskLayout | null
  db: SqlDb
}

export function createDeskLayoutStore(db: SqlDb): DeskLayoutStore {
  ensureDeskLayoutSchema(db)

  const save: DeskLayoutStore['save'] = (layout, at) => {
    db.prepare(
      `INSERT INTO desk_layouts (user_id, desk_id, device_class, layout_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, desk_id, device_class) DO UPDATE SET layout_json = excluded.layout_json, updated_at = excluded.updated_at`
    ).run(layout.userId, layout.deskId, layout.deviceClass, JSON.stringify(layout), at)
  }

  const load: DeskLayoutStore['load'] = (userId, deskId, deviceClass) => {
    const row = db
      .prepare('SELECT layout_json FROM desk_layouts WHERE user_id = ? AND desk_id = ? AND device_class = ?')
      .get(userId, deskId, deviceClass) as { layout_json: string } | undefined
    return row ? (JSON.parse(row.layout_json) as DeskLayout) : null
  }

  return { save, load, db }
}
