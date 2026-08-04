import { useEffect, useMemo, useState } from 'react'
import Icon from '../../Icon'
import type { FbNode, Widget } from '@shared/types'
import { parseAgent } from '../../../lib/deskAgent'
import { BUILT_IN_PROFILES } from '../../../lib/agentProfiles'
import { relTimeShort } from '../../../lib/activityFormat'
import { useViewStore } from '../../../stores/view'

// Assistant → Work tab (spec §5.3, §9). The only "AI is doing real work" surface
// reachable today is desk agents, so this honestly shows exactly that — every desk
// agent, its desk, whether it's active and its last real run. It does NOT claim a
// generic "recent AI actions" feed the system can't back (there is no aggregate
// work-run log yet). Labeled "Desk agents" so the scope is truthful.

function profileName(profileId?: string): string {
  return BUILT_IN_PROFILES.find((p) => p.id === profileId)?.name ?? 'Generalist'
}

export default function AssistantWorkTab(): JSX.Element {
  const goTask = useViewStore((s) => s.goTask)
  const [agents, setAgents] = useState<Widget[] | null>(null)
  const [nodes, setNodes] = useState<FbNode[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [ws, ns] = await Promise.all([window.api.widgets.listByKind('agent'), window.api.nodes.list()])
      if (!alive) return
      setAgents(ws)
      setNodes(ns)
    })()
    return () => {
      alive = false
    }
  }, [])

  const deskTitle = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n.title]))
    return (taskId: string): string => map.get(taskId) || 'Untitled desk'
  }, [nodes])

  const now = Date.now()

  return (
    <div className="h-full overflow-y-auto px-3 py-3" data-testid="assistant-tab-work">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold px-1 pb-1.5">
        Desk agents
      </div>
      {agents === null ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--ink-40)]">Loading your agents…</div>
      ) : agents.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--ink-50)]">
          No desk agents yet. Add an agent widget to a desk to put a standing AI worker to work; it shows up here.
        </div>
      ) : (
        <ul className="space-y-1">
          {agents.map((w) => {
            const cfg = parseAgent(w.content)
            const name = (w.title && w.title.trim()) || 'Untitled agent'
            return (
              <li key={w.id}>
                <button
                  onClick={() => goTask(w.taskId)}
                  data-testid={`assistant-work-${w.id}`}
                  title={cfg.instruction || undefined}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface-sunken)]"
                >
                  <Icon name="smart_toy" size={16} className="text-[rgb(var(--accent))] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[var(--ink-100)]">{name}</span>
                    <span className="block truncate text-[11px] text-[var(--ink-50)]">
                      {profileName(cfg.profileId)} on {deskTitle(w.taskId)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[10.5px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                      cfg.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--surface-sunken)] text-[var(--ink-50)]'
                    }`}
                  >
                    {cfg.enabled ? `Active, ${cfg.trigger}` : 'Paused'}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--ink-50)] fb-tabular w-14 text-right">
                    {cfg.lastRunAt ? relTimeShort(cfg.lastRunAt, now) : 'Never'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
