import { useState } from 'react'
import Icon from '../Icon'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useAiCommandBar } from '../../stores/aiCommandBar'
import { useAssistantChrome } from '../../stores/assistantChrome'

// Spec §4.1 "Start or ask Plexi" — the top-of-Home input that turns a goal
// ("I am planning a wedding") into a real work context: it creates a desk, asks
// the builder to propose the widgets to fill it, opens the desk with the assistant
// beside it, and lets the user approve the suggested widgets on the canvas. This is
// NOT a generic chatbot — it materialises a desk. Honest degradation: with no AI
// key it still creates the desk and says how to enable suggestions; a failure never
// fabricates suggestions.

const EXAMPLES = ['Plan a wedding', 'Launch a product', 'Track job applications', 'Run a book club']

export default function StartOrAskPlexi(): JSX.Element {
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const createNode = useNodeStore((s) => s.create)
  const setActive = useNodeStore((s) => s.setActive)

  async function start(): Promise<void> {
    const prompt = goal.trim()
    if (!prompt || busy) return
    setBusy(true)
    setNote(null)
    try {
      const title = prompt.length > 48 ? prompt.slice(0, 48).trimEnd() + '…' : prompt
      const desk = await createNode({ parentId: null, kind: 'task', title })
      // Same chokepoint the canvas AI builder uses, so the widget shapes (table
      // schemas, page content) are correct. Suggestions are handed to the canvas
      // builder preview via the shared handoff — the user approves them there.
      const res = await window.api.setup.buildFromPrompt({ prompt, taskId: desk.id })
      if (res.ok && res.suggestions && res.suggestions.length > 0) {
        useAiCommandBar.getState().setHandoff({ suggestions: res.suggestions, intent: res.intent ?? prompt })
      } else if (res.needsApiKey) {
        setNote('Created the desk. Add an Anthropic key in Settings → AI to auto-suggest widgets.')
      } else if (!res.ok) {
        setNote(`Created the desk. Could not suggest widgets: ${res.error ?? 'unknown error'}`)
      }
      // Open the desk and the assistant beside it (§4.1: keep the assistant open).
      setActive(desk.id)
      useViewStore.getState().goTask(desk.id)
      const chrome = useAssistantChrome.getState()
      chrome.setMode('sidebar')
      chrome.openPanel()
      setGoal('')
    } catch (err) {
      // create() throws DESK_LIMIT_REACHED on the free tier after already prompting
      // an upgrade — don't double up the message in that case.
      const msg = (err as Error).message || ''
      if (!/DESK_LIMIT/i.test(msg)) setNote(`Could not start: ${msg || 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6" data-testid="start-or-ask">
      {/* Glass chrome: the hero input floats above the desk-paper like a
          control, not a content card — the one Liquid Glass surface on Home. */}
      <div className="fb-glass-pillow rounded-[16px] p-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
            <Icon name={busy ? 'auto_awesome' : 'add_circle'} size={17} className={busy ? 'animate-pulse' : ''} />
          </span>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void start()
              }
            }}
            disabled={busy}
            data-testid="start-or-ask-input"
            placeholder="Describe what you want to do — I'll set up a desk. e.g. I'm planning a wedding"
            className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={() => void start()}
            disabled={!goal.trim() || busy}
            data-testid="start-or-ask-go"
            className="shrink-0 h-8 px-3.5 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Icon name="arrow_forward" size={14} />
            {busy ? 'Setting up…' : 'Start'}
          </button>
        </div>
        {note ? (
          <div className="mt-2 pl-[42px] text-[11.5px] text-[var(--ink-50)]" data-testid="start-or-ask-note">
            {note}
          </div>
        ) : (
          <div className="mt-2 pl-[42px] flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setGoal(ex)}
                disabled={busy}
                className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--edge-soft)] text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
