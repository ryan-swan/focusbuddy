import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWidgetStore } from '../../src/renderer/src/stores/widgets'
import { useAccountStore } from '../../src/renderer/src/stores/account'
import type { Widget } from '@shared/types'
import type { DeskLayout } from '@shared/deskLayout'

// PLX-APP-010 Phase 1 (ADR-0006) — regression coverage for the loadToken fix in
// stores/widgets.ts loadForTask(). A reentrant open for the SAME taskId (e.g.
// MindMapWidget's reloadCanvasStores, or liveCanvas.ts applying a remote patch)
// must let the NEWEST call's restore win, even if the OLDER call's awaited
// widgets.listByTask / deskLayout.load promises happen to resolve LATER, or
// resolve in a different order than the calls were fired. A taskId-string
// comparison (the pre-fix guard) cannot distinguish "my own in-flight call"
// from "a newer reentrant call for the same desk", because both see the
// identical taskId value — only a monotonically-increasing per-call token can
// tell them apart. Both calls snapshot `loadToken` synchronously at the start
// of loadForTask, before either awaits anything, so the OLDER call's snapshot
// is stale the instant the NEWER call fires — the older call bails at its
// very first checkpoint (right after its own listByTask resolves) and NEVER
// reaches deskLayout.load, regardless of promise resolution order.
//
// This test drives loadForTask through window.api with a deferred-per-call mock
// (each invocation gets its own controllable promise, tracked by ACTUAL
// invocation order via the queue index, not by an assumed call1/call2 label)
// so resolution order is exact and deterministic.

function widget(id: string, taskId: string): Widget {
  return {
    id,
    taskId,
    kind: 'sticky',
    title: '',
    content: '',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    zIndex: 1,
    color: null,
    pinned: false,
    pinnedScreenX: null,
    pinnedScreenY: null,
    pinnedZone: null,
    parentSectionId: null,
    layout: null,
    sourceAppId: null,
    mode: null,
    livingQuery: null,
    livingGeneratedAt: null,
    livingPaused: false,
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    syncGroupId: null
  } as Widget
}

// A mock whose Nth invocation returns a promise this test can resolve
// independently, addressed by its ACTUAL invocation index (queue[0], queue[1],
// ...) — not by an assumed logical ordering.
function deferredMock<T>(): {
  fn: ReturnType<typeof vi.fn>
  queue: Array<(v: T) => void>
} {
  const queue: Array<(v: T) => void> = []
  const fn = vi.fn(() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    queue.push(resolve)
    return promise
  })
  return { fn, queue }
}

