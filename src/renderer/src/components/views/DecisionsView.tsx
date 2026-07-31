import { useCallback, useEffect, useState } from 'react'
import type { Decision } from '@shared/decision'
import { DashboardHeader } from '../plexi'
import Icon from '../Icon'
import { useViewStore } from '../../stores/view'
import { useNodeStore } from '../../stores/nodes'

// PlexiBrain > Decisions (spec §37). Every Decision in one place, with a live
// at-risk status: a Decision is at risk when an Object it references has a material
// change since the user's last review, the same signal that turns a widget's frame
// red. Decisions are created by flagging a widget (right-click > Flag as a
// decision); this panel is where they are reviewed and retired.

interface Row {
  decision: Decision
  atRisk: boolean
  riskyObjectIds: string[]
}

const STATE_LABEL: Record<string, string> = {
  proposed: 'Proposed',
  under_review: 'Under review',
  approved: 'Approved',
  implemented: 'Implemented',
  superseded: 'Superseded',
  cancelled: 'Cancelled',
  archived: 'Archived'
}

export default function DecisionsView(): JSX.Element {
  const [rows, setRows] = useState<Row[] | null>(null)
  const goTask = useViewStore((s) => s.goTask)
  const setActive = useNodeStore((s) => s.setActive)

  const refresh = useCallback(async () => {
    const api = window.api?.decisions
    if (!api?.withRisk) {
      setRows([])
      return
    }
    try {
      setRows(await api.withRisk())
    } catch {
      setRows([]) // honest empty rather than a fabricated list
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openDesk = (deskId: string): void => {
    setActive(deskId)
    goTask(deskId)
  }

  const cancel = async (id: string): Promise<void> => {
    await window.api?.decisions?.cancel?.(id)
    await refresh()
  }

  const atRiskCount = rows?.filter((r) => r.atRisk).length ?? 0

  return (
    <div
      className="h-full w-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]"
      data-testid="decisions-view"
    >
      <div className="max-w-4xl mx-auto px-6 py-6">
        <DashboardHeader
          title="Decisions"
          subtitle="What has been decided, and what a change would put at risk."
        />

        {rows === null ? (
          <div className="flex items-center gap-2 px-3 py-10 text-[13px] text-[var(--ink-70)]">
            <Icon name="progress_activity" size={16} className="text-[rgb(var(--accent))] animate-spin" /> Loading
            decisions
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-16 text-center" data-testid="decisions-empty">
            <Icon name="gavel" size={30} className="text-[var(--ink-30)]" />
            <p className="mt-3 text-[14px] text-[var(--ink-70)] max-w-md mx-auto leading-relaxed">
              No decisions yet. Right-click a widget and choose &ldquo;Flag as a decision&rdquo; to record
              what was decided. A later change to anything it depends on then raises decision risk here and
              turns that object&rsquo;s frame red.
            </p>
          </div>
        ) : (
          <>
            {atRiskCount > 0 && (
              <p className="mb-3 text-[13px] text-rose-600 dark:text-rose-400" data-testid="decisions-at-risk-summary">
                <Icon name="warning" size={14} className="inline align-[-2px] mr-1" />
                {atRiskCount} {atRiskCount === 1 ? 'decision needs' : 'decisions need'} a look, something they
                depend on changed.
              </p>
            )}
            <ul className="space-y-2">
              {rows.map(({ decision, atRisk, riskyObjectIds }) => (
                <li
                  key={decision.id}
                  className="rounded-2xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-4"
                  data-testid="decision-row"
                  data-at-risk={atRisk}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-[var(--ink-100)] truncate">{decision.title}</h3>
                      {decision.decisionStatement && decision.decisionStatement !== decision.title && (
                        <p className="mt-0.5 text-[13px] text-[var(--ink-70)] line-clamp-2">
                          {decision.decisionStatement}
                        </p>
                      )}
                    </div>
                    {atRisk ? (
                      <span
                        className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        title={`${riskyObjectIds.length} linked ${riskyObjectIds.length === 1 ? 'object' : 'objects'} changed since your last review`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> At risk
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Current
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-60)]">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="person" size={13} />
                      {decision.decisionOwner.displayName ?? decision.decisionOwner.id}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="label" size={13} />
                      {STATE_LABEL[decision.state] ?? decision.state}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="link" size={13} />
                      {decision.relatedObjectIds.length} linked{' '}
                      {decision.relatedObjectIds.length === 1 ? 'object' : 'objects'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {decision.affectedDeskIds[0] && (
                      <button
                        type="button"
                        onClick={() => openDesk(decision.affectedDeskIds[0])}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--edge-soft)] px-2.5 py-1 text-[12px] text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]"
                        data-testid="decision-open-desk"
                      >
                        <Icon name="open_in_new" size={13} /> Open desk
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void cancel(decision.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--edge-soft)] px-2.5 py-1 text-[12px] text-[var(--ink-60)] hover:text-rose-600 hover:border-rose-400/50"
                      data-testid="decision-cancel"
                    >
                      <Icon name="close" size={13} /> Retire
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
