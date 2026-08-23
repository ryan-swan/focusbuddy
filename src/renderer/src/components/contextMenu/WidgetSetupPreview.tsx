// The per-widget AI setup preview. Mounted once at the app root, it listens to
// the widgetSetup store, runs ai:suggestWidgetSetup, and shows the drafted
// items with a tick box each. The user approves the ones they want and applies
// them in the widget's native format. An optional instruction box refines the
// draft. Nothing is written until the user clicks Add.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { useWidgetSetup } from '../../stores/widgetSetup'
import {
  applyWidgetSetup,
  applyStructuredSetup,
  isStructuredApplyAs,
  type WidgetSetupApplyAs,
  type SetupDraft
} from '../../lib/widgetSetup'

interface DraftItem {
  id: string
  text: string
}

type Status = 'loading' | 'ready' | 'error'

// Pull heading texts out of a Tiptap doc for the page-setup preview.
function extractDocHeadings(doc: unknown): string[] {
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; content?: unknown[] }
    if (n.type === 'heading' && Array.isArray(n.content)) {
      const text = n.content
        .map((c) => (c && typeof c === 'object' ? ((c as { text?: string }).text ?? '') : ''))
        .join('')
      if (text) out.push(text)
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)
  return out
}

export default function WidgetSetupPreview(): JSX.Element | null {
  const { open, widgetId, close } = useWidgetSetup()
  const [status, setStatus] = useState<Status>('loading')
  const [items, setItems] = useState<DraftItem[]>([])
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [applyAs, setApplyAs] = useState<WidgetSetupApplyAs | null>(null)
  const [noun, setNoun] = useState('items')
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  // Structured draft (page document, browser URL, …) when applyAs is structured.
  const [structured, setStructured] = useState<SetupDraft | null>(null)
  const ranFor = useRef<string | null>(null)

  async function run(refinePrompt: string): Promise<void> {
    if (!widgetId) return
    setStatus('loading')
    setError(null)
    setStructured(null)
    const r = await window.api.ai.suggestWidgetSetup({ widgetId, prompt: refinePrompt || undefined })
    if (r.ok && isStructuredApplyAs(r.applyAs)) {
      // Structured kinds: a single proposed setup the user confirms.
      setApplyAs(r.applyAs ?? null)
      setStructured({ applyAs: r.applyAs, pageContent: r.pageContent, url: r.url, summary: r.summary })
      setStatus('ready')
    } else if (r.ok && r.items && r.items.length) {
      setItems(r.items)
      setApproved(new Set(r.items.map((i) => i.id))) // default: everything ticked
      setApplyAs(r.applyAs ?? null)
      setNoun(r.noun ?? 'items')
      setStatus('ready')
    } else {
      setError(
        r.needsApiKey
          ? 'No Anthropic API key is set. Add one in Settings, AI, API keys.'
          : r.error || 'AI setup could not draft anything.'
      )
      setStatus('error')
    }
  }

  // Auto-run once per opened widget.
  useEffect(() => {
    if (open && widgetId && ranFor.current !== widgetId) {
      ranFor.current = widgetId
      setPrompt('')
      void run('')
    }
    if (!open) ranFor.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, widgetId])

  if (!open || !widgetId) return null

  function toggle(id: string): void {
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add(): Promise<void> {
    if (!applyAs) return
    if (structured) {
      await applyStructuredSetup(widgetId as string, structured)
      close()
      return
    }
    const chosen = items.filter((i) => approved.has(i.id)).map((i) => i.text)
    if (chosen.length) await applyWidgetSetup(widgetId as string, applyAs, chosen)
    close()
  }

  const approvedCount = items.filter((i) => approved.has(i.id)).length
  const canApply = status === 'ready' && (structured ? true : approvedCount > 0)

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        data-testid="widget-setup-preview"
        className="fb-card w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--edge-soft)]">
          <Icon name="auto_awesome" size={18} className="text-accent" />
          <span className="font-medium text-[var(--ink-100)]">Set up with AI</span>
          <button
            onClick={close}
            className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[var(--surface-sunken)] text-[var(--ink-50)]"
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              data-testid="widget-setup-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run(prompt)
              }}
              placeholder="Optional: tell the AI what to focus on, then press Enter"
              className="flex-1 rounded border border-[var(--edge-firm)] bg-transparent px-2 py-1.5 text-sm text-[var(--ink-100)] focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => void run(prompt)}
              disabled={status === 'loading'}
              className="px-3 py-1.5 rounded border border-[var(--edge-firm)] text-sm text-[var(--ink-90)] disabled:opacity-50"
            >
              Redraft
            </button>
          </div>

          {status === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-[var(--ink-50)] py-6 justify-center">
              <Icon name="autorenew" size={16} className="animate-spin" />
              Drafting suggestions
            </div>
          )}

          {status === 'error' && (
            <div data-testid="widget-setup-error" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded px-3 py-2">
              {error}
            </div>
          )}

          {status === 'ready' && structured && (
            <div className="flex flex-col gap-2">
              {structured.summary && (
                <p className="text-sm text-[var(--ink-70)]">{structured.summary}</p>
              )}
              {structured.applyAs === 'page-doc' && (
                <div className="rounded-md bg-[var(--surface-sunken)] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1.5">
                    Page outline
                  </div>
                  {(() => {
                    const headings = extractDocHeadings(structured.pageContent)
                    return headings.length ? (
                      <ul className="space-y-1">
                        {headings.map((h, i) => (
                          <li key={i} className="text-sm text-[var(--ink-90)]">
                            {h}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-sm text-[var(--ink-50)]">A starter document.</span>
                    )
                  })()}
                </div>
              )}
              {structured.applyAs === 'webview-url' && (
                <div className="rounded-md bg-[var(--surface-sunken)] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1.5">
                    Open this address
                  </div>
                  <div className="text-sm text-accent break-all">{structured.url}</div>
                </div>
              )}
            </div>
          )}

          {status === 'ready' && !structured && (
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-[var(--ink-50)]">
                Proposed {noun}, tick the ones to add
              </span>
              <div data-testid="widget-setup-items" className="flex flex-col">
                {items.map((it) => (
                  <label
                    key={it.id}
                    className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-[var(--surface-sunken)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={approved.has(it.id)}
                      onChange={() => toggle(it.id)}
                      className="mt-1"
                      data-testid={`widget-setup-item-${it.id}`}
                    />
                    <span className="text-sm text-[var(--ink-100)]">{it.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--edge-soft)]">
          <button
            data-testid="widget-setup-add"
            onClick={() => void add()}
            disabled={!canApply}
            className="px-3 py-1.5 rounded bg-accent text-white text-sm font-medium disabled:opacity-50"
          >
            {structured ? 'Set up' : approvedCount > 0 ? `Add ${approvedCount}` : 'Add'}
          </button>
          <button
            onClick={close}
            className="ml-auto px-3 py-1.5 rounded text-sm text-[var(--ink-50)] hover:text-[var(--ink-90)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
