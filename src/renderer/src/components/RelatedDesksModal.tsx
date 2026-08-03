import { useEffect, useMemo, useState } from 'react'
import { useRelatedDesksStore } from '../stores/relatedDesks'
import { useNodeStore } from '../stores/nodes'
import Icon from './Icon'

// Lets the user say which desks are related to this one. Relatedness is
// user-driven on purpose: the brain scopes what it reads for a desk to this desk
// plus the desks named here, instead of assuming everything in the org is
// related. Two desks sharing an account means nothing until the user links them.
export default function RelatedDesksModal(): JSX.Element | null {
  const open = useRelatedDesksStore((s) => s.open)
  const taskId = useRelatedDesksStore((s) => s.taskId)
  const hide = useRelatedDesksStore((s) => s.hide)
  const nodes = useNodeStore((s) => s.nodes)

  const [relatedIds, setRelatedIds] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !taskId) return
    let cancelled = false
    void window.api.nodes.listRelated(taskId).then((ids) => {
      if (!cancelled) setRelatedIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [open, taskId])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') hide()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, hide])

  const thisNode = nodes.find((n) => n.id === taskId)
  const desks = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === 'task' && n.id !== taskId)
        .filter((n) => (filter ? (n.title || '').toLowerCase().includes(filter.toLowerCase()) : true))
        .sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    [nodes, taskId, filter]
  )

  if (!open || !taskId) return null

  const related = new Set(relatedIds)

  async function toggle(otherId: string): Promise<void> {
    if (!taskId || busy) return
    setBusy(true)
    try {
      const ids = related.has(otherId)
        ? await window.api.nodes.unrelate(taskId, otherId)
        : await window.api.nodes.relate(taskId, otherId)
      setRelatedIds(ids)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
      onClick={hide}
      data-testid="related-desks-modal"
    >
      <div
        className="fb-glass-panel w-[440px] max-h-[70vh] flex flex-col rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--edge-soft)] flex items-center gap-2">
          <Icon name="hub" size={18} className="text-[rgb(var(--accent))]" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[var(--ink-100)]">Related desks</div>
            <div className="text-[11px] text-[var(--ink-50)] truncate">
              What the brain reads alongside {thisNode?.title || 'this desk'}
            </div>
          </div>
          <button
            onClick={hide}
            className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface-sunken)] text-[var(--ink-50)]"
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <p className="px-4 pt-3 text-[11px] text-[var(--ink-60)] leading-snug">
          The brain answers about this desk using this desk plus the desks you tick here. Desks are
          not related just because they share your account, only because you say they are.
        </p>

        <div className="px-4 py-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter desks"
            className="w-full h-8 px-2.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--edge-soft)] text-[12px] outline-none focus:border-[rgb(var(--accent))]"
            data-testid="related-desks-filter"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {desks.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-[var(--ink-50)]">No other desks yet.</div>
          ) : (
            desks.map((n) => {
              const on = related.has(n.id)
              return (
                <button
                  key={n.id}
                  onClick={() => void toggle(n.id)}
                  disabled={busy}
                  data-testid={`related-desk-${n.id}`}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors disabled:opacity-50 ${
                    on ? 'bg-[rgb(var(--accent)/0.12)]' : 'hover:bg-[var(--surface-sunken)]'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-md border ${
                      on
                        ? 'bg-[rgb(var(--accent))] border-transparent text-white'
                        : 'border-[var(--edge-firm)] text-transparent'
                    }`}
                  >
                    <Icon name="check" size={13} />
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[12.5px] text-[var(--ink-90)]">
                    {n.title || 'Untitled desk'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
