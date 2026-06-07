import { useEffect, useMemo, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'
import { useWidgetStore } from '../../stores/widgets'
import { useLinksStore } from '../../stores/links'
import {
  MIN_INTERVAL_SEC,
  parseAgent,
  serializeAgent,
  type AgentConfig,
  type AgentTrigger
} from '../../lib/deskAgent'
import { runAgent, useAgentRunStore } from '../../lib/deskAgentEngine'
import {
  allProfiles,
  resolveProfile,
  useAgentProfilesStore,
  type AgentProfile
} from '../../lib/agentProfiles'
import AgentProfileDialog from '../AgentProfileDialog'

// Desk agent — a standing AI worker on the canvas. Its inputs are the widgets
// wired INTO it; it runs its instruction over them and logs the result here.
//
// We keep only the EDITABLE fields in local state (instruction / trigger /
// interval / enabled) and render the run output + history straight from the
// widget content, which the engine writes. On save we merge our editable fields
// over the latest content so an in-flight run's log is never clobbered.

interface Props {
  widget: Widget
  inline?: boolean
}

type Editable = Pick<AgentConfig, 'instruction' | 'trigger' | 'intervalSec' | 'enabled' | 'profileId'>

function editableOf(c: AgentConfig): Editable {
  return {
    instruction: c.instruction,
    trigger: c.trigger,
    intervalSec: c.intervalSec,
    enabled: c.enabled,
    profileId: c.profileId
  }
}

const TRIGGERS: Array<{ value: AgentTrigger; label: string; icon: string }> = [
  { value: 'manual', label: 'Manual', icon: 'play_circle' },
  { value: 'onChange', label: 'On change', icon: 'bolt' },
  { value: 'interval', label: 'Interval', icon: 'schedule' }
]

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

export default function AgentWidget({ widget }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const links = useLinksStore((s) => s.links)
  const widgets = useWidgetStore((s) => s.widgets)
  const running = useAgentRunStore((s) => s.running[widget.id] ?? false)

  // Live config (output/history/lastError) read fresh each render.
  const cfg = parseAgent(widget.content)
  const [edit, setEdit] = useState<Editable>(() => editableOf(cfg))
  const lastSaved = useRef<string>(JSON.stringify(editableOf(cfg)))

  // Debounced save of editable fields, merged over the latest content.
  useEffect(() => {
    const snap = JSON.stringify(edit)
    if (snap === lastSaved.current) return
    const h = window.setTimeout(() => {
      lastSaved.current = snap
      const latest = parseAgent(
        useWidgetStore.getState().widgets.find((w) => w.id === widget.id)?.content
      )
      void update(widget.id, { content: serializeAgent({ ...latest, ...edit }) })
    }, 350)
    return () => window.clearTimeout(h)
  }, [edit, widget.id, update])

  // Adopt external edits to the editable fields (e.g. config changed elsewhere)
  // without disturbing what the user is typing right now.
  useEffect(() => {
    const incoming = JSON.stringify(editableOf(cfg))
    if (incoming !== lastSaved.current && incoming !== JSON.stringify(edit)) {
      lastSaved.current = incoming
      setEdit(editableOf(cfg))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.content])

  // Interval trigger — owned here so it only ticks while the widget is mounted.
  useEffect(() => {
    if (edit.trigger !== 'interval' || !edit.enabled) return
    const sec = Math.max(MIN_INTERVAL_SEC, edit.intervalSec)
    const h = window.setInterval(() => void runAgent(widget.id), sec * 1000)
    return () => window.clearInterval(h)
  }, [edit.trigger, edit.enabled, edit.intervalSec, widget.id])

  // The widgets wired INTO this agent (its inputs).
  const inputs = useMemo(() => {
    const ids = new Set(
      links.filter((l) => l.targetWidgetId === widget.id).map((l) => l.sourceWidgetId)
    )
    return widgets.filter((w) => ids.has(w.id) && !w.archived)
  }, [links, widgets, widget.id])

  // Widgets this agent FEEDS — its outgoing wires. A mirror wire out delivers
  // the agent's latest output into the target automatically after each run.
  const outputCount = useMemo(
    () => links.filter((l) => l.sourceWidgetId === widget.id).length,
    [links, widget.id]
  )

  const set = (patch: Partial<Editable>): void => setEdit((e) => ({ ...e, ...patch }))

  // ── Profile ("job description") ──────────────────────────────────────────
  const customProfiles = useAgentProfilesStore((s) => s.custom)
  const upsertProfile = useAgentProfilesStore((s) => s.upsert)
  const removeProfile = useAgentProfilesStore((s) => s.remove)
  const profile = resolveProfile(edit.profileId, customProfiles)
  const [profileMenu, setProfileMenu] = useState(false)
  const [profileDialog, setProfileDialog] = useState(false)

  const body = (
    <div
      className="h-full w-full flex flex-col bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200"
      onMouseDown={(e) => e.stopPropagation()}
      data-testid="agent-widget"
    >
      {/* Profile selector — the agent's role / expertise. */}
      <div className="relative px-2.5 pt-2 pb-1.5 border-b border-stone-200 dark:border-stone-800">
        <button
          onClick={() => setProfileMenu((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 hover:border-accent/50 bg-stone-50 dark:bg-stone-800 text-left"
          data-testid="agent-profile-button"
          title={profile.systemPrompt}
        >
          <Icon name={profile.icon} size={14} className="text-accent shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-medium truncate">{profile.name}</span>
            <span className="block text-[9px] text-stone-500 dark:text-stone-400 truncate">
              {profile.blurb}
            </span>
          </span>
          <Icon name="expand_more" size={14} className="text-stone-400 shrink-0" />
        </button>
        {profileMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setProfileMenu(false)} />
            <div className="absolute left-2.5 right-2.5 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1">
              {allProfiles(customProfiles).map((p) => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-800 ${
                    p.id === profile.id ? 'bg-accent/10' : ''
                  }`}
                  onClick={() => {
                    set({ profileId: p.id })
                    setProfileMenu(false)
                  }}
                  data-testid={`agent-profile-option-${p.id}`}
                >
                  <Icon name={p.icon} size={14} className="text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate">{p.name}</div>
                    <div className="text-[9px] text-stone-500 dark:text-stone-400 truncate">{p.blurb}</div>
                  </div>
                  {!p.builtIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (edit.profileId === p.id) set({ profileId: undefined })
                        removeProfile(p.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-600"
                      title="Delete profile"
                    >
                      <Icon name="delete" size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  setProfileMenu(false)
                  setProfileDialog(true)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 border-t border-stone-200 dark:border-stone-700 text-[11px] text-accent hover:bg-accent/5"
                data-testid="agent-profile-create"
              >
                <Icon name="add" size={14} />
                Create new profile…
              </button>
            </div>
          </>
        )}
      </div>

      {/* Instruction */}
      <div className="p-2.5 border-b border-stone-200 dark:border-stone-800">
        <textarea
          value={edit.instruction}
          onChange={(e) => set({ instruction: e.target.value })}
          placeholder="Standing instruction, e.g. keep a running summary of the wired notes"
          className="w-full h-12 resize-none bg-stone-50 dark:bg-stone-800 rounded-md px-2 py-1.5 text-[12px] leading-snug focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-stone-400"
          data-testid="agent-instruction"
        />
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400">
          <Icon name="cable" size={12} />
          <span data-testid="agent-input-count">
            {inputs.length === 0
              ? 'No inputs — wire widgets into this agent'
              : `${inputs.length} input${inputs.length === 1 ? '' : 's'}: ${inputs
                  .map((w) => w.title || w.kind)
                  .slice(0, 3)
                  .join(', ')}${inputs.length > 3 ? '…' : ''}`}
          </span>
          {outputCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-accent" data-testid="agent-output-count">
              <Icon name="arrow_forward" size={11} />
              feeds {outputCount}
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-2.5 py-2 flex items-center gap-1.5 border-b border-stone-200 dark:border-stone-800">
        <div className="grid grid-cols-3 gap-1 flex-1">
          {TRIGGERS.map((t) => (
            <button
              key={t.value}
              onClick={() => set({ trigger: t.value })}
              className={`flex items-center justify-center gap-1 py-1 rounded text-[10px] border transition-colors ${
                edit.trigger === t.value
                  ? 'border-accent bg-accent/10 text-stone-900 dark:text-stone-100'
                  : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              data-testid={`agent-trigger-${t.value}`}
              title={t.label}
            >
              <Icon name={t.icon} size={12} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2.5 py-1.5 flex items-center gap-2 border-b border-stone-200 dark:border-stone-800">
        {edit.trigger === 'interval' && (
          <label className="flex items-center gap-1 text-[10px] text-stone-600 dark:text-stone-400">
            every
            <input
              type="number"
              min={MIN_INTERVAL_SEC}
              value={edit.intervalSec}
              onChange={(e) =>
                set({ intervalSec: Math.max(MIN_INTERVAL_SEC, Number(e.target.value) || MIN_INTERVAL_SEC) })
              }
              className="w-12 px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[10px] focus:outline-none focus:border-accent"
              data-testid="agent-interval"
            />
            s
          </label>
        )}
        <label className="flex items-center gap-1 text-[10px] text-stone-600 dark:text-stone-400 cursor-pointer">
          <input
            type="checkbox"
            checked={edit.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="accent-accent"
            data-testid="agent-enabled"
          />
          Active
        </label>
        <div className="flex-1" />
        <button
          onClick={() => void runAgent(widget.id)}
          disabled={running}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent text-white text-[10px] disabled:opacity-60"
          data-testid="agent-run"
        >
          <Icon name={running ? 'hourglass_empty' : 'play_arrow'} size={12} />
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {/* Output / status */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {cfg.lastError ? (
          <div
            className="text-[11px] text-red-600 dark:text-red-400 flex items-start gap-1"
            data-testid="agent-error"
          >
            <Icon name="error" size={13} className="mt-0.5 shrink-0" />
            <span>{cfg.lastError}</span>
          </div>
        ) : cfg.lastOutput ? (
          <div className="text-[12px] leading-relaxed whitespace-pre-wrap" data-testid="agent-output">
            {cfg.lastOutput}
          </div>
        ) : (
          <div className="text-[11px] text-stone-400 dark:text-stone-500" data-testid="agent-output">
            {running ? 'Thinking…' : 'No output yet. Wire in some inputs, give an instruction, then Run.'}
          </div>
        )}
      </div>

      {/* Footer: last run + tiny history */}
      <div className="px-2.5 py-1 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-[9px] text-stone-400 dark:text-stone-500">
        <span data-testid="agent-status">
          {running ? 'running' : cfg.lastRunAt ? `ran ${timeAgo(cfg.lastRunAt)}` : 'never run'}
        </span>
        <span>{cfg.history.length > 0 ? `${cfg.history.length} run${cfg.history.length === 1 ? '' : 's'} logged` : ''}</span>
      </div>
    </div>
  )

  return (
    <>
      <WidgetFrame widget={widget} headerLabel="agent" headerAccent="bg-accent/20">
        {body}
      </WidgetFrame>
      {profileDialog && (
        <AgentProfileDialog
          onClose={() => setProfileDialog(false)}
          onSave={(p: AgentProfile) => {
            upsertProfile(p)
            set({ profileId: p.id })
            setProfileDialog(false)
          }}
        />
      )}
    </>
  )
}
