import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'

// The Daily Brief card: a proactive, grounded summary of what to focus on today,
// built from the user's real tasks, calendar and recent documents (not anything
// they typed). Loads once on mount and can be refreshed. Honest states throughout:
// a missing API key and an empty/quiet workspace each say so plainly rather than
// showing a fabricated plan.
export default function DailyBriefCard(): JSX.Element {
  const [brief, setBrief] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsKey, setNeedsKey] = useState(false)
  const loadedOnce = useRef(false)

  async function load(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    setNeedsKey(false)
    try {
      const res = await window.api.ai.dailyBrief()
      if (res.ok) setBrief(res.brief ?? '')
      else if (res.needsApiKey) setNeedsKey(true)
      else setError(res.error ?? 'Could not build your brief.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (loadedOnce.current) return
    loadedOnce.current = true
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col gap-2 p-3" data-testid="daily-brief-card">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
          <Icon name="wb_sunny" size={14} />
        </span>
        <span className="text-[13px] font-semibold text-[var(--ink-90)]">Your daily brief</span>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="ml-auto icon-btn disabled:opacity-40"
          title="Refresh"
          data-testid="daily-brief-refresh"
        >
          <Icon name={busy ? 'autorenew' : 'refresh'} size={15} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {busy && !brief && (
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-50)]" data-testid="daily-brief-busy">
            <Icon name="autorenew" size={13} className="animate-spin" />
            Reading across your work…
          </div>
        )}
        {needsKey && (
          <div className="rounded-lg border border-dashed border-[var(--edge-soft)] p-3 text-[12px] text-[var(--ink-60)]" data-testid="daily-brief-needs-key">
            Add your Anthropic API key in Settings → AI and I'll brief you every morning on what matters most across your work.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-300/60 bg-red-50/70 dark:bg-red-950/30 px-2.5 py-1.5 text-[12px] text-red-600 dark:text-red-300" data-testid="daily-brief-error">
            {error}
          </div>
        )}
        {brief && !busy && (
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink-90)]" data-testid="daily-brief-text">
            {brief}
          </p>
        )}
      </div>
    </div>
  )
}
