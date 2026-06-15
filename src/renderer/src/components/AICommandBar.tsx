import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NodeDraft } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { useAiCommandBar } from '../stores/aiCommandBar'
import Icon from './Icon'

// AICommandBar — the "AI as the primary OS" surface. Lives in the header.
// A single input that responds to natural language:
//
//   "Set up a workspace for my podcast launch"
//      → AI proposes a folder + 6 tasks; one click creates them
//
//   "Add a reading list, a kanban board and a timer to this task"
//      → routes to the existing per-task widget builder
//
//   "Why is my Q3 brief stuck?"
//      → answers as plain chat
//
// The router for these intents is the AI itself — a single system prompt
// classifies the request into create-workspace / add-objects /
// answer-question, and the renderer dispatches accordingly. This is the
// move that matches the brief's "AI is the primary OS, not a sidebar tool"
// principle. The fallback when classification fails is plain chat.

interface Props {
  open: boolean
  onClose: () => void
}

type Intent =
  | { kind: 'create-workspace'; title: string; tasks: string[] }
  | { kind: 'answer'; reply: string }
  | { kind: 'add-objects'; objects: Array<{ kind: string; title: string; reason: string }> }
  | { kind: 'unclear'; clarification: string }

const SUGGESTED_PROMPTS = [
  'Set up a workspace for my podcast launch',
  'Plan a 4-week onboarding sprint',
  'Build a competitor research dashboard',
  'Draft a SaaS launch checklist'
]

const ROUTER_SYSTEM = `You are FocusBuddy's command bar — the entry point for the user's intent. Classify the user's request into one of four shapes, and return ONLY a JSON object (no markdown, no commentary):

{
  "kind": "create-workspace" | "add-objects" | "answer" | "unclear",
  ...payload
}

- "create-workspace": user wants a NEW project/workspace to be set up. Payload:
  { "title": "short workspace title", "tasks": ["task 1", "task 2", ...] }
  Suggest 4-8 well-scoped tasks. Keep titles imperative and crisp (verb first, no fluff).

- "add-objects": user wants tools / widgets / pages / boards added to an EXISTING task. Payload:
  { "objects": [{"kind": "sticky"|"note"|"page"|"table"|"timer"|"webview"|"markdown", "title": "...", "reason": "1 short sentence"}] }
  Use only the listed kinds.

- "answer": user is asking a question that doesn't need workspace mutation. Payload:
  { "reply": "your answer in 1-3 short paragraphs" }

- "unclear": you're not confident. Payload:
  { "clarification": "one short question that would unblock you" }

Be decisive — most user prompts are create-workspace or add-objects. Don't default to "answer" or "unclear" unless the request truly is informational or ambiguous.`

