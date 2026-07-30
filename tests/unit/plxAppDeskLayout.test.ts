import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createDeskLayoutStore } from '../../src/main/db/deskLayoutStore'
import { layoutIsComplete, type DeskLayout } from '../../src/shared/deskLayout'

// Desk layout persistence (spec §21).

function layout(over: Partial<DeskLayout> = {}): DeskLayout {
  return {
    userId: 'sam', deskId: 'desk-1', deviceClass: 'desktop', zoom: 1.5,
    scroll: { x: 40, y: 120 }, selectedObjectIds: ['obj-2'],
    objects: [
      { objectId: 'obj-1', x: 10, y: 20, width: 300, height: 200, zIndex: 1 },
      { objectId: 'obj-2', x: 400, y: 50, width: 250, height: 180, zIndex: 3 }
    ],
    ...over
  }
}

describe('plx_app_010 / plx_prd_002 — persist and restore the complete layout', () => {
  it('test_plx_app_010_round_trip_exact', () => {
    const store = createDeskLayoutStore(memSqlDb())
    const saved = layout()
    store.save(saved, '2026-07-30T00:00:00Z')
    const restored = store.load('sam', 'desk-1', 'desktop')!
    expect(restored).toEqual(saved) // positions, sizes, z-order, scroll, selection, zoom all restored exactly
    expect(layoutIsComplete(restored)).toBe(true)
  })

  it('test_plx_prd_002_reopen_restores_same', () => {
    const db = memSqlDb()
    const store = createDeskLayoutStore(db)
    store.save(layout({ zoom: 2 }), 't1')
    // A fresh store over the same DB (simulating reopen) restores the layout.
    const reopened = createDeskLayoutStore(db)
    expect(reopened.load('sam', 'desk-1', 'desktop')?.zoom).toBe(2)
  })

  it('test_plx_ux_032_per_device_class_isolated', () => {
    const store = createDeskLayoutStore(memSqlDb())
    store.save(layout({ deviceClass: 'desktop', zoom: 1.5 }), 't1')
    store.save(layout({ deviceClass: 'mobile', zoom: 1 }), 't2')
    // The mobile arrangement never overwrites the desktop one.
    expect(store.load('sam', 'desk-1', 'desktop')?.zoom).toBe(1.5)
    expect(store.load('sam', 'desk-1', 'mobile')?.zoom).toBe(1)
    expect(store.load('sam', 'desk-1', 'tablet')).toBeNull()
  })
})
