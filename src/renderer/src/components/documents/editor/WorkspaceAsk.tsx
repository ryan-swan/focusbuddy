import { useRef, useState } from 'react'
import type { ActionProposal } from '@shared/types'
import Icon from '../../Icon'
import { useViewStore } from '../../../stores/view'
import { applyProposal, describeProposal } from '../../../lib/actionExecutor'

// The workspace brain, shared by every editor surface (docs, sheets, slides,
// design). Ask anything and it grounds the answer in EVERY document, sheet and
// note across all your desks (semantic retrieval + citations, streamed live,
// honest when it finds nothing). One component, one behaviour, everywhere.
//
// Surface adapters are optional:
//  - getDocText: the current surface's text, enabling a "This document" scope.
//    Omitted → only whole-workspace scope (no toggle).
//  - onInsert: drop the answer into the surface (docs). Omitted → a Copy button.

interface WsSource {
  docId: string
  title: string
  docType: string
  cited: boolean
}

const OPENABLE_DOC_TYPES = new Set(['doc', 'sheet', 'slides', 'map', 'design'])

export default function WorkspaceAsk({
  getDocText,
  onInsert
}: {
  getDocText?: () => string
  onInsert?: (text: string) => void
}): JSX.Element {
  const goDocument = useViewStore((s) => s.goDocument)
  const [scope, setScope] = useState<'workspace' | 'doc'>('workspace')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [thread, setThread] = useState<
    Array<{ question: string; answer: string; sources: WsSource[]; proposals: ActionProposal[] }>
  >([])
  // Per-proposal apply state, keyed by proposal id: applying → done/failed.
  const [applied, setApplied] = useState<Record<string, 'applying' | 'done' | 'failed'>>({})
  const [dismissed, setDismissed] = useState<Record<string, true>>({})
  const historyRef = useRef<Array<{ question: string; answer: string }>>([])

  async function applyOne(p: ActionProposal): Promise<void> {
    if (applied[p.id]) return
    setApplied((m) => ({ ...m, [p.id]: 'applying' }))
    try {
      const r = await applyProposal(p, { activeTaskId: null })
      setApplied((m) => ({ ...m, [p.id]: r.ok ? 'done' : 'failed' }))
    } catch {
      setApplied((m) => ({ ...m, [p.id]: 'failed' }))
    }
  }

  const STARTERS = [
    'Summarise what my workspace already says about this.',
    'What deadlines and dates are coming up across my work?',
    'Given everything on my plate, what should I focus on and schedule this week?'
  ]

  async function ask(question: string): Promise<void> {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    setQ('')
    setThread((t) => [...t, { question: text, answer: '', sources: [], proposals: [] }])
    const requestId = crypto.randomUUID()
    try {
      const docContext = scope === 'doc' && getDocText ? { text: getDocText() } : null
      const res = await window.api.workspace.askStream(
        text,
        historyRef.current.slice(-4),
        requestId,
        (delta) =>
          setThread((t) => {
            if (!t.length) return t
            const copy = [...t]
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { ...last, answer: last.answer + delta }
            return copy
          }),
        docContext
      )
      if (!res.ok) {
        setThread((t) => t.slice(0, -1))
        setError(
          res.needsApiKey
            ? 'Add your Anthropic API key in Settings → AI to let the assistant read across your whole workspace.'
            : res.error ?? 'Could not answer that.'
        )
        return
      }
      const answer = res.answer ?? ''
      setThread((t) => {
        const copy = [...t]
        copy[copy.length - 1] = {
          question: text,
          answer,
          sources: (res.sources ?? []).map((s) => ({ docId: s.docId, title: s.title, docType: s.docType, cited: s.cited })),
          proposals: res.proposals ?? []
        }
        return copy
      })
      historyRef.current.push({ question: text, answer })
    } catch (e) {
      setThread((t) => t.slice(0, -1))
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, i: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(i)
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--accent)/0.25)] bg-[rgb(var(--accent)/0.04)] p-3" data-testid="workspace-ask">
      <div className="flex items-center gap-1.5">
        <Icon name="hub" size={15} className="text-[rgb(var(--accent))]" />
        <span className="text-[12.5px] font-semibold text-[var(--ink-90)]">Ask your workspace</span>
      </div>
      <p className="text-[11px] text-[var(--ink-50)] leading-snug">
        Draws on every document, sheet and note across all your desks, and answers with citations.
      </p>

      {getDocText && (
        <div className="inline-flex self-start rounded-md border border-[var(--edge-soft)] overflow-hidden text-[10.5px]" data-testid="workspace-ask-scope">
          {(['workspace', 'doc'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-2 py-0.5 ${scope === s ? 'bg-[rgb(var(--accent))] text-white' : 'text-[var(--ink-60)] hover:bg-[var(--surface-sunken)]'}`}
              data-testid={`workspace-ask-scope-${s}`}
            >
              {s === 'workspace' ? 'Whole workspace' : 'This document'}
            </button>
          ))}
        </div>
      )}

      {thread.map((entry, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-base)] p-2" data-testid="workspace-ask-answer">
          <div className="text-[11.5px] font-medium text-[var(--ink-70)]">{entry.question}</div>
          <div className="whitespace-pre-wrap text-[12.5px] text-[var(--ink-90)] leading-relaxed">{entry.answer}</div>
          {entry.sources.some((s) => s.cited) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {entry.sources
                .filter((s) => s.cited)
                .map((s) => {
                  const openable = OPENABLE_DOC_TYPES.has(s.docType)
                  const cls = 'inline-flex items-center gap-1 rounded bg-[rgb(var(--accent)/0.1)] px-1.5 py-0.5 text-[10px] text-[rgb(var(--accent))]'
                  return openable ? (
                    <button key={s.docId} onClick={() => goDocument(s.docId)} className={`${cls} hover:bg-[rgb(var(--accent)/0.2)] cursor-pointer`} title={`Open ${s.docType}: ${s.title}`} data-testid="workspace-ask-source">
                      <Icon name="open_in_new" size={10} />
                      {s.title || 'Untitled'}
                    </button>
                  ) : (
                    <span key={s.docId} className={cls} title={`Source: ${s.docType}`} data-testid="workspace-ask-source">
                      <Icon name="description" size={10} />
                      {s.title || 'Untitled'}
                    </span>
                  )
                })}
            </div>
          )}
          {entry.answer && (
            <div className="flex items-center gap-3 mt-0.5">
              {onInsert && (
                <button onClick={() => onInsert(entry.answer)} className="inline-flex items-center gap-1 text-[11px] text-[rgb(var(--accent))] hover:underline" data-testid="workspace-ask-insert">
                  <Icon name="add" size={12} /> Insert
                </button>
              )}
              <button onClick={() => void copy(entry.answer, i)} className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-60)] hover:text-[var(--ink-90)]" data-testid="workspace-ask-copy">
                <Icon name="content_copy" size={12} /> {copied === i ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {entry.proposals.some((p) => !dismissed[p.id]) && (
            <div className="flex flex-col gap-1 pt-1 mt-0.5 border-t border-[var(--edge-soft)]" data-testid="workspace-ask-proposals">
              <div className="text-[10px] uppercase tracking-wide text-[var(--ink-50)]">I can create</div>
              {entry.proposals
                .filter((p) => !dismissed[p.id])
                .map((p) => {
                  const d = describeProposal(p)
                  const state = applied[p.id]
                  return (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-1.5" data-testid="workspace-ask-proposal">
                      <Icon name={d.icon} size={14} className="text-[rgb(var(--accent))] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] text-[var(--ink-90)] truncate">
                          <span className="text-[var(--ink-60)]">{d.verb}</span> {d.subject}
                        </div>
                        {p.reason && <div className="text-[10.5px] text-[var(--ink-50)] leading-snug truncate">{p.reason}</div>}
                      </div>
                      {state === 'done' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
                          <Icon name="check" size={13} /> Created
                        </span>
                      ) : state === 'failed' ? (
                        <span className="text-[11px] text-red-500 shrink-0">Failed</span>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void applyOne(p)}
                            disabled={state === 'applying'}
                            className="rounded-md bg-[rgb(var(--accent))] px-2 py-0.5 text-[11px] text-white disabled:opacity-50"
                            data-testid="workspace-ask-proposal-apply"
                          >
                            {state === 'applying' ? '…' : 'Create'}
                          </button>
                          <button
                            onClick={() => setDismissed((m) => ({ ...m, [p.id]: true }))}
                            className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--ink-50)] hover:text-[var(--ink-90)]"
                            title="Dismiss"
                            data-testid="workspace-ask-proposal-dismiss"
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      ))}

      {busy && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-50)]" data-testid="workspace-ask-busy">
          <Icon name="autorenew" size={13} className="animate-spin" />
          Reading across your workspace…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-300/60 bg-red-50/70 dark:bg-red-950/30 px-2.5 py-1.5 text-[11.5px] text-red-600 dark:text-red-300" data-testid="workspace-ask-error">
          {error}
        </div>
      )}

      {thread.length === 0 && !busy && (
        <div className="flex flex-col gap-1">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => void ask(s)} className="text-left text-[11.5px] text-[var(--ink-70)] rounded-md border border-dashed border-[var(--edge-soft)] px-2 py-1 hover:border-[rgb(var(--accent)/0.5)] hover:text-[var(--ink-90)]">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask(q)
          }}
          placeholder="Ask anything about your work…"
          data-testid="workspace-ask-input"
          className="flex-1 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-base)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[rgb(var(--accent))]"
        />
        <button onClick={() => void ask(q)} disabled={busy || !q.trim()} className="rounded-lg bg-[rgb(var(--accent))] px-2.5 py-1.5 text-white disabled:opacity-50" data-testid="workspace-ask-go" aria-label="Ask">
          <Icon name="send" size={13} />
        </button>
      </div>
    </div>
  )
}
