import { useMemo, useState } from 'react'
import Icon from '../Icon'
import { useViewStore } from '../../stores/view'
import { useNodeStore } from '../../stores/nodes'
import { useChatStore, NEW_CHAT_KEY } from '../../stores/chat'
import { composerOmniIntents, type OmniTarget } from '../../lib/omniIntent'
import { performOmniIntent, loadOmniMode, saveOmniMode, type OmniMode } from '../../lib/omniPerform'

// The top-of-Home input is the front door to everything (A2, AI-01 + Caleb's
// seamless ruling, 2026-08-23): mode pills under the bar make intent a tap,
// not a guess. Ask Plexii seeds a fresh conversation on the hub; Search types
// straight into your engine and opens results in the in-app browser. Both
// semantics: tapping a pill acts on what's typed AND locks the mode (sticky
// across sessions) until switched. In Ask mode the smart layer still honours
// the instant rule — a bare URL opens in Plexi and "take me to X" navigates
// or searches — so nothing deterministic ever waits on the model. The R6
// placement review asked the bar to advertise all three doors and teach ⌘K;
// both live here now.

const EXAMPLES = ['Plan a wedding', 'Launch a product', 'Track job applications', 'Run a book club']
const MODE_KEY = 'fb.omni.mode.home'

export default function StartOrAskPlexi(): JSX.Element {
  const [goal, setGoal] = useState('')
  const [mode, setModeState] = useState<OmniMode>(() => loadOmniMode(MODE_KEY))
  const sending = useChatStore((s) => s.sending)
  const nodes = useNodeStore((s) => s.nodes)

  const targets = useMemo<OmniTarget[]>(
    () => [
      { kind: 'page', id: 'tasks', title: 'Tasks' },
      { kind: 'page', id: 'calendar', title: 'Calendar' },
      { kind: 'page', id: 'files', title: 'Files' },
      { kind: 'page', id: 'vault', title: 'Vault' },
      ...nodes
        .filter((n) => n.kind === 'task')
        .map((n) => ({ kind: 'desk' as const, id: n.id, title: n.title || 'Untitled desk' }))
    ],
    [nodes]
  )

  function ask(prompt: string): void {
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
  }

  function searchWeb(query: string): void {
    performOmniIntent({ kind: 'search', label: 'Search the web', url: query })
  }

  function start(): void {
    const prompt = goal.trim()
    if (!prompt) return
    if (mode === 'search') {
      searchWeb(prompt)
      setGoal('')
      return
    }
    // Ask mode still honours the instant rule for unambiguous input: a URL
    // or a navigation phrase acts now; everything else asks Plexii.
    const lead = composerOmniIntents(prompt, targets, { chatFirst: true })[0]
    if (lead && lead.kind !== 'ask') {
      performOmniIntent(lead)
      setGoal('')
      return
    }
    ask(prompt)
    setGoal('')
  }

  // Both semantics: a pill tap acts on the current text AND locks the mode.
  function pickMode(next: OmniMode): void {
    setModeState(next)
    saveOmniMode(MODE_KEY, next)
    const prompt = goal.trim()
    if (!prompt || sending) return
    if (next === 'search') searchWeb(prompt)
    else ask(prompt)
    setGoal('')
  }

  const searching = mode === 'search'

  return (
    <div className="mb-6" data-testid="start-or-ask">
      {/* Glass chrome: the hero input floats above the desk-paper like a
          control, not a content card — the one Liquid Glass surface on Home. */}
      <div className="fb-glass-pillow rounded-[16px] p-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
            <Icon name={searching ? 'travel_explore' : 'auto_awesome'} size={17} />
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
            placeholder={
              searching
                ? 'Search the web — results open right here in Plexi'
                : 'Ask Plexii, search the web, or open anything'
            }
            // No focus box (Caleb's ruling): the global :focus-visible outline
            // draws a hard accent rectangle around text inputs; this bar's
            // glass pillow IS the affordance, same precedent as the composer.
            className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] disabled:opacity-60 focus:outline-none"
          />
          {/* The power path, taught where the suite home teaches it (R6 note). */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('fb:open-command-palette'))}
            title="Open the command palette"
            data-testid="start-or-ask-cmdk"
            className="shrink-0 hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--surface-sunken)] text-[11px] text-[var(--ink-50)] fb-tabular hover:text-[var(--ink-80)] transition-colors"
          >
            ⌘K
          </button>
          <button
            onClick={start}
            disabled={!goal.trim() || sending}
            data-testid="start-or-ask-go"
            className="shrink-0 h-8 px-3.5 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Icon name="arrow_forward" size={14} />
            {searching ? 'Search' : 'Ask'}
          </button>
        </div>
        <div className="mt-2 pl-[42px] flex flex-wrap items-center gap-1.5">
          {/* The mode pills (Caleb's ruling): intent is a tap, not a guess. */}
          <div
            data-testid="start-or-ask-modes"
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-sunken)] p-0.5 mr-1"
          >
            {(
              [
                { id: 'ask' as const, label: 'Ask Plexii', icon: 'forum' },
                { id: 'search' as const, label: 'Search', icon: 'travel_explore' }
              ] satisfies { id: OmniMode; label: string; icon: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                data-testid={`start-or-ask-mode-${m.id}`}
                aria-pressed={mode === m.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                  mode === m.id
                    ? 'bg-[var(--surface-raised)] text-[rgb(var(--accent))]'
                    : 'text-[var(--ink-50)] hover:text-[var(--ink-80)]'
                }`}
              >
                <Icon name={m.icon} size={11} className="shrink-0" />
                {m.label}
              </button>
            ))}
          </div>
          {!searching &&
            EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setGoal(ex)}
                disabled={sending}
                className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--ink-60)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
