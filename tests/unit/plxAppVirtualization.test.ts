import { describe, it, expect } from 'vitest'
import {
  computeVisibleObjectIds,
  DEFAULT_MARGIN_IN,
  DEFAULT_MARGIN_OUT,
  type VirtualizationBox,
  type VirtualizationCamera
} from '../../src/renderer/src/lib/canvasVirtualization'

// Off-viewport Object virtualisation (spec §77 / PLX-APP-012). The render loop
// must mount only the Objects the current camera can see, so Desk-open latency
// depends on how many Objects are visible, not on how many exist on the Desk.

const CAM: VirtualizationCamera = { panX: 0, panY: 0, zoom: 1, viewportWidth: 1000, viewportHeight: 800 }

// A box fully inside the viewport.
const INSIDE: VirtualizationBox = { id: 'inside', x: 100, y: 100, width: 200, height: 150 }
// A box far to the right, well beyond even the outer margin.
const FAR: VirtualizationBox = { id: 'far', x: 9000, y: 100, width: 200, height: 150 }

describe('plx_app_012 — virtualise off-viewport Objects', () => {
  it('test_plx_app_012_culls_offviewport_mounts_visible', () => {
    const visible = computeVisibleObjectIds([INSIDE, FAR], CAM)
    expect(visible.has('inside')).toBe(true)
    expect(visible.has('far')).toBe(false)
  })

  it('test_plx_app_012_never_culls_exempt_objects', () => {
    // A link endpoint / active / selected / web-kind Object is exempt from
    // geometry culling and stays mounted even when far off-screen.
    const visible = computeVisibleObjectIds([FAR], CAM, { exemptIds: new Set(['far']) })
    expect(visible.has('far')).toBe(true)
  })

  it('test_plx_app_012_extra_exempt_side_channel', () => {
    // The high-churn side channel (the currently-dragged Object + its section)
    // keeps an off-screen Object mounted without touching the main exempt Set.
    const visible = computeVisibleObjectIds([FAR], CAM, { extraExemptIds: ['far'] })
    expect(visible.has('far')).toBe(true)
    // An empty side channel culls as normal.
    const culled = computeVisibleObjectIds([FAR], CAM, { extraExemptIds: [] })
    expect(culled.has('far')).toBe(false)
  })

  it('test_plx_app_012_hysteresis_prevents_edge_flicker', () => {
    // A box parked between the inner (300) and outer (600) margins off the right
    // edge: viewportWidth 1000, so left in (1300, 1600) is inside-outer but
    // outside-inner.
    const edge: VirtualizationBox = { id: 'edge', x: 1400, y: 100, width: 100, height: 100 }
    expect(DEFAULT_MARGIN_OUT).toBeGreaterThan(DEFAULT_MARGIN_IN)
    // Was hidden -> stays hidden (must clear the inner margin to mount).
    const fromHidden = computeVisibleObjectIds([edge], CAM, { previousVisible: new Set() })
    expect(fromHidden.has('edge')).toBe(false)
    // Was visible -> stays visible (only unmounts past the outer margin).
    const fromVisible = computeVisibleObjectIds([edge], CAM, { previousVisible: new Set(['edge']) })
    expect(fromVisible.has('edge')).toBe(true)
  })

  it('test_plx_app_012_freezes_unmounts_during_camera_animation', () => {
    // A previously-visible Object now far off-screen: frozen it stays mounted for
    // the whole transition; unfrozen it is culled.
    const frozen = computeVisibleObjectIds([FAR], CAM, { previousVisible: new Set(['far']), freezeUnmounts: true })
    expect(frozen.has('far')).toBe(true)
    const thawed = computeVisibleObjectIds([FAR], CAM, { previousVisible: new Set(['far']), freezeUnmounts: false })
    expect(thawed.has('far')).toBe(false)
  })

  it('test_plx_app_012_visible_count_independent_of_total', () => {
    // The core spec claim: with the same viewport, the number of mounted Objects
    // is the same whether the Desk holds 20 or 20,000 Objects, because the extra
    // Objects are spread far across the world and never enter the viewport.
    const build = (total: number): VirtualizationBox[] => {
      const boxes: VirtualizationBox[] = []
      // Six Objects genuinely inside the viewport.
      for (let i = 0; i < 6; i++) boxes.push({ id: `in-${i}`, x: 50 + i * 120, y: 50, width: 80, height: 60 })
      // The rest scattered far away, each 5000px further out than the last.
      for (let i = 6; i < total; i++) boxes.push({ id: `out-${i}`, x: 5000 * i, y: 50, width: 80, height: 60 })
      return boxes
    }
    const small = computeVisibleObjectIds(build(20), CAM)
    const large = computeVisibleObjectIds(build(20_000), CAM)
    expect(small.size).toBe(6)
    expect(large.size).toBe(6) // unchanged despite 1000x more Objects on the Desk
  })

  it('test_plx_app_012_zoom_out_reveals_more_objects', () => {
    // Zooming out shrinks each Object's screen footprint, so more of them fall
    // inside the viewport — culling is camera-aware, not a fixed world window.
    const spread: VirtualizationBox[] = []
    for (let i = 0; i < 12; i++) spread.push({ id: `w-${i}`, x: i * 900, y: 100, width: 200, height: 150 })
    const zoomedIn = computeVisibleObjectIds(spread, { ...CAM, zoom: 1 })
    const zoomedOut = computeVisibleObjectIds(spread, { ...CAM, zoom: 0.25 })
    expect(zoomedOut.size).toBeGreaterThan(zoomedIn.size)
  })
})
