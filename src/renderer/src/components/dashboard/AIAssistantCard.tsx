import { useState } from 'react'
import type { ChatMessage } from '@shared/types'
import Icon from '../Icon'

// AI Assistant card — a compact, dashboard-resident "ask anything" prompt
// with three quick-action chips that mirror the suggestions in the 2.0
// mockup ("Analyze my workspace", "Suggest next steps", "Summarize
// progress"). Each chip seeds the input and runs immediately; the result
// drops into the response area below.
//
// This is intentionally NOT the full ChatPanel — that's still the
// dedicated chat surface. This card is a lower-friction entry point for
// the user who's looking at the dashboard and wants to ask one quick
// question without context-switching.
//
// The card uses the same window.api.chat.send IPC, so usage of the user's
// API key is identical and reportable.
const QUICK_SUGGESTIONS = [
  {
    id: 'analyze',
    label: 'Analyze my workspace',
    prompt:
      'Look at my workspace at a high level and tell me where I should focus today. Be concise — 3 short paragraphs maximum.'
  },
  {
    id: 'next-steps',
    label: 'Suggest next steps',
    prompt:
      'Based on my open tasks and recent activity, suggest the next 3 concrete actions I should take. One sentence each.'
  },
  {
    id: 'summarize',
    label: 'Summarize progress',
    prompt:
      'Summarize what I accomplished in the last 7 days across my workspace. Highlight 2-3 wins and 1 thing to watch.'
  }
]

export default function AIAssistantCard(): JSX.Element {
  const [input, setInput] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(prompt: string): Promise<void> {
    if (busy || !prompt.trim()) return
    setBusy(true)
    setError(null)
    setResponse(null)
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are FocusBuddy\'s in-dashboard quick assistant. Answer in 3 short paragraphs maximum. Be specific, kind, and actionable. Never lecture.',
          ts: Date.now()
        },
        { role: 'user', content: prompt.trim(), ts: Date.now() }
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
      setResponse(res.message?.content ?? '')
      setInput('')
    } catch (err) {
      setError(`Something went wrong: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 backdrop-blur p-4 fb-glass-soft">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold">
          <Icon name="auto_awesome" size={12} className="text-accent" />
          <span>AI Assistant</span>
        </div>
      </div>

      <div className="text-[13px] text-stone-700 dark:text-stone-200 font-medium mb-3">
        How can I help you today?
      </div>

      {/* Quick suggestion chips */}
      <div className="flex flex-col gap-1.5 mb-3">
        {QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => void ask(s.prompt)}
            disabled={busy}
            className="group flex items-center gap-2 px-2.5 py-2 rounded-md border border-stone-200 dark:border-stone-700 hover:border-accent hover:bg-accent/5 disabled:opacity-50 text-left text-[12px] text-stone-700 dark:text-stone-200 transition-colors"
          >
            <Icon
              name="add"
              size={11}
              className="text-stone-400 group-hover:text-accent shrink-0"
            />
            <span className="flex-1">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Response area */}
      {error && (
        <div className="mb-3 p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
          {error}
        </div>
      )}
      {response && (
        <div className="mb-3 p-3 rounded-md bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-[12px] text-stone-700 dark:text-stone-200 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {response}
        </div>
      )}
      {busy && !response && (
        <div className="mb-3 p-3 rounded-md bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-[11px] text-stone-500 dark:text-stone-400 inline-flex items-center gap-2">
          <Icon name="hourglass_empty" size={12} />
          <span>Thinking…</span>
        </div>
      )}

      {/* Free-form input */}
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && !busy) {
              e.preventDefault()
              void ask(input)
            }
          }}
          placeholder="Ask anything…"
          className="flex-1 px-3 py-2 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-md text-[12px] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => void ask(input)}
          disabled={busy || !input.trim()}
          className="h-[34px] w-[34px] inline-flex items-center justify-center rounded-md bg-accent text-white hover:brightness-110 disabled:opacity-50 shrink-0"
          aria-label="Send"
        >
          <Icon name="send" size={13} />
        </button>
      </div>
    </div>
  )
}
