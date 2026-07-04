import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import type { AgentProfile } from '../lib/agentProfiles'

// Create a custom agent profile from a free-form description. The user describes
// what they need; we draft a name + blurb + persona with AI (editable), or they
// fill it in by hand. The persona only shapes the agent's approach — the app's
// delivery hygiene always holds.

const ICONS = ['smart_toy', 'travel_explore', 'checklist', 'edit_note', 'table_chart', 'rule', 'psychology', 'gavel', 'science', 'support_agent']

interface Props {
  onClose: () => void
  onSave: (profile: AgentProfile) => void
}

export default function AgentProfileDialog({ onClose, onSave }: Props): JSX.Element {
  const [desc, setDesc] = useState('')
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [icon, setIcon] = useState('smart_toy')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate(): Promise<void> {
    if (!desc.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.agents.designProfile(desc.trim())
      if (!res.ok) {
        setError(res.error ?? 'Could not generate a profile.')
        return
      }
      setName(res.name ?? '')
      setBlurb(res.blurb ?? '')
      setSystemPrompt(res.systemPrompt ?? '')
    } finally {
      setBusy(false)
    }
  }

  function save(): void {
    if (!name.trim() || !systemPrompt.trim()) {
      setError('A name and a description of how it works are required.')
      return
    }
    onSave({
      id: `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 40),
      blurb: blurb.trim().slice(0, 120) || 'Custom profile',
      icon,
      systemPrompt: systemPrompt.trim().slice(0, 1200)
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-xl bg-[var(--surface-sunken)] border border-[var(--edge-soft)] shadow-2xl"
        data-testid="agent-profile-dialog"
      >
        <div className="px-4 py-3 border-b border-[var(--edge-soft)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="badge" size={18} className="text-accent" />
            <div>
              <div className="text-sm font-semibold text-[var(--ink-100)]">
                New agent profile
              </div>
              <div className="text-[10px] text-[var(--ink-50)]">
                A job description that shapes how this agent works.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Describe → generate */}
          <div>
            <div className="text-[11px] text-[var(--ink-70)] mb-1">
              Describe what you need this agent to be great at
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. reviews supplier contracts and flags risky or unusual clauses with a short rationale"
              className="w-full h-16 resize-none rounded-md bg-[var(--surface-raised)] border border-[var(--edge-soft)] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-accent"
              data-testid="agent-profile-desc"
            />
            <button
              onClick={() => void generate()}
              disabled={busy || !desc.trim()}
              className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent text-white text-[11px] disabled:opacity-60"
              data-testid="agent-profile-generate"
            >
              <Icon name={busy ? 'hourglass_empty' : 'auto_awesome'} size={13} />
              {busy ? 'Drafting…' : 'Draft with AI'}
            </button>
          </div>

          <div className="border-t border-[var(--edge-soft)] pt-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded border ${
                      icon === ic
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-[var(--edge-soft)] text-[var(--ink-50)]'
                    }`}
                  >
                    <Icon name={ic} size={15} />
                  </button>
                ))}
              </div>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Profile name (e.g. Contract Reviewer)"
              className="w-full rounded-md bg-[var(--surface-raised)] border border-[var(--edge-soft)] px-2.5 py-1.5 text-[12px] font-medium focus:outline-none focus:ring-1 focus:ring-accent"
              data-testid="agent-profile-name"
            />
            <input
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="One-line summary"
              className="w-full rounded-md bg-[var(--surface-raised)] border border-[var(--edge-soft)] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
              data-testid="agent-profile-blurb"
            />
            <div>
              <div className="text-[10px] text-[var(--ink-50)] mb-1">
                How it works (its expertise + approach)
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a … You approach work by …"
                className="w-full h-24 resize-none rounded-md bg-[var(--surface-raised)] border border-[var(--edge-soft)] px-2.5 py-2 text-[12px] leading-snug focus:outline-none focus:ring-1 focus:ring-accent"
                data-testid="agent-profile-prompt"
              />
            </div>
          </div>

          {error && <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[9px] text-[var(--ink-40)] max-w-[60%] leading-snug">
              A profile changes how the agent thinks, never how its output is saved — your data stays safe.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]">
                Cancel
              </button>
              <button
                onClick={save}
                className="px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-medium"
                data-testid="agent-profile-save"
              >
                Save profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
