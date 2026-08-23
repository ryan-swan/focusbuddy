import { useEffect, useState } from 'react'
import Icon from './Icon'
import ProposalCards from './ProposalCards'
import { useWrapupStore } from '../stores/wrapup'
import { useNodeStore } from '../stores/nodes'
import type { AppliedProposal } from '@shared/types'
import type { FileEntry } from '@shared/fields'

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
  const folderId = useWrapupStore((s) => s.folderId)
  const folderName = useWrapupStore((s) => s.folderName)
  const dismiss = useWrapupStore((s) => s.dismiss)

  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const [applied, setApplied] = useState<Record<string, AppliedProposal>>({})
  const [consumed, setConsumed] = useState<Set<string>>(new Set())
  // Where the deliverables the user creates should be filed. Defaults to the
  // meeting folder; the picker lets them choose another top-level folder or the
  // workspace root. Documents are filed there; other proposals are unaffected.
  const [dest, setDest] = useState<string | null>(null)
  const [folders, setFolders] = useState<FileEntry[]>([])

  useEffect(() => {
    if (status !== 'review') return
    setDest(folderId)
    void window.api.fileManager
      .list(null)
      .then((entries) => setFolders(entries.filter((e) => e.kind === 'folder')))
      .catch(() => setFolders([]))
  }, [status, folderId])

  // Escape mirrors the X and the backdrop: the wrap-up never holds the screen.
  useEffect(() => {
    if (status === 'idle') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      dismiss()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [status, dismiss])

  if (status === 'idle') return null

  return (
    <div className="fb-scrim fixed inset-0 z-[210] flex items-start justify-center pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
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

              {folderName && (
                <section className="mt-4 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-base)] px-3 py-2.5" data-testid="wrapup-folder">
                  <p className="text-[12px] text-[var(--ink-80)] flex items-center gap-1.5">
                    <Icon name="folder" size={14} className="text-[rgb(var(--accent))]" />
                    Transcript saved in <span className="font-medium">{folderName}</span>.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-[11.5px] text-[var(--ink-60)]">
                    <span className="shrink-0">Add deliverables to</span>
                    <select
                      value={dest ?? ''}
                      onChange={(e) => setDest(e.target.value || null)}
                      className="flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-2 py-1 text-[12px] text-[var(--ink-90)]"
                      data-testid="wrapup-destination"
                    >
                      {folderId && <option value={folderId}>{folderName} (this meeting)</option>}
                      <option value="">Workspace root</option>
                      {folders
                        .filter((f) => f.id !== folderId)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </section>
              )}

              <section className="mt-5" data-testid="wrapup-deliverables">
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-2">
                  Deliverables{proposals.length ? ` (${proposals.length})` : ''}
                </h3>
                {proposals.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ink-50)]">Nothing actionable came out of this conversation.</p>
                ) : (
                  // The shared approval-card surface (standard accept/approve),
                  // filing deliverables into the chosen destination folder. Fixes
                  // the old per-click fresh-Map bug: resolvedIds now batch correctly.
                  <ProposalCards
                    proposals={proposals.filter((p) => !consumed.has(p.id))}
                    activeTaskId={activeTaskId}
                    destinationFolderId={dest}
                    appliedProposals={applied}
                    onApplied={(id, a) => setApplied((prev) => ({ ...prev, [id]: a }))}
                    onConsume={(id) => setConsumed((prev) => new Set(prev).add(id))}
                  />
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
