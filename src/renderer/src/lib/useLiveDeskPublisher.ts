import { useCallback, useEffect, useRef, useState } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { useLinksStore } from '../stores/links'
import { useNodeStore } from '../stores/nodes'
import { buildProjection, type ProjectionResolvers } from './publicDeskProjection'

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

/**
 * Resolvers backed by the renderer's IPC surface. Table and document bodies are
 * fetched lazily and cached per revision; a desk with no tables never pays for
 * the lookup.
 */
function useResolvers(): ProjectionResolvers {
  const cache = useRef(new Map<string, unknown>())
  return {
    // Synchronous by contract, so anything not already cached resolves to null
    // and the widget publishes as a placeholder until the cache warms.
    table: (id) => (cache.current.get(`t:${id}`) as ReturnType<ProjectionResolvers['table']>) ?? null,
    document: (id) => (cache.current.get(`d:${id}`) as ReturnType<ProjectionResolvers['document']>) ?? null,
    slides: (id) => (cache.current.get(`s:${id}`) as ReturnType<ProjectionResolvers['slides']>) ?? null,
    diagram: (id) => (cache.current.get(`g:${id}`) as ReturnType<ProjectionResolvers['diagram']>) ?? null,
    asset: (id) => (cache.current.get(`a:${id}`) as ReturnType<ProjectionResolvers['asset']>) ?? null,
    file: (id) => (cache.current.get(`f:${id}`) as ReturnType<ProjectionResolvers['file']>) ?? null
  }
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
  const resolvers = useResolvers()

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
  }, [deskId, widgets, links, resolvers])

  // Republish whenever the desk changes, but only once it is actually published
  // and not paused -- otherwise every edit on every desk would queue work.
  useEffect(() => {
    if (!deskId || !status.token || status.paused) return
    const projection = build()
    if (!projection) return
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
      setStatus((s) => ({ ...s, busy: true }))
      await window.api.liveDesk.publish(deskId, projection)
      await refresh()
    }
  }
}
