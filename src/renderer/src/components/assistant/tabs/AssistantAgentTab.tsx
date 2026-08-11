import { useState } from 'react'
import Icon from '../../Icon'
import ProposalCards from '../../ProposalCards'
import { useAgentLoop } from '../../../stores/agentLoop'
import { useNodeStore } from '../../../stores/nodes'
import { startAgentRun } from '../../../lib/agentRunner'

// The autonomous-agent surface: type a goal, the loop works it in rounds, applying
// safe changes itself and deferring anything consequential for your approval. The
// transcript shows exactly what happened each round (no fabricated success — every
// line is a real applied/failed/deferred outcome), and deferred actions surface as
// standard approval cards.

const STATUS_STYLE: Record<string, { label: string; cls: string; icon: string }> = {
  done: { label: 'Done', cls: 'text-emerald-600 dark:text-emerald-400', icon: 'check_circle' },
  blocked: { label: 'Stopped', cls: 'text-amber-600 dark:text-amber-400', icon: 'error' },
  need_input: { label: 'Needs you', cls: 'text-accent', icon: 'help' },
  working: { label: 'Working', cls: 'text-[var(--ink-60)]', icon: 'autorenew' }
}

export default function AssistantAgentTab(): JSX.Element {
  const [goal, setGoal] = useState('')
  const running = useAgentLoop((s) => s.running)
  const steps = useAgentLoop((s) => s.steps)
  const runGoal = useAgentLoop((s) => s.goal)
  const finalStatus = useAgentLoop((s) => s.finalStatus)
  const finalBlocker = useAgentLoop((s) => s.finalBlocker)
  const pendingApprovals = useAgentLoop((s) => s.pendingApprovals)
  const reset = useAgentLoop((s) => s.reset)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const [approved, setApproved] = useState<Set<string>>(new Set())

  async function run(): Promise<void> {
    const g = goal.trim()
    if (!g || running) return
    setApproved(new Set())
    await startAgentRun(g)
  }

  const hasRun = steps.length > 0 || finalStatus !== null
  const remainingApprovals = pendingApprovals.filter((p) => !approved.has(p.id))

  return (
    <div className="h-full overflow-y-auto px-3 py-3 flex flex-col gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--ink-50)] mb-1">
          Autonomous agent
        </div>
        <div className="text-[11px] text-[var(--ink-60)] leading-snug">
          Give it a goal. It works in steps, applies safe changes itself, and asks
          your approval for anything consequential (sending, deleting, scheduling).
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void run()
            }
          }}
          disabled={running}
          rows={2}
          placeholder="e.g. Set up a lead tracker with columns and a research agent wired to it"
          className="w-full bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded-md px-2.5 py-2 text-[12px] text-[var(--ink-100)] focus:outline-none focus:border-accent resize-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--ink-40)]">Cmd+Enter to run</span>
          <div className="flex gap-1.5">
            {hasRun && !running && (
              <button
                onClick={() => {
                  reset()
                  setGoal('')
                  setApproved(new Set())
                }}
                className="text-[11px] px-2 py-1 rounded-md border border-[var(--edge-soft)] text-[var(--ink-60)] hover:bg-[var(--surface-sunken)]"
              >
                New goal
              </button>
            )}
            <button
              onClick={() => void run()}
              disabled={running || !goal.trim()}
              data-testid="agent-run"
              className="btn-primary !text-[12px] disabled:opacity-50"
            >
              <Icon name={running ? 'autorenew' : 'play_arrow'} size={13} className={running ? 'animate-spin' : ''} />
              <span>{running ? 'Working…' : 'Run'}</span>
            </button>
          </div>
        </div>
      </div>

      {runGoal && (
        <div className="text-[11px] text-[var(--ink-70)] bg-accent/5 border border-accent/20 rounded-md px-2.5 py-1.5">
          <span className="text-[var(--ink-50)]">Goal.</span> {runGoal}
        </div>
      )}

      {/* Round-by-round transcript — real outcomes only. */}
      {steps.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="agent-transcript">
          {steps.map((s) => (
            <div key={s.round} className="rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono text-[var(--ink-40)]">#{s.round + 1}</span>
                <span className="text-[12px] text-[var(--ink-90)] leading-snug">{s.narration}</span>
              </div>
              {s.outcomes.length > 0 && (
                <ul className="space-y-0.5 mt-1">
                  {s.outcomes.map((o, i) => (
                    <li key={i} className="flex items-start gap-1 text-[11px] leading-snug">
                      <Icon
                        name={o.ok ? 'check' : 'close'}
                        size={12}
                        className={o.ok ? 'text-emerald-600 dark:text-emerald-400 mt-0.5' : 'text-red-600 dark:text-red-400 mt-0.5'}
                      />
                      <span className="text-[var(--ink-70)]">
                        {o.kind}
                        {o.message ? ` — ${o.message}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.deferred.length > 0 && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Deferred for your approval: {s.deferred.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Final status. */}
      {!running && finalStatus && (
        <div className={`flex items-center gap-1.5 text-[12px] font-medium ${STATUS_STYLE[finalStatus]?.cls ?? ''}`}>
          <Icon name={STATUS_STYLE[finalStatus]?.icon ?? 'info'} size={15} />
          <span>{STATUS_STYLE[finalStatus]?.label ?? finalStatus}</span>
          {finalBlocker && <span className="text-[var(--ink-60)] font-normal">— {finalBlocker}</span>}
        </div>
      )}

      {/* Consequential actions the loop deferred — approve them here. */}
      {remainingApprovals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--ink-50)]">
            Waiting for your approval
          </div>
          <ProposalCards
            proposals={remainingApprovals}
            activeTaskId={activeTaskId}
            onConsume={(id) => setApproved((prev) => new Set(prev).add(id))}
          />
        </div>
      )}
    </div>
  )
}
