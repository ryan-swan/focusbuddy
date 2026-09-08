import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { useLinksStore } from '../stores/links'
import { useNodeStore } from '../stores/nodes'
import { buildProjection, type ProjectionResolvers } from './publicDeskProjection'
import { warmCache } from './liveDeskResolvers'

// Keeps a published desk current.
//
// The projection is rebuilt from the live stores and handed to the main process,
// which debounces and publishes. Rebuilding on every store change is cheap
// (it is a pure map over the widgets already in memory) and it is the debounce
// in the main process that keeps a drag from becoming a request per frame.

export interface LiveDeskStatus {
  token: string | null
  revision: number
  lastPublishedAt: number | null
  lastError: string | null
  paused: boolean
  busy: boolean
}

const EMPTY: LiveDeskStatus = {
  token: null,
  revision: 0,
  lastPublishedAt: null,
  lastError: null,
  paused: false,
  busy: false
}

function useResolvers(cache: React.MutableRefObject<Map<string, unknown>>): ProjectionResolvers {
  // Memoised: these close over a ref, so one object serves for the component's
  // whole life. Returning a fresh literal made `build` a new function every
  // render, which re-ran the publish effect, which set state, which
  // re-rendered -- a republish loop that ran flat out while nobody touched the
  // app.
  return useMemo(
    () => ({
      table: (id) => (cache.current.get(`t:${id}`) as ReturnType<ProjectionResolvers['table']>) ?? null,
      document: (id) => (cache.current.get(`d:${id}`) as ReturnType<ProjectionResolvers['document']>) ?? null,
      slides: (id) => (cache.current.get(`s:${id}`) as ReturnType<ProjectionResolvers['slides']>) ?? null,
      diagram: (id) => (cache.current.get(`g:${id}`) as ReturnType<ProjectionResolvers['diagram']>) ?? null,
      asset: (id) => (cache.current.get(`a:${id}`) as ReturnType<ProjectionResolvers['asset']>) ?? null,
      file: (id) => (cache.current.get(`f:${id}`) as ReturnType<ProjectionResolvers['file']>) ?? null
    }),
    [cache]
  )
}


/**
 * What the public would actually see, as a comparable string. `publishedAt` is
 * stamped fresh on every build and `revision` is the server's to assign, so
 * both are excluded: including them would make every rebuild look like a
 * change and publish a new revision for nothing.
 */
export function projectionFingerprint(projection: unknown): string {
  const p = projection as Record<string, unknown> | null
  if (!p) return ''
  const { publishedAt: _p, revision: _r, ...content } = p
  return JSON.stringify(content)
}

export function useLiveDeskPublisher(deskId: string | null): {
  status: LiveDeskStatus
  start: () => Promise<void>
  stop: () => Promise<void>
  setPaused: (paused: boolean) => Promise<void>
  publishNow: () => Promise<void>
} {
  const [status, setStatus] = useState<LiveDeskStatus>(EMPTY)
  const widgets = useWidgetStore((s) => s.widgets)
  const links = useLinksStore((s) => s.links)
  const cache = useRef(new Map<string, unknown>())
  // The last projection actually queued, so an identical rebuild is a no-op.
  const lastSentRef = useRef<string>('')
  const [warmTick, setWarmTick] = useState(0)
  const resolvers = useResolvers(cache)

  const refresh = useCallback(async () => {
    if (!deskId) return setStatus(EMPTY)
    const rec = await window.api.liveDesk.get(deskId)
    setStatus(
      rec
        ? {
            token: rec.token,
            revision: rec.revision,
            lastPublishedAt: rec.lastPublishedAt,
            lastError: rec.lastError,
            paused: rec.paused,
            busy: false
          }
        : EMPTY
    )
  }, [deskId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const build = useCallback(() => {
    if (!deskId) return null
    const node = useNodeStore.getState().nodes.find((n) => n.id === deskId)
    return buildProjection({
      deskId,
      title: node?.title ?? 'Shared desk',
      revision: 0, // the server assigns the real revision
      widgets: widgets.filter((w) => w.taskId === deskId),
      links: links.map((l) => ({
        id: l.id,
        fromWidgetId: l.sourceWidgetId,
        toWidgetId: l.targetWidgetId,
        label: null
      })),
      resolvers
    })
  }, [deskId, widgets, links, resolvers, warmTick])

  // Fetch the bodies the projection needs, then rebuild. Publishing waits for
  // this rather than shipping placeholders where real content exists: a public
  // desk that silently omits its tables is worse than one that takes a moment.
  useEffect(() => {
    if (!deskId || !status.token || status.paused) return
    let cancelled = false
    void warmCache(
      widgets.filter((w) => w.taskId === deskId),
      cache.current
    ).then((learned) => {
      if (learned && !cancelled) setWarmTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [deskId, status.token, status.paused, widgets])

  // Republish whenever the desk changes, but only once it is actually published
  // and not paused -- otherwise every edit on every desk would queue work.
  useEffect(() => {
    if (!deskId || !status.token || status.paused) return
    const projection = build()
    if (!projection) return
    // Republish only when the desk actually differs. Without this the hook
    // republished on every render, and the server counted a revision each time.
    const fingerprint = projectionFingerprint(projection)
    if (fingerprint === lastSentRef.current) return
    lastSentRef.current = fingerprint
    void window.api.liveDesk.queuePublish(deskId, projection)
    // The main process publishes asynchronously; re-read shortly after so the
    // panel shows the real revision and any error rather than an optimistic one.
    const t = setTimeout(() => void refresh(), 2000)
    return () => clearTimeout(t)
  }, [deskId, status.token, status.paused, build, refresh])

  return {
    status,
    start: async () => {
      if (!deskId) return
      setStatus((s) => ({ ...s, busy: true }))
      const res = await window.api.liveDesk.start(deskId)
      if (res.ok) {
        const projection = build()
        if (projection) await window.api.liveDesk.publish(deskId, projection)
      } else {
        setStatus((s) => ({ ...s, busy: false, lastError: res.error ?? 'Could not publish.' }))
        return
      }
      await refresh()
    },
    stop: async () => {
      if (!deskId) return
      setStatus((s) => ({ ...s, busy: true }))
      await window.api.liveDesk.stop(deskId)
      await refresh()
    },
    setPaused: async (paused: boolean) => {
      if (!deskId) return
      await window.api.liveDesk.setPaused(deskId, paused)
      await refresh()
    },
    publishNow: async () => {
      if (!deskId) return
      const projection = build()
      if (!projection) return
      // An explicit publish is a deliberate act: it goes through even when the
      // content is unchanged.
      lastSentRef.current = projectionFingerprint(projection)
      setStatus((s) => ({ ...s, busy: true }))
      await window.api.liveDesk.publish(deskId, projection)
      await refresh()
    }
  }
}