describe('plx_app_010 phase1 — loadForTask reentrant-same-taskId race (loadToken)', () => {
  beforeEach(() => {
    useAccountStore.setState({ account: null } as never)
    useWidgetStore.setState({
      widgets: [],
      loadingFor: null,
      layoutHydratedFor: null,
      loadToken: 0,
      selectedIds: [],
      zoom: 1,
      panX: 0,
      panY: 0
    } as never)
  })

  it('call2 (newer) restores fully; call1 (older)\'s late listByTask resolution then bails as a no-op, never reaching deskLayout.load', async () => {
    const deskId = 'desk-race-1'
    const w = widget('w-race-1', deskId)

    const list = deferredMock<Widget[]>()
    const load = deferredMock<DeskLayout | null>()
    ;(window as unknown as { api: unknown }).api = {
      widgets: { listByTask: list.fn },
      deskLayout: { load: load.fn, save: vi.fn() },
      snapshots: { create: vi.fn() }
    }

    const SAVED_OLD: DeskLayout = {
      userId: 'local',
      deskId,
      deviceClass: 'desktop',
      objects: [],
      zoom: 2,
      scroll: { x: 999, y: 999 },
      selectedObjectIds: ['w-race-1']
    }
    const SAVED_NEW: DeskLayout = {
      userId: 'local',
      deskId,
      deviceClass: 'desktop',
      objects: [],
      zoom: 1.5,
      scroll: { x: 50, y: 50 },
      selectedObjectIds: ['w-race-1']
    }

    // call1 = the OLDER, first-fired reentrant open. call2 = the NEWER one,
    // fired immediately after without awaiting call1 — exactly the
    // "reloadCanvasStores while Canvas's own open is still in flight" shape.
    // Both invoke list.fn synchronously before either awaits anything:
    // call1 -> list.queue[0], call2 -> list.queue[1].
    const p1 = useWidgetStore.getState().loadForTask(deskId)
    const p2 = useWidgetStore.getState().loadForTask(deskId)
    expect(list.fn).toHaveBeenCalledTimes(2)
    expect(useWidgetStore.getState().loadToken).toBe(2) // call2's snapshot already invalidated call1's

    // Resolve the NEWER call's (call2) listByTask FIRST and let it fully
    // commit its restore — it is the only caller to reach deskLayout.load so far.
    list.queue[1]([w])
    await vi.waitFor(() => expect(load.fn).toHaveBeenCalledTimes(1))
    load.queue[0](SAVED_NEW)
    await p2

    expect(useWidgetStore.getState().zoom).toBe(SAVED_NEW.zoom)
    expect(useWidgetStore.getState().panX).toBe(SAVED_NEW.scroll.x)
    expect(useWidgetStore.getState().panY).toBe(SAVED_NEW.scroll.y)
    expect(useWidgetStore.getState().layoutHydratedFor).toBe(deskId)

    // NOW let the OLDER call's (call1) listByTask finally resolve, late.
    // Without loadToken this taskId-identical reentrant call could still be
    // "live" and go on to overwrite the store with SAVED_OLD's stale camera.
    // With the fix, call1 bails at its very first post-await checkpoint
    // (`get().loadToken !== token`) and never even calls deskLayout.load.
    list.queue[0]([w])
    await p1 // must resolve promptly (early return), not hang waiting on deskLayout.load

    expect(load.fn).toHaveBeenCalledTimes(1) // call1 never reached deskLayout.load
    // The store still reflects call2 (the newer call) — fully untouched by call1.
    expect(useWidgetStore.getState().zoom).toBe(SAVED_NEW.zoom)
    expect(useWidgetStore.getState().panX).toBe(SAVED_NEW.scroll.x)
    expect(useWidgetStore.getState().panY).toBe(SAVED_NEW.scroll.y)
    expect(useWidgetStore.getState().layoutHydratedFor).toBe(deskId)
  })

  it('call1 (older) resolving its listByTask FIRST does not corrupt or block call2 (newer)', async () => {
    // The interleaving most likely to expose a loadingFor-based (pre-fix)
    // guard: the OLDER call's listByTask resolves before the newer call's,
    // so it is the one that would have cleared a shared `loadingFor` string
    // first. loadToken must still make call1 a complete no-op (it never
    // reaches deskLayout.load) and must not cause call2 to bail.
    const deskId = 'desk-race-2'
    const w = widget('w-race-2', deskId)

    const list = deferredMock<Widget[]>()
    const load = deferredMock<DeskLayout | null>()
    ;(window as unknown as { api: unknown }).api = {
      widgets: { listByTask: list.fn },
      deskLayout: { load: load.fn, save: vi.fn() },
      snapshots: { create: vi.fn() }
    }

    const SAVED_NEW: DeskLayout = {
      userId: 'local',
      deskId,
      deviceClass: 'desktop',
      objects: [],
      zoom: 1.25,
      scroll: { x: 10, y: 20 },
      selectedObjectIds: []
    }

    const p1 = useWidgetStore.getState().loadForTask(deskId)
    const p2 = useWidgetStore.getState().loadForTask(deskId)

    // call1's listByTask (queue[0]) resolves FIRST. It must bail immediately
    // (loadToken already bumped to 2 by call2's synchronous start) and never
    // reach deskLayout.load.
    list.queue[0]([w])
    await p1
    expect(load.fn).toHaveBeenCalledTimes(0)

    // call2's listByTask (queue[1]) now resolves — unaffected by call1 having
    // already run and returned.
    list.queue[1]([w])
    await vi.waitFor(() => expect(load.fn).toHaveBeenCalledTimes(1))
    load.queue[0](SAVED_NEW)
    await p2

    expect(useWidgetStore.getState().widgets.map((x) => x.id)).toEqual(['w-race-2'])
    expect(useWidgetStore.getState().zoom).toBe(SAVED_NEW.zoom)
    expect(useWidgetStore.getState().layoutHydratedFor).toBe(deskId)
  })
})
