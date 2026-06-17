// AI fill panel. The user describes the data they want; the model returns a
// matrix of cell values (possibly including formulas) sized to the current
// selection, which is previewed before it is written. Any formula it returns is
// run through the real engine on apply, so the AI cannot smuggle in a fake
// number — a bad formula shows #ERR like any other.

import { useState } from 'react'
import Icon from '../../Icon'

interface Props {
  headers: string[]
  rangeRows: number
  onApply: (matrix: string[][]) => void
  onClose: () => void
}

export default function SheetAiFill({ headers, rangeRows, onApply, onClose }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string[][] | null>(null)

  async function run(): Promise<void> {
    if (!prompt.trim()) return
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      const res = await window.api.sheet.aiFill({ prompt, headers, rangeRows })
      if (!res.ok || !res.rows) {
        setError(res.error || (res.needsApiKey ? 'No Anthropic API key set.' : 'The AI returned nothing.'))
        return
      }
      setPreview(res.rows)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.04] p-3 mb-2" data-testid="sheet-ai-fill">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon name="auto_awesome" size={13} className="text-accent" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-accent">
          AI fill ({headers.length} cols x {rangeRows} rows)
        </span>
        <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
          <Icon name="close" size={13} />
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run()
        }}
        placeholder={`Describe the data for columns: ${headers.join(', ') || 'A, B, C'}. e.g. "10 SaaS companies with name, ARR, and a growth % formula"`}
        rows={2}
        autoFocus
        className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
      />
      {error && <div className="text-[12px] text-red-600 dark:text-red-400 mt-1">{error}</div>}

      {preview && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-stone-200 dark:border-stone-700">
          <table className="w-full text-[11px]">
            <tbody>
              {preview.slice(0, 30).map((row, i) => (
                <tr key={i} className="border-b border-stone-100 dark:border-stone-800">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1 border-r border-stone-100 dark:border-stone-800 truncate max-w-[160px]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        {preview == null ? (
          <button onClick={() => void run()} disabled={busy || !prompt.trim()} className="btn-primary text-[12px] px-3 py-1.5">
            {busy ? 'Generating…' : 'Generate'}
          </button>
        ) : (
          <>
            <button onClick={() => onApply(preview)} data-testid="sheet-ai-apply" className="btn-primary text-[12px] px-3 py-1.5">
              Insert {preview.length} rows
            </button>
            <button onClick={() => void run()} disabled={busy} className="text-[12px] px-3 py-1.5 rounded border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800">
              Regenerate
            </button>
          </>
        )}
        <span className="text-[11px] text-stone-400">Previewed before it writes. Cmd+Enter</span>
      </div>
    </div>
  )
}
