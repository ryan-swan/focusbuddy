import { useState } from 'react'
import type { DocBody, SlidesBody } from '@shared/types'
import { htmlToDoc, wrapDocBody } from '@office'
import { migrateSlidesBody } from '@shared/slidesMigrate'
import Icon from '../Icon'
import { useDocumentsStore } from '../../stores/documents'

// Ask-your-workspace: a grounded conversation over your own documents. Each turn
// answers using only your documents, shows the sources it drew from as clickable
// citations, and can be turned into a real document or deck. Follow-ups keep the
// thread, so "what about year two?" resolves against the earlier answer. The
// answer is suggest-grade — it says it can't find something rather than guessing,
// because an ungrounded answer is worse than none.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface Source {
  docId: string
  title: string
  docType: string
  snippet: string
  cited: boolean
}

interface Turn {
  question: string
  answer: string
  sources: Source[]
}

function docIcon(t: string): string {
  return t === 'sheet' ? 'table_chart' : t === 'slides' ? 'slideshow' : t === 'map' ? 'account_tree' : 'description'
}

export default function OfficeAsk({ onClose }: { onClose: () => void }): JSX.Element {
  const open = useDocumentsStore((s) => s.open)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  async function ask(): Promise<void> {
    const question = q.trim()
    if (!question || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const history = turns.map((t) => ({ question: t.question, answer: t.answer }))
      const res = await window.api.workspace.ask(question, history)
      if (!res.ok) {
        setMsg(res.needsApiKey ? 'Add an Anthropic API key in Settings → AI to ask your workspace.' : res.error ?? 'Could not answer.')
        return
      }
      setTurns((prev) => [...prev, { question, answer: res.answer ?? '', sources: (res.sources ?? []).filter((s) => s.cited) }])
      setQ('')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openSource(docId: string): void {
    void open(docId)
    onClose()
  }

  // Create-from-it: turn a given answer into a real, editable document or deck.
  async function makeDoc(turn: Turn): Promise<void> {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const heading = `<h2>${esc(turn.question)}</h2>`
      const paras = turn.answer
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p>${esc(l)}</p>`)
        .join('')
      const body = wrapDocBody(htmlToDoc(heading + paras), {}) as unknown as DocBody
      const created = await window.api.documents.create({ docType: 'doc', title: turn.question.slice(0, 60) || 'Answer', body })
      void open(created.id)
      onClose()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function makeDeck(turn: Turn): Promise<void> {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.documents.generateSlides({
        mode: 'deck',
        prompt: `Make a clear slide deck presenting this answer to the question "${turn.question}":\n\n${turn.answer}`
      })
      if (!res.ok || !res.body) {
        setMsg(res.needsApiKey ? 'Add an Anthropic API key in Settings → AI to build a deck.' : res.error ?? 'Could not build the deck.')
        return
      }
      const body = migrateSlidesBody(res.body) as unknown as SlidesBody
      const created = await window.api.documents.create({ docType: 'slides', title: turn.question.slice(0, 60) || 'Answer deck', body })
      void open(created.id)
      onClose()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const hasThread = turns.length > 0

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/40 flex items-start justify-center pt-[10vh]"
      onMouseDown={onClose}
      data-testid="office-ask-modal"
    >
      <div
        className="w-[600px] max-w-[92vw] max-h-[78vh] flex flex-col rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--edge-soft)]">
          <Icon name="auto_awesome" size={15} className="text-accent shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask()
              if (e.key === 'Escape') onClose()
            }}
            placeholder={hasThread ? 'Ask a follow-up…' : 'Ask your workspace… e.g. what did we agree on Acme pricing?'}
            data-testid="office-ask-input"
            className="flex-1 bg-transparent text-[13px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none"
          />
          <button
            onClick={() => void ask()}
            disabled={busy || !q.trim()}
            data-testid="office-ask-submit"
            className="btn-primary text-[12px] px-2.5 py-1 disabled:opacity-50 shrink-0"
          >
            {busy ? 'Reading…' : hasThread ? 'Send' : 'Ask'}
          </button>
          <button onClick={onClose} className="icon-btn shrink-0" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {msg && <div className="mb-2 text-[12px] text-[var(--ink-50)]">{msg}</div>}

          {turns.map((turn, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <div className="flex items-start gap-1.5 mb-1 text-[12px] font-medium text-[var(--ink-50)]">
                <Icon name="help" size={13} className="shrink-0 mt-0.5" />
                <span>{turn.question}</span>
              </div>
              <div data-testid="office-ask-answer" className="text-[13px] leading-relaxed text-[var(--ink-90)] whitespace-pre-wrap">
                {turn.answer}
              </div>
              {turn.answer.trim().length > 0 && (
                <div className="mt-2 flex items-center gap-1.5" data-testid="office-ask-create">
                  <span className="text-[11px] text-[var(--ink-40)]">Turn this into</span>
                  <button
                    onClick={() => void makeDoc(turn)}
                    disabled={busy}
                    data-testid="office-ask-make-doc"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[var(--edge-soft)] hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    <Icon name="description" size={13} /> Document
                  </button>
                  <button
                    onClick={() => void makeDeck(turn)}
                    disabled={busy}
                    data-testid="office-ask-make-deck"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[var(--edge-soft)] hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    <Icon name="slideshow" size={13} /> Deck
                  </button>
                </div>
              )}
              {turn.sources.length > 0 && (
                <div className="mt-2" data-testid="office-ask-sources">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-40)] mb-1.5">From your documents</div>
                  <div className="space-y-1">
                    {turn.sources.map((s) => (
                      <button
                        key={s.docId}
                        onClick={() => openSource(s.docId)}
                        data-testid={`office-ask-source-${s.title}`}
                        className="w-full flex items-start gap-2 text-left rounded-lg border border-[var(--edge-soft)] px-2.5 py-1.5 hover:border-accent hover:bg-accent/[0.04]"
                      >
                        <Icon name={docIcon(s.docType)} size={14} className="text-accent shrink-0 mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-medium text-[var(--ink-90)] truncate">{s.title}</span>
                          {s.snippet && <span className="block text-[11px] text-[var(--ink-50)] line-clamp-2">{s.snippet}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {busy && <div className="text-[12px] text-[var(--ink-40)]">Reading your documents…</div>}
          {!hasThread && !busy && !msg && (
            <div className="text-[12px] text-[var(--ink-40)]">
              Answers are drawn only from your own documents, with the sources shown so you can check them. Ask a follow-up to keep the thread.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
