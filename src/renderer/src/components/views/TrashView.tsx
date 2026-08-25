import { useEffect, useState } from 'react'
import { useNodeStore } from '../../stores/nodes'
import Icon from '../Icon'

// Trash (lifecycle track L1). Trashed rooms and desks wait here for the 7-day
// purge; Restore brings one back with its entire subtree, bit-lossless
// (§2.5.1 — work_item children included). The list shows ROOTS only: children
// travel with their parent. Purge timing is honest — each row says when the
// sweep will claim it.

interface TrashEntry {
  id: string
  kind: string
  title: string
  trashedAt: number
  purgeAt: number
}

function daysLeft(purgeAt: number): string {
  const ms = purgeAt - Date.now()
  if (ms <= 0) return 'purging soon'
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  return days === 1 ? '1 day left' : `${days} days left`
}

export default function TrashView(): JSX.Element {
  const refreshNodes = useNodeStore((s) => s.refresh)
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load(): Promise<void> {
    try {
      setEntries(await window.api.nodes.listTrash())
    } catch {
      setEntries([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function restore(id: string): Promise<void> {
    setBusyId(id)
    try {
      await window.api.nodes.restoreTree(id)
      await refreshNodes()
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-base)] text-[var(--ink-100)]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="fb-t-title text-[var(--ink-90)]">Trash</h1>
          <p className="fb-t-body text-[var(--ink-50)] mt-1">
            Deleted rooms and desks stay here for 7 days, then purge automatically. Restoring
            brings everything back exactly as it was.
          </p>
        </div>
        {entries === null ? null : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="delete" size={28} className="text-[var(--ink-30)] mb-3" />
            <div className="fb-t-label text-[var(--ink-50)]">Trash is empty</div>
            <div className="fb-t-body text-[var(--ink-30)] mt-1">
              Nothing is waiting to be purged.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-raised)]">
                <Icon
                  name={e.kind === 'folder' ? 'folder' : 'desk'}
                  size={18}
                  className="text-[var(--ink-50)] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="fb-t-label text-[var(--ink-100)] truncate">
                    {e.title || (e.kind === 'folder' ? 'Untitled room' : 'Untitled desk')}
                  </div>
                  <div className="fb-t-body text-[var(--ink-50)]">{daysLeft(e.purgeAt)}</div>
                </div>
                <button
                  onClick={() => void restore(e.id)}
                  disabled={busyId === e.id}
                  className="inline-flex items-center gap-1.5 h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] hover:text-[var(--ink-100)] disabled:opacity-50"
                >
                  <Icon name="restore_from_trash" size={15} />
                  {busyId === e.id ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
