import { useMemo, useState } from 'react'
import type { ChatMessage, FbNode } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import Icon from './Icon'
import { setAIRailCollapsed, useAIRailCollapsed } from '../lib/chromeState'

interface Props {
  // Project context for the workspace health ring + suggestion targets.
  // When null (e.g. home view or all-tasks), the rail still renders but
  // scopes to "the whole workspace".
  projectId: string | null
}

// CanvasAIAssistantRail — floating panel docked to the right edge of the
// canvas. Mirrors the 2.0 mockup's "AI Assistant" rail:
//   - Workspace Health ring with N% On Track + bulleted dimension flags
//   - Next Best Actions list with click-to-do shortcuts
//   - AI Suggestions list with per-row Generate buttons
//   - Ask-anything input at the bottom
//
// The rail is collapsible (chevron at the top) so it doesn't permanently
// eat 320px of canvas. State persists in localStorage so the user's
// preference survives reloads.

// (collapsed state moved to lib/chromeState — kept here as documentation
// of the storage key for grep-friendliness: AI_RAIL_LS_KEY = 'fb.ai-rail.collapsed')

interface HealthSummary {
  pct: number
  dims: Array<{ label: string; status: 'ok' | 'warn' | 'unknown' }>
}

interface NextAction {
  id: string
  label: string
  nodeId?: string
}

interface Suggestion {
  id: string
  label: string
  prompt: string
}

function buildHealthSummary(
  nodes: FbNode[],
  projectId: string | null
): HealthSummary {
  // Scope filter — when projectId is set, restrict to direct/descendant nodes.
  const inScope = (n: FbNode): boolean => {
    if (!projectId) return true
    if (n.id === projectId) return true
    let cur: FbNode | undefined = n
    while (cur && cur.parentId) {
      if (cur.parentId === projectId) return true
      cur = nodes.find((x) => x.id === cur!.parentId)
    }
    return false
  }
  const tasks = nodes.filter((n) => n.kind === 'task' && !n.archived && inScope(n))
  const open = tasks.filter((t) => t.status !== 'done').length
  const done = tasks.length - open
  const pct = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100)

  // Dimension flags — generic enough for any workspace. Each is binary
  // ok / warn / unknown so the rail reads at a glance.
  const overdue = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate != null && t.dueDate < Date.now()
  ).length
  const stale = nodes.filter((n) => {
    if (n.kind !== 'folder') return false
    if (!inScope(n)) return false
    const lastChild = nodes
      .filter((c) => c.parentId === n.id && !c.archived)
      .reduce((max, c) => Math.max(max, c.updatedAt ?? c.createdAt), 0)
    const reference = Math.max(n.updatedAt ?? n.createdAt, lastChild)
    return Date.now() - reference > 14 * 86_400_000
  }).length
  const dims: HealthSummary['dims'] = [
    { label: 'On schedule', status: overdue === 0 ? 'ok' : 'warn' },
    { label: 'Folders moving', status: stale === 0 ? 'ok' : 'warn' },
    { label: 'Tasks closing', status: done > 0 ? 'ok' : 'unknown' },
    { label: 'Scope contained', status: open < 30 ? 'ok' : 'warn' }
  ]
  return { pct, dims }
}

function buildNextActions(
  nodes: FbNode[],
  projectId: string | null
): NextAction[] {
  const inScope = (n: FbNode): boolean =>
    !projectId ||
    n.id === projectId ||
    (n.parentId != null && n.parentId === projectId)
  const tasks = nodes.filter(
    (n) => n.kind === 'task' && !n.archived && n.status !== 'done' && inScope(n)
  )
  // Prioritise overdue > due-today > smallest-time-since-touched.
  const now = Date.now()
  tasks.sort((a, b) => {
    const aOver = a.dueDate != null && a.dueDate < now ? 0 : 1
    const bOver = b.dueDate != null && b.dueDate < now ? 0 : 1
    if (aOver !== bOver) return aOver - bOver
    const aDue = a.dueDate ?? Infinity
    const bDue = b.dueDate ?? Infinity
    if (aDue !== bDue) return aDue - bDue
    return (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt)
  })
  return tasks.slice(0, 4).map((t) => ({
    id: t.id,
    label: t.title || '(untitled task)',
    nodeId: t.id
  }))
}

