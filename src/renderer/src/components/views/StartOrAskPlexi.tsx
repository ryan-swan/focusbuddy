import { useState } from 'react'
import Icon from '../Icon'
import { useViewStore } from '../../stores/view'
import { useNodeStore } from '../../stores/nodes'
import { useChatStore, NEW_CHAT_KEY } from '../../stores/chat'

// The top-of-Home input is a DOOR into the Plexii hub (Caleb's consolidation
// ruling, 2026-08-21): typing here seeds a fresh conversation and lands on the
// hub page with the message already streaming. It no longer materialises a
// desk directly — building a desk is one of the things the conversation itself
// proposes, and the guided discovery flow arrives in a later phase.

const EXAMPLES = ['Plan a wedding', 'Launch a product', 'Track job applications', 'Run a book club']

export default function StartOrAskPlexi(): JSX.Element {
  const [goal, setGoal] = useState('')
  const sending = useChatStore((s) => s.sending)

  function start(): void {
    const prompt = goal.trim()
    if (!prompt) return
    const chat = useChatStore.getState()
    if (chat.sending) return
    // Fresh conversation, stamped as started from the workspace (the same
    // framing the hub itself uses), message sent on the way in. Fire-and-
    // forget: the stream renders in the hub the user is about to be on.
    chat.newConversation()
    chat.setPendingContext({ kind: 'workspace', label: 'your workspace', title: '', icon: 'auto_awesome' })
    void chat.send(null, prompt, NEW_CHAT_KEY)
    // Being on the hub means being on no desk — clear the active task so a
    // lingering desk can never claim this conversation's applies.
    useNodeStore.getState().setActive(null)
    useViewStore.getState().goPlexii()
    setGoal('')
  }

  return (
    <div className="mb-6" data-testid="start-or-ask">
      {/* Glass chrome: the hero input floats above the desk-paper like a
          control, not a content card — the one Liquid Glass surface on Home. */}
      <div className="fb-glass-pillow rounded-[16px] p-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
            <Icon name="auto_awesome" size={17} />
          </span>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                start()
              }
            }}
            disabled={sending}
            data-testid="start-or-ask-input"
            placeholder="Ask Plexii anything — a question, an idea, a plan"
            className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={start}
            disabled={!goal.trim() || sending}
            data-testid="start-or-ask-go"
            className="shrink-0 h-8 px-3.5 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Icon name="arrow_forward" size={14} />
            Ask
          </button>
        </div>
        <div className="mt-2 pl-[42px] flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setGoal(ex)}
              disabled={sending}
              className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--edge-soft)] text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
