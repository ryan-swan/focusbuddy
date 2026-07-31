// plexi-brain settings section (P0 — the RAG floor).
//
// The brain is a TOGGLEABLE LAYER (DEC-012): OFF (default) ⇒ the app searches
// exactly as v3.8.0. This panel lets you enable it per-org, pick the embedding
// backend (DEC-015 — local is free/offline/default; OpenAI is the opt-in cloud
// fallback), build the chunk index, and see honest status. It's the minimum
// surface to feel P0: turn it on, build the index, then "ask your workspace"
// finds facts buried deep in long documents that the old whole-doc search misses.

import { useEffect, useState } from 'react'

interface BrainStatus {
  enabled: boolean
  stage: number
  embedBackend: 'local' | 'openai'
  chunkCount: number
  localEmbedderReady: boolean
}

interface IndexResult {
  sourcesIndexed: number
  chunksWritten: number
  chunksEmbedded: number
  embedModel: string | null
  embedFailed: boolean
  totalChunks: number
  // P1: the object graph materialized from the same corpus (the migration posture).
  projection: {
    nodesProjected: number
    edgesDrawn: number
    totalNodes: number
    totalEdges: number
  } | null
  // P1 (DEC-014): the derived-importance pass — the "foundational nodes" preview.
  importance: {
    nodesScored: number
    maxDegree: number
    topByImportance: Array<{ id: string; type: string; title: string; importance: number }>
  } | null
}

export default function BrainSection(): JSX.Element {
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastBuild, setLastBuild] = useState<IndexResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await window.api.brain.status())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const toggle = async (next: boolean): Promise<void> => {
    setError(null)
    try {
      await window.api.brain.setEnabled(next)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const setBackend = async (backend: 'local' | 'openai'): Promise<void> => {
    setError(null)
    try {
      await window.api.brain.setEmbedBackend(backend)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const build = async (force: boolean): Promise<void> => {
    setError(null)
    setBusy(true)
    setLastBuild(null)
    try {
      const res = await window.api.brain.buildIndex(force)
      setLastBuild(res)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const enabled = status?.enabled ?? false

  return (
    <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
        Plexi Brain (experimental)
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)]/40 px-3 py-2.5">
        <div className="pr-3">
          <div className="text-[12.5px] text-[var(--ink-90)] font-medium">Enable the brain</div>
          <div className="text-[11px] text-[var(--ink-50)] mt-0.5 leading-snug">
            Adds meaning-aware retrieval over your workspace. Off = the app searches exactly as
            today; nothing else changes.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          data-testid="brain-enable-toggle"
          onClick={() => void toggle(!enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
            enabled ? 'bg-[var(--accent,#6366f1)]' : 'bg-[var(--edge-soft)]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* Embedding backend (DEC-015 hybrid AI) */}
          <div className="rounded-lg border border-[var(--edge-soft)] px-3 py-2.5 space-y-2">
            <div className="text-[11.5px] text-[var(--ink-70)] font-medium">Embedding engine</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                data-testid="brain-backend-local"
                onClick={() => void setBackend('local')}
                className={`rounded-md border px-2.5 py-2 text-left transition ${
                  status?.embedBackend === 'local'
                    ? 'border-[var(--accent,#6366f1)] bg-[var(--surface-sunken)]/60'
                    : 'border-[var(--edge-soft)] hover:bg-[var(--surface-sunken)]/40'
                }`}
              >
                <div className="text-[12px] text-[var(--ink-90)] font-medium">Local</div>
                <div className="text-[10.5px] text-[var(--ink-50)] mt-0.5 leading-snug">
                  Runs on your machine. Free, offline, private.
                </div>
              </button>
              <button
                data-testid="brain-backend-openai"
                onClick={() => void setBackend('openai')}
                className={`rounded-md border px-2.5 py-2 text-left transition ${
                  status?.embedBackend === 'openai'
                    ? 'border-[var(--accent,#6366f1)] bg-[var(--surface-sunken)]/60'
                    : 'border-[var(--edge-soft)] hover:bg-[var(--surface-sunken)]/40'
                }`}
              >
                <div className="text-[12px] text-[var(--ink-90)] font-medium">OpenAI</div>
                <div className="text-[10.5px] text-[var(--ink-50)] mt-0.5 leading-snug">
                  Cloud embeddings (needs an OpenAI key).
                </div>
              </button>
            </div>
          </div>

          {/* Index build + status */}
          <div className="rounded-lg border border-[var(--edge-soft)] px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11.5px] text-[var(--ink-70)] font-medium">Search index</div>
              <div className="text-[11px] text-[var(--ink-50)]" data-testid="brain-chunk-count">
                {status ? `${status.chunkCount} chunks indexed` : '…'}
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                data-testid="brain-build-index"
                disabled={busy}
                onClick={() => void build(false)}
                className="flex-1 text-[11.5px] border border-[var(--edge-soft)] rounded-md py-1.5 text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              >
                {busy ? 'Building…' : 'Build / refresh index'}
              </button>
              <button
                disabled={busy}
                onClick={() => void build(true)}
                title="Re-embed everything from scratch"
                className="text-[11.5px] border border-[var(--edge-soft)] rounded-md px-2.5 py-1.5 text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              >
                Rebuild
              </button>
            </div>
            {lastBuild && (
              <div className="text-[10.5px] text-[var(--ink-50)] leading-snug" data-testid="brain-build-result">
                Indexed {lastBuild.sourcesIndexed} sources → {lastBuild.chunksWritten} chunks
                {lastBuild.embedModel ? `, embedded ${lastBuild.chunksEmbedded} via ${lastBuild.embedModel}` : ''}
                {lastBuild.embedFailed
                  ? ' — embedding unavailable, keyword-only (add a key or use Local).'
                  : '.'}
              </div>
            )}
            {/* P1 — the object graph built from the same corpus (migration posture). */}
            {lastBuild?.projection && (
              <div
                className="text-[10.5px] text-[var(--ink-50)] leading-snug"
                data-testid="brain-graph-result"
              >
                Graph: {lastBuild.projection.totalNodes} nodes · {lastBuild.projection.totalEdges} edges
                (each grounded to its source).
                {lastBuild.importance && lastBuild.importance.topByImportance.length > 0 && (
                  <>
                    {' '}
                    Your core areas (derived, not preset):{' '}
                    {lastBuild.importance.topByImportance
                      .slice(0, 4)
                      .map((n) => n.title || `(${n.type})`)
                      .join(' · ')}
                    .
                  </>
                )}
              </div>
            )}
            <div className="text-[10.5px] text-[var(--ink-50)] leading-snug">
              First local build downloads a small model once (~90MB), then runs offline. Ask your
              workspace afterward — it finds facts buried deep in long documents that the old search
              misses.
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="text-[11px] text-red-600 dark:text-red-400 leading-snug" data-testid="brain-error">
          {error}
        </div>
      )}
    </div>
  )
}
