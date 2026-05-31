import { useEffect, useState } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { useNodeStore } from '../stores/nodes'

// Sync indicator — visible at the foot of the sidebar. Reports the last
// time anything in the workspace was written (widget edit, task change,
// new node, etc.). In a future cloud-sync world it'll change to mean
// "last successful sync"; for now it's "last local save", which is the
// honest version of the sync chip the 2.0 mockup shows.
//
// Sparkline renders the count of saves per minute over the last 10
// minutes — a calm pulse showing the workspace is alive. Empty bars when
// there's no activity reinforce "it's quiet, that's fine".
//
// No network call. Subscribes to the existing widget + node stores'
// updatedAt fields; uses the maximum as the heartbeat source.
const HISTORY_MINUTES = 10

function relativeAge(ts: number): string {
  if (ts === 0) return '—'
  const diffMs = Date.now() - ts
  if (diffMs < 5_000) return 'just now'
  if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s ago`
  const m = Math.round(diffMs / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export default function SyncIndicator(): JSX.Element {
  const widgets = useWidgetStore((s) => s.widgets)
  const nodes = useNodeStore((s) => s.nodes)
  const [tick, setTick] = useState(0)
  const [history, setHistory] = useState<number[]>(() =>
    new Array(HISTORY_MINUTES).fill(0)
  )

  // The "last save" timestamp = max updatedAt across all observed entities.
  // Nodes and widgets both have updatedAt. Compute lazily per render —
  // the arrays are bounded, so this is cheap.
  let lastSaveAt = 0
  for (const w of widgets) {
    const t = w.updatedAt ?? 0
    if (t > lastSaveAt) lastSaveAt = t
  }
  for (const n of nodes) {
    const t = n.updatedAt ?? n.createdAt ?? 0
    if (t > lastSaveAt) lastSaveAt = t
  }

  // Ticker: bump every 30s so the relative time refreshes without flooding renders.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  void tick

  // Sparkline: bucket the last 10 minutes by save count. Updated each
  // time widgets/nodes references change (which happens on any write
  // since stores are immutable). We don't try to track exact event
  // sequence; the count is a vibe-indicator, not an audit log.
  useEffect(() => {
    const now = Date.now()
    const startWindow = now - HISTORY_MINUTES * 60_000
    const buckets = new Array(HISTORY_MINUTES).fill(0)
    for (const w of widgets) {
      const t = w.updatedAt ?? 0
      if (t < startWindow) continue
      const idx = Math.min(
        HISTORY_MINUTES - 1,
        Math.floor((t - startWindow) / 60_000)
      )
      buckets[idx]++
    }
    for (const n of nodes) {
      const t = n.updatedAt ?? n.createdAt ?? 0
      if (t < startWindow) continue
      const idx = Math.min(
        HISTORY_MINUTES - 1,
        Math.floor((t - startWindow) / 60_000)
      )
      buckets[idx]++
    }
    setHistory(buckets)
  }, [widgets, nodes])

  const maxBucket = Math.max(1, ...history)
  const totalRecent = history.reduce((a, b) => a + b, 0)

  return (
    <div
      className="mx-2 mb-2 px-2.5 py-2 rounded-md bg-stone-100/60 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 flex items-center gap-2"
      title={`Workspace is saved locally. ${totalRecent} change${
        totalRecent === 1 ? '' : 's'
      } in the last ${HISTORY_MINUTES} min.`}
    >
      <div className="relative inline-flex items-center justify-center h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-stone-700 dark:text-stone-200 leading-tight">
          Synced
        </div>
        <div className="text-[9px] text-stone-500 dark:text-stone-400 leading-tight font-mono">
          {relativeAge(lastSaveAt)}
        </div>
      </div>
      <svg
        width={48}
        height={20}
        viewBox={`0 0 ${HISTORY_MINUTES * 4} 20`}
        className="shrink-0"
      >
        {history.map((count, i) => {
          const h = Math.max(2, (count / maxBucket) * 18)
          return (
            <rect
              key={i}
              x={i * 4 + 0.5}
              y={20 - h}
              width={3}
              height={h}
              rx={1}
              fill="rgb(var(--accent))"
              opacity={count === 0 ? 0.18 : 0.6 + (count / maxBucket) * 0.4}
            />
          )
        })}
      </svg>
    </div>
  )
}
