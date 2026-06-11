// The one AI Assist preview. Mounted once at the app root, it listens to the
// aiAssistPreview store, runs the ai:transformText IPC, shows the result before
// anything is written, and applies it in place on confirmation. This is the
// "preview before applying" guarantee from the spec, deliverable 7.
//
// Write-back is deliberately conservative. A sub-selection is spliced back into
// the widget's text when that exact text is found in the content; the whole
// content is replaced only for plain-text widgets; and anything that cannot be
// spliced safely (a selection inside a rich Tiptap document) falls back to
// spawning a connected sticky with the result, so AI Assist can never corrupt
// structured content.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { useAiAssistPreview } from '../../stores/aiAssistPreview'
import { useWidgetStore } from '../../stores/widgets'
import { createConnectedTool } from '../../lib/createConnectedTool'

const PLAIN_TEXT_KINDS = ['sticky', 'note', 'markdown']

export default function AiAssistPreview(): JSX.Element | null {
  const { open, request, status, result, error, setLoading, setResult, setError, close } =
    useAiAssistPreview()
  const [instr, setInstr] = useState('')
  const ranFor = useRef<string | null>(null)

  // Reset the editable instruction whenever a new request opens.
  useEffect(() => {
    if (request) {
      setInstr(request.instruction)
      ranFor.current = null
    }
  }, [request])

  async function run(instruction: string): Promise<void> {
    if (!request) return
    if (!instruction.trim()) return
    setLoading()
    const r = await window.api.ai.transformText({
      text: request.text,
      instruction,
      kind: request.sourceKind
    })
    if (r.ok && r.result) setResult(r.result)
    else setError(r.needsApiKey ? 'No Anthropic API key is set. Add one in Settings, AI, API keys.' : r.error || 'AI Assist failed.')
  }

  // Auto-run for preset actions. Custom actions wait for the user to type and
  // press Run (status starts at idle for those).
  useEffect(() => {
    if (open && request && status === 'loading' && ranFor.current !== request.instruction + request.sourceWidgetId) {
      ranFor.current = request.instruction + request.sourceWidgetId
      void run(request.instruction)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request, status])

  if (!open || !request) return null

  async function apply(): Promise<void> {
    if (!result || !request) return
    const store = useWidgetStore.getState()
    const w = store.widgets.find((x) => x.id === request.sourceWidgetId)
    if (!w) {
      close()
      return
    }
    const content = w.content || ''
    if (!request.wholeContent && request.text && content.includes(request.text)) {
      await store.update(w.id, { content: content.replace(request.text, result) })
    } else if (request.wholeContent && PLAIN_TEXT_KINDS.includes(w.kind)) {
      await store.update(w.id, { content: result })
    } else {
      // Cannot splice safely (e.g. a selection inside a rich document). Spawn a
      // connected sticky rather than risk corrupting structured content.
      await createConnectedTool({ sourceWidgetId: w.id, kind: 'sticky', content: result.slice(0, 2000) })
    }
    close()
  }

  async function copy(): Promise<void> {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
    } catch {
      // ignore
    }
    close()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        data-testid="ai-assist-preview"
        className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-lg bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-700"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
          <Icon name="auto_awesome" size={18} className="text-accent" />
          <span className="font-medium text-stone-900 dark:text-stone-100">{request.label}</span>
          <button
            onClick={close}
            className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 flex flex-col gap-3">
          <label className="text-xs uppercase tracking-wide text-stone-500">Instruction</label>
          <textarea
            data-testid="ai-assist-instruction"
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            rows={2}
            placeholder="Describe what you want done with the text"
            className="w-full resize-none rounded border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent"
          />

          {status === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-stone-500 py-6 justify-center">
              <Icon name="autorenew" size={16} className="animate-spin" />
              Working on it
            </div>
          )}

          {status === 'error' && (
            <div data-testid="ai-assist-error" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded px-3 py-2">
              {error}
            </div>
          )}

          {status === 'ready' && result && (
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-stone-500">Result</span>
              <div
                data-testid="ai-assist-result"
                className="whitespace-pre-wrap text-sm text-stone-900 dark:text-stone-100 bg-stone-50 dark:bg-stone-800 rounded px-3 py-2 max-h-72 overflow-y-auto"
              >
                {result}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-stone-200 dark:border-stone-700">
          {status !== 'ready' ? (
            <button
              data-testid="ai-assist-run"
              onClick={() => void run(instr)}
              disabled={status === 'loading' || !instr.trim()}
              className="px-3 py-1.5 rounded bg-accent text-white text-sm font-medium disabled:opacity-50"
            >
              {status === 'loading' ? 'Working' : 'Run'}
            </button>
          ) : (
            <>
              <button
                data-testid="ai-assist-apply"
                onClick={() => void apply()}
                className="px-3 py-1.5 rounded bg-accent text-white text-sm font-medium"
              >
                Apply
              </button>
              <button
                onClick={() => void copy()}
                className="px-3 py-1.5 rounded border border-stone-300 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200"
              >
                Copy
              </button>
              <button
                onClick={() => void run(instr)}
                className="px-3 py-1.5 rounded border border-stone-300 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200"
              >
                Regenerate
              </button>
            </>
          )}
          <button
            onClick={close}
            className="ml-auto px-3 py-1.5 rounded text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
          >
            Discard
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
