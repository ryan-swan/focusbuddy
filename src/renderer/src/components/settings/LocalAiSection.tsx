import { useEffect, useState } from 'react'

// Local AI (Ollama) enrichment control. Shows, honestly, whether a local model is
// running and what it picked, and lets the user enrich every document into
// metadata (summary, category, entities, dates, keywords) that feeds the AI's
// retrieval + grounding — privately, offline and free. Nothing here fabricates:
// with no local model it says so and the button is disabled.

interface LocalStatus {
  available: boolean
  baseUrl: string
  chatModel: string | null
  embedModel: string | null
}

export default function LocalAiSection(): JSX.Element {
  const [status, setStatus] = useState<LocalStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setStatus(await window.api.localAi.status())
    } catch {
      setStatus({ available: false, baseUrl: '', chatModel: null, embedModel: null })
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function enrich(): Promise<void> {
    setBusy(true)
    setNote(null)
    try {
      const r = await window.api.documents.enrichAll(false)
      if (r.reason === 'no_local_model') {
        setNote('No local model is running, so nothing was enriched.')
      } else {
        setNote(
          `Enriched ${r.enriched} document${r.enriched === 1 ? '' : 's'}` +
            (r.skipped ? `, ${r.skipped} already done` : '') +
            (r.failed ? `, ${r.failed} skipped` : '') +
            '. The AI now has richer context to answer from.'
        )
      }
    } catch (e) {
      setNote(`Enrichment failed: ${(e as Error).message || 'unknown error'}`)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const btn =
    'text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--edge-soft)] text-[var(--ink-80)] hover:bg-[var(--surface-sunken)] disabled:opacity-50'

  return (
    <div className="mt-3 pt-3 border-t border-[var(--edge-soft)]" data-testid="local-ai-section">
      <div className="text-[11px] uppercase tracking-wider text-[var(--ink-50)] mb-1.5">
        Local AI enrichment
      </div>
      <div className="text-[11px] text-[var(--ink-60)] leading-snug mb-2">
        Uses a local model (Ollama) to describe your documents so the assistant
        finds and grounds answers with richer context. Runs on this Mac, no cloud
        credit.
      </div>

      {status && (
        <div className="bg-[var(--surface-raised)] border border-[var(--edge-soft)] rounded-md px-2.5 py-2 mb-2 text-[11px]">
          {status.available ? (
            <div className="text-[var(--ink-70)] leading-snug">
              Local AI is running. Writing model{' '}
              <span className="font-mono text-[var(--ink-90)]">{status.chatModel ?? 'none'}</span>,
              embeddings{' '}
              <span className="font-mono text-[var(--ink-90)]">{status.embedModel ?? 'none'}</span>.
            </div>
          ) : (
            <div className="text-[var(--ink-50)] leading-snug">
              No local model detected at{' '}
              <span className="font-mono">{status.baseUrl || 'localhost:11434'}</span>. Start Ollama
              (or set FB_OLLAMA_URL) to enable local enrichment.
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => void enrich()}
          disabled={busy || !status?.available || !status?.chatModel}
          data-testid="local-ai-enrich"
          className={btn}
        >
          {busy ? 'Enriching…' : 'Enrich my documents'}
        </button>
        <button onClick={() => void refresh()} disabled={busy} className={btn}>
          Refresh status
        </button>
      </div>

      {note && (
        <div className="text-[11px] text-[var(--ink-60)] mt-2 leading-snug" data-testid="local-ai-note">
          {note}
        </div>
      )}
    </div>
  )
}