export default function AICommandBar({ open, onClose }: Props): JSX.Element | null {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [intent, setIntent] = useState<Intent | null>(null)
  const [applying, setApplying] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const createNode = useNodeStore((s) => s.create)
  const refreshNodes = useNodeStore((s) => s.refresh)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)

  useEffect(() => {
    if (open) {
      setPrompt('')
      setIntent(null)
      setError(null)
      const t = window.setTimeout(() => inputRef.current?.focus(), 30)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open])

  // Escape always closes the bar — even mid-classify or mid-apply. The
  // user must never feel trapped. Any in-flight async work continues in
  // the background; closing the dialog just hides the spinner.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    // capture phase so even modal child elements can't swallow Esc first
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  async function classify(text: string): Promise<void> {
    if (busy || !text.trim()) return
    setBusy(true)
    setError(null)
    setIntent(null)
    try {
      // Route via the dedicated raw-completion endpoint, NOT chat.send. chat.send
      // imposes the workspace-build system prompt and runs the {reply, proposals}
      // envelope parser over the result, both of which discard ROUTER_SYSTEM and
      // mangle the small intent JSON we need here. routeCommand applies our
      // system prompt and returns the model's text verbatim.
      const res = await window.api.ai.routeCommand({
        system: ROUTER_SYSTEM,
        text: text.trim()
      })
      if (!res.ok || !res.text) {
        setError(
          res.needsApiKey
            ? 'Add your Anthropic API key in Settings to use the AI command bar.'
            : res.error || 'Could not reach the model.'
        )
        return
      }
      const raw = res.text.trim()
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
      try {
        const parsed = JSON.parse(cleaned)
        setIntent(parsed as Intent)
      } catch {
        // The model didn't return JSON — treat its reply as a plain answer.
        setIntent({ kind: 'answer', reply: raw })
      }
    } catch (err) {
      setError(`Something went wrong: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function applyCreateWorkspace(payload: {
    title: string
    tasks: string[]
  }): Promise<void> {
    setApplying(true)
    setError(null)
    try {
      // Create the folder first.
      const folderDraft: NodeDraft = {
        kind: 'folder',
        title: payload.title || 'New workspace',
        parentId: null
      }
      const folder = await createNode(folderDraft)
      // Then each task underneath.
      for (const t of payload.tasks) {
        if (!t.trim()) continue
        const taskDraft: NodeDraft = {
          kind: 'task',
          title: t.trim(),
          parentId: folder.id
        }
        await createNode(taskDraft)
      }
      await refreshNodes()
      goProject(folder.id)
      onClose()
    } catch (err) {
      // Surface the error rather than silently swallowing — otherwise
      // the user sees a frozen "Setting things up…" with no exit.
      setError(`Could not create workspace: ${(err as Error).message}`)
    } finally {
      setApplying(false)
    }
  }

  async function applyAddObjects(payload: {
    objects: Array<{ kind: string; title: string; reason: string }>
  }): Promise<void> {
    if (!activeTaskId) {
      setError('Open a task first — objects need a host.')
      return
    }
    setApplying(true)
    setError(null)
    try {
      // Reuse the existing buildFromPrompt path so the AI's downstream
      // widget shapes are correct (table schemas etc.). We send the
      // refined prompt as a concise list so the builder doesn't re-
      // imagine the intent.
      const refined = payload.objects
        .map((o) => `- ${o.kind}: ${o.title} (${o.reason})`)
        .join('\n')
      const res = await window.api.setup.buildFromPrompt({
        prompt: `Add these objects to the current task:\n${refined}`,
        taskId: activeTaskId
      })
      if (!res.ok || !res.suggestions) {
        setError(res.error || 'The builder couldn\'t apply those objects.')
        return
      }
      // Hand the prepared suggestions to the canvas builder preview, preloaded,
      // so the user picks and places them there in one step. Replaces the old
      // dead-end alert that told the user to go open another builder.
      useAiCommandBar.getState().setHandoff({
        suggestions: res.suggestions,
        intent: res.intent ?? ''
      })
      goTask(activeTaskId)
      onClose()
    } catch (err) {
      setError(`Could not add objects: ${(err as Error).message}`)
    } finally {
      setApplying(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[220] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[14vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-label="AI command bar"
      aria-modal="true"
    >
      <div
        className="w-[600px] max-w-[92vw] max-h-[72vh] flex flex-col rounded-2xl bg-[rgba(16,24,39,0.92)] dark:bg-[rgba(16,24,39,0.92)] border border-white/[0.06] shadow-2xl overflow-hidden fb-glass-chrome"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          backdropFilter: 'blur(30px) saturate(160%)',
          WebkitBackdropFilter: 'blur(30px) saturate(160%)'
        }}
      >
        <div className="flex items-start gap-2 px-4 pt-4 pb-2">
          <div
            className={`h-8 w-8 rounded-md inline-flex items-center justify-center shrink-0 ${
              busy ? 'fb-halo' : ''
            }`}
            style={{
              background:
                'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.18))'
            }}
          >
            <Icon name="auto_awesome" size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void classify(prompt)
                }
              }}
              placeholder="Describe what you want — a workspace, a board, a research plan…"
              className="w-full bg-transparent text-[14px] text-stone-100 placeholder:text-stone-500 resize-none focus:outline-none leading-snug"
              rows={2}
            />
          </div>
          <kbd className="text-[10px] font-mono text-stone-400 bg-white/5 px-1.5 py-0.5 rounded shrink-0">
            ↵
          </kbd>
        </div>

        {/* Suggestions when idle */}
        {!intent && !busy && !error && (
          <div className="px-4 pb-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-semibold mb-1.5">
              Try
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setPrompt(s)
                    void classify(s)
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-stone-300 border border-white/[0.04] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Busy */}
        {busy && (
          <div className="px-4 pb-4 text-[12px] text-stone-400 inline-flex items-center gap-2">
            <Icon name="auto_awesome" size={12} className="text-accent fb-breathe" />
            <span>Thinking through what you need…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mb-3 p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
            {error}
          </div>
        )}

        {/* Intent preview */}
        {intent && !applying && (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {intent.kind === 'create-workspace' && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-semibold">
                  Proposed workspace
                </div>
                <div className="p-3 rounded-md bg-white/[0.03] border border-white/[0.05]">
                  <div className="text-[14px] font-semibold text-stone-100 mb-2 inline-flex items-center gap-1.5">
                    <Icon name="folder" size={13} className="text-accent" />
                    {intent.title}
                  </div>
                  <ul className="space-y-1">
                    {intent.tasks.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-[12px] text-stone-300"
                      >
                        <Icon name="task_alt" size={11} className="text-stone-500" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={onClose} className="btn-ghost !text-[12px]">
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      void applyCreateWorkspace({
                        title: intent.title,
                        tasks: intent.tasks
                      })
                    }
                    className="btn-primary !text-[12px]"
                  >
                    <Icon name="auto_awesome" size={12} />
                    <span>Create workspace</span>
                  </button>
                </div>
              </div>
            )}
            {intent.kind === 'add-objects' && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-semibold">
                  Proposed objects
                </div>
                <ul className="space-y-1.5">
                  {intent.objects.map((o, i) => (
                    <li
                      key={i}
                      className="p-2.5 rounded-md bg-white/[0.03] border border-white/[0.05] flex items-start gap-2"
                    >
                      <Icon
                        name={
                          o.kind === 'sticky' || o.kind === 'note'
                            ? 'sticky_note_2'
                            : o.kind === 'page'
                              ? 'description'
                              : o.kind === 'table'
                                ? 'table_chart'
                                : o.kind === 'timer'
                                  ? 'hourglass_empty'
                                  : o.kind === 'webview'
                                    ? 'public'
                                    : 'edit_note'
                        }
                        size={13}
                        className="text-accent mt-0.5"
                      />
                      <div>
                        <div className="text-[12px] font-medium text-stone-100">
                          {o.title}
                        </div>
                        <div className="text-[10px] text-stone-400">{o.reason}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={onClose} className="btn-ghost !text-[12px]">
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      void applyAddObjects({ objects: intent.objects })
                    }
                    className="btn-primary !text-[12px]"
                  >
                    <Icon name="auto_awesome" size={12} />
                    <span>Add to active task</span>
                  </button>
                </div>
              </div>
            )}
            {intent.kind === 'answer' && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-semibold">
                  Answer
                </div>
                <div className="text-[13px] text-stone-200 leading-relaxed whitespace-pre-wrap p-3 rounded-md bg-white/[0.03] border border-white/[0.05]">
                  {intent.reply}
                </div>
              </div>
            )}
            {intent.kind === 'unclear' && (
              <div className="text-[12px] text-stone-300 p-3 rounded-md bg-white/[0.03] border border-white/[0.05] inline-flex items-start gap-2">
                <Icon name="help" size={13} className="text-accent mt-0.5" />
                <div>
                  <div className="font-medium text-stone-100 mb-1">
                    Could you clarify?
                  </div>
                  <div>{intent.clarification}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Applying state — visible Cancel so the user is never stuck */}
        {applying && (
          <div className="px-4 pb-4 flex items-center justify-between gap-2">
            <span className="text-[12px] text-stone-400 inline-flex items-center gap-2">
              <Icon name="auto_awesome" size={12} className="text-accent fb-breathe" />
              <span>Setting things up…</span>
            </span>
            <button
              onClick={onClose}
              className="text-[11px] px-2.5 py-1 rounded-md text-stone-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Close — in-flight work continues in the background"
            >
              Close
            </button>
          </div>
        )}

        <div className="px-4 py-2 border-t border-white/[0.04] text-[10px] text-stone-500 flex items-center justify-between">
          <span>
            <kbd className="font-mono">↵</kbd> run · <kbd className="font-mono">Esc</kbd> close
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="bolt" size={10} />
            powered by your Anthropic key
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Re-export the suggestion shape for callers that want to pre-route.
export type { Intent as AICommandIntent }
