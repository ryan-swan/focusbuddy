import { useEffect } from 'react'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { useContextHealthStore, needsAttention } from '../stores/contextHealth'
import ContextHealthBadge from './ContextHealthBadge'
import Icon from './Icon'

// The Context Health strip on a desk header (plexi-4.0). It makes the platform's
// contextual awareness visible in two honest ways: a "since your last visit" line
// for this desk, and the confirmed related desks with their own health so a change
// somewhere related surfaces here. Renders nothing when there is genuinely nothing
// to say — a calm desk stays calm (spec §20.3, and the simplicity rule).

interface Props {
  deskId: string
  // 'header' sits inline under a desk title (transparent). 'chrome' floats on the
  // canvas and wears a glass pill so it reads over desk content.
  variant?: 'header' | 'chrome'
}

export default function ContextHealthStrip({ deskId, variant = 'header' }: Props): JSX.Element | null {
  const lastVisit = useContextHealthStore((s) => s.lastVisit[deskId])
  const relatedIds = useContextHealthStore((s) => s.relatedById[deskId])
  const byId = useContextHealthStore((s) => s.byId)
  const refreshMany = useContextHealthStore((s) => s.refreshMany)
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goProject = useViewStore((s) => s.goProject)

  const related = relatedIds ?? []
  useEffect(() => {
    if (related.length) void refreshMany(related)
  }, [related.join(','), refreshMany])

  // "Since your last visit": the snapshot captured when this desk was opened,
  // before it was marked reviewed. Only meaningful if something had actually
  // changed.
  const caughtUp = lastVisit && lastVisit.changedEventCount > 0 ? lastVisit : null

  // Related desks worth surfacing: those whose health needs attention.
  const relatedRows = related
    .map((id) => ({ id, node: nodes.find((n) => n.id === id), snap: byId[id] }))
    .filter((r) => r.node && r.snap && needsAttention(r.snap.state))

  if (!caughtUp && relatedRows.length === 0) return null

  const className =
    variant === 'chrome'
      ? 'fb-glass-chrome rounded-lg px-3 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.06] dark:ring-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] max-w-[520px]'
      : 'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]'

  return (
    <div data-testid="context-health-strip" className={className}>
      {caughtUp && (
        <span className="inline-flex items-center gap-1.5 text-[var(--ink-70)]">
          <Icon name="update" size={13} className="text-[var(--ink-50)]" />
          Caught you up on {caughtUp.changedEventCount} change{caughtUp.changedEventCount === 1 ? '' : 's'} since your last visit
          <ContextHealthBadge state={caughtUp.state} />
          {caughtUp.decisionsAtRisk.length > 0 && (
            <span className="text-rose-600 dark:text-rose-400">
              affecting {caughtUp.decisionsAtRisk.length} decision{caughtUp.decisionsAtRisk.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
      )}
      {relatedRows.length > 0 && (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span className="text-[var(--ink-50)] inline-flex items-center gap-1">
            <Icon name="hub" size={13} />
            Related
          </span>
          {relatedRows.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setActive(r.id)
                goProject(r.id)
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--edge-soft)] px-2 py-0.5 hover:bg-[var(--surface-hover)] transition-colors"
              title={`Open ${r.node!.title}`}
            >
              <span className="truncate max-w-[140px] text-[var(--ink-100)]">{r.node!.title}</span>
              <ContextHealthBadge state={r.snap!.state} />
            </button>
          ))}
        </span>
      )}
    </div>
  )
}
