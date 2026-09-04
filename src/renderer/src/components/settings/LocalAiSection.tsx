import { useEffect, useState } from 'react'

// Local AI (Ollama) enrichment control. Shows, honestly, whether a local model is
// running and what it picked, and lets the user enrich every document into
// metadata (summary, category, entities, dates, keywords) that feeds the AI's
// retrieval + grounding — privately, offline and free. Nothing here fabricates:
// with no local model it says so and the button is disabled.

interface Coverage {
  documents: {
    total: number
    withText: number
    indexed: number
    embedded: number
    enriched: number
    memoryScanned: number
  }
  files: { total: number; indexed: number }
  conversations: { total: number; indexed: number }
  knowledge: { total: number }
}

interface LocalStatus {
  available: boolean
  baseUrl: string
  chatModel: string | null
  embedModel: string | null
}

export default function LocalAiSection(): JSX.Element {
  const [status, setStatus] = useState<LocalStatus | null>(null)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setStatus(await window.api.localAi.status())
    } catch {
      setStatus({ available: false, baseUrl: '', chatModel: null, embedModel: null })
    }
    // Coverage is reported separately: a failure here must leave the number
    // ABSENT rather than showing a zero that reads like a real measurement.
    try {
      setCoverage(await window.api.localAi.coverage())
    } catch {
      setCoverage(null)
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
    'fb-t-caption px-2.5 py-1.5 fb-btn-surface fb-press text-[var(--ink-80)] disabled:opacity-50'

  return (
    <div className="mt-3 pt-3 border-t border-[var(--edge-soft)]" data-testid="local-ai-section">
      <div className="fb-t-caption uppercase tracking-wider text-[var(--ink-50)] mb-1.5">
        Local AI enrichment
      </div>
      <div className="fb-t-caption text-[var(--ink-60)] leading-snug mb-2">
        Uses a local model (Ollama) to describe your documents so the assistant
        finds and grounds answers with richer context. Runs on this Mac, no cloud
        credit.
      </div>

      {status && (
        <div className="fb-card rounded-[var(--radius-field)] px-2.5 py-2 mb-2 fb-t-caption">
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

      {coverage && (
        <div
          className="fb-card rounded-[var(--radius-field)] px-2.5 py-2 mb-2 fb-t-caption"
          data-testid="brain-coverage"
        >
          <div className="text-[var(--ink-50)] uppercase tracking-wider mb-1">
            What the assistant can see
          </div>
          <div className="text-[var(--ink-70)] leading-snug">
            {/*
              Denominator is documents that actually hold text: a blank document
              is not a coverage gap, and counting it as one would invent one.
            */}
            Searchable: <Stat n={coverage.documents.indexed} of={coverage.documents.withText} /> documents
            {coverage.documents.total > coverage.documents.withText && (
              <span className="text-[var(--ink-50)]">
                {' '}
                ({coverage.documents.total - coverage.documents.withText} empty)
              </span>
            )}
            , <Stat n={coverage.files.indexed} of={coverage.files.total} /> files,{' '}
            <Stat n={coverage.conversations.indexed} of={coverage.conversations.total} /> conversations.
            <br />
            Described: <Stat n={coverage.documents.enriched} of={coverage.documents.withText} />
            {' · '}Ranked by meaning:{' '}
            <Stat n={coverage.documents.embedded} of={coverage.documents.withText} />
            {' · '}Read for memory:{' '}
            <Stat n={coverage.documents.memoryScanned} of={coverage.documents.withText} />
          </div>
          {status?.available && (
            <div className="text-[var(--ink-50)] leading-snug mt-1">
              Anything outstanding is picked up automatically in the background.
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
        <div className="fb-t-caption text-[var(--ink-60)] mt-2 leading-snug" data-testid="local-ai-note">
          {note}
        </div>
      )}
    </div>
  )
}

// One "n of m" pair. An incomplete count is weighted so a shortfall is visible
// at a glance — a gap the user cannot see is a gap they cannot act on.
function Stat({ n, of }: { n: number; of: number }): JSX.Element {
  const complete = of === 0 || n >= of
  return (
    <span className={complete ? 'text-[var(--ink-90)]' : 'text-[var(--ink-100)] font-semibold'}>
      {n} of {of}
    </span>
  )
}
