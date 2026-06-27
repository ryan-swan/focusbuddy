import { useEffect, useRef, useState } from 'react'
import Icon from '../../Icon'

// GIF picker backed by Tenor (via the main process, which holds the key). Opens on
// the featured set, searches as you type. With no key configured it shows an
// honest prompt to add one in Settings rather than any fabricated results.

interface Gif {
  id: string
  previewUrl: string
  url: string
  description: string
}

export function GifPicker({
  onSelect,
  onClose
}: {
  onSelect: (url: string, description: string) => void
  onClose: () => void
}): JSX.Element {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Gif[]>([])
  const [loading, setLoading] = useState(true)
  const [needsKey, setNeedsKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  // Debounced search; runs on mount with an empty query (featured set).
  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      const res = await window.api.gif.search(q)
      if (cancelled) return
      setLoading(false)
      if (res.ok) {
        setNeedsKey(false)
        setResults(res.results)
      } else if ('needsKey' in res && res.needsKey) {
        setNeedsKey(true)
        setResults([])
      } else {
        setError('error' in res ? res.error : 'GIF search failed.')
        setResults([])
      }
    }
    const t = window.setTimeout(run, q ? 300 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  return (
    <div
      ref={ref}
      className="absolute z-30 bottom-full mb-1 left-0 w-[300px] rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-2"
      data-testid="gif-picker"
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search GIFs…"
        className="w-full mb-2 px-2 py-1 text-[12px] rounded-md bg-[var(--surface-base)] border border-[var(--edge-soft)] focus:outline-none focus:border-accent"
      />
      <div className="min-h-[120px] max-h-[260px] overflow-y-auto">
        {needsKey ? (
          <div className="p-3 text-[12px] text-[var(--ink-70)] leading-relaxed">
            GIF search needs a free Tenor API key. Add one in Settings under API keys, then search here. No results are
            shown until a key is set.
          </div>
        ) : error ? (
          <div className="p-3 text-[12px] text-rose-500">{error}</div>
        ) : loading ? (
          <div className="p-3 text-[12px] text-[var(--ink-50)]">Loading…</div>
        ) : results.length === 0 ? (
          <div className="p-3 text-[12px] text-[var(--ink-50)]">No GIFs found.</div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {results.map((g) => (
              <button
                key={g.id}
                onClick={() => onSelect(g.url, g.description)}
                className="rounded-md overflow-hidden hover:ring-2 hover:ring-accent"
                title={g.description}
                data-testid={`gif-${g.id}`}
              >
                <img src={g.previewUrl} alt={g.description} className="w-full h-auto block" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pt-1 text-[9px] text-[var(--ink-40)] text-right flex items-center justify-end gap-1">
        <Icon name="bolt" size={9} /> Powered by Tenor
      </div>
    </div>
  )
}