const STATIC_SUGGESTIONS: Suggestion[] = [
  {
    id: 'sug-interview',
    label: 'Create user interview script',
    prompt:
      'Generate a short user interview script (8 questions) for the most active project in my workspace. Skip platitudes; ask things that surface real pain.'
  },
  {
    id: 'sug-roadmap',
    label: 'Build MVP roadmap',
    prompt:
      'Look at my open tasks and propose a 4-week MVP roadmap. Group tasks by week, flag dependencies, and call out anything risky.'
  },
  {
    id: 'sug-swot',
    label: 'SWOT Analysis',
    prompt:
      'Run a quick SWOT analysis on the active project based on what you can see in the workspace. 2-3 bullets per quadrant.'
  }
]

export default function CanvasAIAssistantRail({ projectId }: Props): JSX.Element {
  // Collapsed state lives in lib/chromeState so the pinned-layer maths
  // (which need to reserve right-edge inset when rail is open) and any
  // other chrome-aware component subscribe to the same source of truth.
  // Toggling here re-renders Canvas, which recomputes pin positions.
  const collapsed = useAIRailCollapsed()
  const setCollapsed = setAIRailCollapsed
  const [busy, setBusy] = useState<string | null>(null) // id of running suggestion
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<{ id: string; text: string } | null>(null)
  const [input, setInput] = useState('')
  const nodes = useNodeStore((s) => s.nodes)
  const goTask = useNodeStore((s) => s.setActive)
  const ringRadius = 32
  const ringStroke = 6
  const ringC = 2 * Math.PI * ringRadius

  const health = useMemo(
    () => buildHealthSummary(nodes, projectId),
    [nodes, projectId]
  )
  const nextActions = useMemo(
    () => buildNextActions(nodes, projectId),
    [nodes, projectId]
  )

  async function runPrompt(id: string, prompt: string): Promise<void> {
    if (busy) return
    setBusy(id)
    setError(null)
    setResponse(null)
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are PlexiDesk\'s in-canvas suggestion assistant. Return ONE short, immediately-actionable response in 3-6 sentences. No preambles.',
          ts: Date.now()
        },
        { role: 'user', content: prompt, ts: Date.now() }
      ]
      const res = await window.api.chat.send({ taskId: null, messages })
      if (!res.ok) {
        setError(
          res.needsApiKey
            ? 'Add your Anthropic API key in Settings to use the assistant.'
            : res.error || 'Could not reach the model.'
        )
        return
      }
      setResponse({ id, text: res.message?.content ?? '' })
    } catch (err) {
      setError(`Something went wrong: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute top-3 right-3 z-30 h-8 w-8 rounded-md fb-glass-chrome border border-[color:var(--glass-chrome-border)] inline-flex items-center justify-center text-accent hover:brightness-110 shadow-md"
        title="Show AI Assistant"
        aria-label="Show AI Assistant"
      >
        <Icon name="auto_awesome" size={14} />
      </button>
    )
  }

  const dashPct = (health.pct / 100) * ringC

  return (
    <aside className="absolute top-3 right-3 bottom-3 z-30 w-[280px] fb-glass-chrome rounded-xl border border-[color:var(--glass-chrome-border)] shadow-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--glass-chrome-border)]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ink-90)]">
          <Icon name="auto_awesome" size={13} className="text-accent" />
          <span>AI Assistant</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="h-5 w-5 inline-flex items-center justify-center text-[var(--ink-50)] hover:text-[var(--ink-100)]"
          title="Hide assistant"
          aria-label="Hide assistant"
        >
          <Icon name="close" size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Workspace Health ring */}
        <section>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
            Workspace Health
          </div>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <svg width={80} height={80} viewBox="0 0 80 80" className="-rotate-90">
                <circle
                  cx={40}
                  cy={40}
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={ringStroke}
                  className="text-[var(--ink-30)]/40"
                />
                <circle
                  cx={40}
                  cy={40}
                  r={ringRadius}
                  fill="none"
                  stroke="rgb(var(--accent))"
                  strokeWidth={ringStroke}
                  strokeLinecap="round"
                  strokeDasharray={ringC}
                  className="fb-ring-grow"
                  style={
                    {
                      transition: 'stroke-dashoffset 420ms ease-out',
                      strokeDashoffset: ringC - dashPct,
                      '--ring-circumference': ringC
                    } as React.CSSProperties
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[14px] font-semibold tabular-nums text-[var(--ink-100)] leading-none">
                  {health.pct}%
                </div>
                <div className="text-[8px] uppercase tracking-wider text-[var(--ink-50)] mt-0.5">
                  on track
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-1">
              {health.dims.map((d) => (
                <li
                  key={d.label}
                  className="flex items-center gap-1.5 text-[10px] text-[var(--ink-70)]"
                >
                  <Icon
                    name={
                      d.status === 'ok'
                        ? 'check'
                        : d.status === 'warn'
                          ? 'priority_high'
                          : 'circle'
                    }
                    size={10}
                    className={
                      d.status === 'ok'
                        ? 'text-emerald-500'
                        : d.status === 'warn'
                          ? 'text-amber-500'
                          : 'text-[var(--ink-40)]'
                    }
                  />
                  <span>{d.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Next Best Actions */}
        <section>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
            Next Best Actions
          </div>
          {nextActions.length === 0 ? (
            <div className="text-[11px] text-[var(--ink-50)] italic">
              All clear — pick up the next thing whenever you're ready.
            </div>
          ) : (
            <ul className="space-y-1">
              {nextActions.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      if (a.nodeId) goTask(a.nodeId)
                    }}
                    className="w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-accent/10 text-[11px] text-[var(--ink-70)]"
                  >
                    <Icon name="add" size={11} className="text-accent" />
                    <span className="truncate flex-1">{a.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* AI Suggestions */}
        <section>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
            AI Suggestions
          </div>
          <ul className="space-y-1.5">
            {STATIC_SUGGESTIONS.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-1.5 p-1.5 rounded-md bg-[var(--surface-sunken)]/40 border border-[var(--edge-soft)]/60"
              >
                <span className="text-[11px] text-[var(--ink-70)] flex-1 truncate">
                  {s.label}
                </span>
                <button
                  onClick={() => void runPrompt(s.id, s.prompt)}
                  disabled={busy === s.id}
                  className="text-[10px] text-accent font-medium hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
                >
                  {busy === s.id ? 'Thinking…' : 'Generate'}
                  {busy !== s.id && <Icon name="arrow_forward" size={10} />}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {error && (
          <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[10px] text-amber-800 dark:text-amber-300">
            {error}
          </div>
        )}
        {response && (
          <div className="p-2.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--edge-soft)] text-[11px] text-[var(--ink-70)] leading-relaxed whitespace-pre-wrap">
            {response.text}
          </div>
        )}
      </div>

      {/* Bottom: Ask anything input */}
      <div className="border-t border-[color:var(--glass-chrome-border)] p-2 flex items-center gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && busy === null) {
              e.preventDefault()
              void runPrompt('ad-hoc', input)
              setInput('')
            }
          }}
          placeholder="Ask anything…"
          className="flex-1 px-2.5 py-1.5 bg-[var(--surface-sunken)]/40 border border-[var(--edge-soft)]/60 rounded text-[11px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => {
            if (!input.trim() || busy !== null) return
            void runPrompt('ad-hoc', input)
            setInput('')
          }}
          disabled={!input.trim() || busy !== null}
          className="h-[26px] w-[26px] inline-flex items-center justify-center rounded bg-accent text-white hover:brightness-110 disabled:opacity-50"
          aria-label="Send"
        >
          <Icon name="send" size={11} />
        </button>
      </div>
    </aside>
  )
}
