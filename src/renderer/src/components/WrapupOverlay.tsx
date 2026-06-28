import { useState } from 'react'
import Icon from './Icon'
import { useWrapupStore } from '../stores/wrapup'
import { applyProposal, describeProposal } from '../lib/actionExecutor'
import { useNodeStore } from '../stores/nodes'
import type { ActionProposal } from '@shared/types'

// End-of-conversation review. Mounted once at the app root. When a meeting or call
// ends with a recording, it shows the AI summary and the deliverables that came
// out of the conversation, which the user can create with one click. Honest
// throughout: a processing state while it works, a clear error (with a Settings
// pointer when a key is missing) if it cannot, and nothing fabricated.

export default function WrapupOverlay(): JSX.Element | null {
  const status = useWrapupStore((s) => s.status)
  const title = useWrapupStore((s) => s.title)
  const step = useWrapupStore((s) => s.step)
  const summary = useWrapupStore((s) => s.summary)
  const proposals = useWrapupStore((s) => s.proposals)
  const error = useWrapupStore((s) => s.error)
  const needsApiKey = useWrapupStore((s) => s.needsApiKey)
  const dismiss = useWrapupStore((s) => s.dismiss)

  const [applied, setApplied] = useState<Record<string, 'ok' | 'fail'>>({})
  const [busy, setBusy] = useState<string | null>(null)

  if (status === 'idle') return null

  async function apply(p: ActionProposal): Promise<void> {
    setBusy(p.id)
    const res = await applyProposal(p, { activeTaskId: useNodeStore.getState().activeTaskId, resolvedIds: new Map() })
    setApplied((prev) => ({ ...prev, [p.id]: res.ok ? 'ok' : 'fail' }))
    setBusy(null)
  }

  async function applyAll(): Promise<void> {
    for (const p of proposals) {
      if (applied[p.id] === 'ok') continue
      await apply(p)
    }
  }

  return (
    <div className="fixed inset-0 z-[210] bg-stone-900/40 backdrop-blur-[2px] flex items-start justify-center pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="w-[560px] max-w-[92vw] max-h-[78vh] flex flex-col rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl overflow-hidden" data-testid="wrapup-panel">
        <div className="px-5 py-3.5 border-b border-[var(--edge-soft)] flex items-center gap-2.5">
          <Icon name="summarize" size={18} className="text-rose-500" filled />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-[var(--ink-100)] truncate">{title || 'Conversation'}</h2>
            <p className="text-[11px] text-[var(--ink-50)]">Wrap-up</p>
          </div>
          <button onClick={dismiss} className="ml-auto p-1 rounded text-[var(--ink-50)] hover:text-[var(--ink-100)]" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {status === 'processing' && (
            <div className="flex items-center gap-2.5 py-8 text-[13px] text-[var(--ink-70)]" data-testid="wrapup-processing">
              <Icon name="progress_activity" size={18} className="text-[rgb(var(--accent))] animate-spin" />
              {step || 'Working…'}
            </div>
          )}

          {status === 'error' && (
            <div className="py-6 text-center" data-testid="wrapup-error">
              <Icon name="error" size={26} className="text-amber-500" />
              <p className="mt-2 text-[13px] text-[var(--ink-80)] max-w-sm mx-auto leading-relaxed">{error}</p>
              {needsApiKey && <p className="mt-2 text-[11.5px] text-[var(--ink-50)]">Settings → AI → API keys</p>}
            </div>
          )}

          {status === 'review' && (
            <>
              <section>
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-1.5">Summary</h3>
                {summary ? (
                  <p className="text-[13px] text-[var(--ink-90)] leading-relaxed whitespace-pre-wrap" data-testid="wrapup-summary">{summary}</p>
                ) : (
                  <p className="text-[12.5px] text-[var(--ink-50)]">No summary was produced for this conversation.</p>
                )}
              </section>

              <section className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
                    Deliverables{proposals.length ? ` (${proposals.length})` : ''}
                  </h3>
                  {proposals.length > 1 && (
                    <button onClick={() => void applyAll()} data-testid="wrapup-create-all" className="text-[12px] text-[rgb(var(--accent))] hover:underline">
                      Create all
                    </button>
                  )}
                </div>
                {proposals.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ink-50)]">Nothing actionable came out of this conversation.</p>
                ) : (
                  <div className="space-y-2">
                    {proposals.map((p) => {
                      const d = describeProposal(p)
                      const state = applied[p.id]
                      return (
                        <div key={p.id} className="flex items-start gap-2.5 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-base)] px-3 py-2.5" data-testid={`wrapup-proposal-${p.id}`}>
                          <Icon name={d.icon} size={16} className="text-[var(--ink-50)] mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] text-[var(--ink-100)]"><span className="font-medium">{d.verb}</span> · {d.subject}</p>
                            {'reason' in p && p.reason && <p className="mt-0.5 text-[11px] text-[var(--ink-50)] leading-snug">{p.reason}</p>}
                          </div>
                          {state === 'ok' ? (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[11.5px] text-emerald-600 dark:text-emerald-400">
                              <Icon name="check_circle" size={14} filled /> Created
                            </span>
                          ) : (
                            <button
                              onClick={() => void apply(p)}
                              disabled={busy === p.id}
                              data-testid={`wrapup-apply-${p.id}`}
                              className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-[rgb(var(--accent))] text-white text-[11.5px] font-medium hover:bg-[rgb(var(--accent-hover))] disabled:opacity-50"
                            >
                              {busy === p.id ? '…' : state === 'fail' ? 'Retry' : 'Create'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--edge-soft)] flex justify-end">
          <button onClick={dismiss} data-testid="wrapup-done" className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[var(--surface-sunken)] text-[12.5px] text-[var(--ink-90)] hover:bg-[var(--surface-base)]">
            {status === 'review' ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
