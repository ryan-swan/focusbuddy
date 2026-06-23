import { useState } from 'react'
import type { DocBody, SlidesBody } from '@shared/types'
import { htmlToDoc, wrapDocBody } from '@office'
import { migrateSlidesBody } from '@shared/slidesMigrate'
import Icon from '../Icon'
import { useDocumentsStore } from '../../stores/documents'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Ask-your-workspace: type a question, get an answer grounded in your own
// documents, with the documents it drew from shown as clickable citations. The
// answer is suggest-grade — it says it can't find something rather than guessing,
// because an ungrounded answer is worse than none.

interface Source {
  docId: string
  title: string
  docType: string
  snippet: string
  cited: boolean
}

function docIcon(t: string): string {
  return t === 'sheet' ? 'table_chart' : t === 'slides' ? 'slideshow' : t === 'map' ? 'account_tree' : 'description'
}

export default function OfficeAsk({ onClose }: { onClose: () => void }): JSX.Element {
  const open = useDocumentsStore((s) => s.open)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  async function ask(): Promise<void> {
    const question = q.trim()
    if (!question || busy) return
    setBusy(true)
    setMsg(null)
    setAnswer(null)
    setSources([])
    try {
      const res = await window.api.workspace.ask(question)
      if (!res.ok) {
        setMsg(res.needsApiKey ? 'Add an Anthropic API key in Settings → AI to ask your workspace.' : res.error ?? 'Could not answer.')
        return
      }
      setAnswer(res.answer ?? '')
      setSources((res.sources ?? []).filter((s) => s.cited))
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

  // Create-from-it: the loop a read-only assistant can't close — turn the answer
  // into a real, editable document or deck and open it.
  async function makeDoc(): Promise<void> {
    if (!answer || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const heading = `<h2>${esc(q.trim())}</h2>`
      const paras = answer
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p>${esc(l)}</p>`)
        .join('')
      const body = wrapDocBody(htmlToDoc(heading + paras), {}) as unknown as DocBody
      const created = await window.api.documents.create({ docType: 'doc', title: q.trim().slice(0, 60) || 'Answer', body })
      void open(created.id)
      onClose()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function makeDeck(): Promise<void> {
    if (!answer || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.documents.generateSlides({
        mode: 'deck',
        prompt: `Make a clear slide deck presenting this answer to the question "${q.trim()}":\n\n${answer}`
      })
      if (!res.ok || !res.body) {
        setMsg(res.needsApiKey ? 'Add an Anthropic API key in Settings → AI to build a deck.' : res.error ?? 'Could not build the deck.')
        return
      }
      const body = migrateSlidesBody(res.body) as unknown as SlidesBody
      const created = await window.api.documents.create({ docType: 'slides', title: q.trim().slice(0, 60) || 'Answer deck', body })
      void open(created.id)
      onClose()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/40 flex items-start justify-center pt-[12vh]"
      onMouseDown={onClose}
      data-testid="office-ask-modal"
    >
      <div
        className="w-[600px] max-w-[92vw] max-h-[74vh] flex flex-col rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-700">
          <Icon name="auto_awesome" size={15} className="text-accent shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask()
              if (e.key === 'Escape') onClose()
            }}
            placeholder="Ask your workspace… e.g. what did we agree on Acme pricing?"
            data-testid="office-ask-input"
            className="flex-1 bg-transparent text-[13px] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
          />
          <button
            onClick={() => void ask()}
            disabled={busy || !q.trim()}
            data-testid="office-ask-submit"
            className="btn-primary text-[12px] px-2.5 py-1 disabled:opacity-50 shrink-0"
          >
            {busy ? 'Reading…' : 'Ask'}
          </button>
          <button onClick={onClose} className="icon-btn shrink-0" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {msg && <div className="text-[12px] text-stone-500 dark:text-stone-400">{msg}</div>}
          {answer !== null && (
            <div data-testid="office-ask-answer" className="text-[13px] leading-relaxed text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
              {answer}
            </div>
          )}
          {answer !== null && answer.trim().length > 0 && (
            <div className="mt-3 flex items-center gap-1.5" data-testid="office-ask-create">
              <span className="text-[11px] text-stone-400">Turn this into</span>
              <button
                onClick={() => void makeDoc()}
                disabled={busy}
                data-testid="office-ask-make-doc"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-stone-200 dark:border-stone-700 hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Icon name="description" size={13} /> Document
              </button>
              <button
                onClick={() => void makeDeck()}
                disabled={busy}
                data-testid="office-ask-make-deck"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-stone-200 dark:border-stone-700 hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Icon name="slideshow" size={13} /> Deck
              </button>
            </div>
          )}
          {sources.length > 0 && (
            <div className="mt-3" data-testid="office-ask-sources">
              <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1.5">From your documents</div>
              <div className="space-y-1">
                {sources.map((s) => (
                  <button
                    key={s.docId}
                    onClick={() => openSource(s.docId)}
                    data-testid={`office-ask-source-${s.title}`}
                    className="w-full flex items-start gap-2 text-left rounded-lg border border-stone-200 dark:border-stone-700 px-2.5 py-1.5 hover:border-accent hover:bg-accent/[0.04]"
                  >
                    <Icon name={docIcon(s.docType)} size={14} className="text-accent shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-stone-800 dark:text-stone-100 truncate">{s.title}</span>
                      {s.snippet && <span className="block text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2">{s.snippet}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {answer === null && !msg && (
            <div className="text-[12px] text-stone-400 dark:text-stone-500">
              Answers are drawn only from your own documents, with the sources shown so you can check them.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
