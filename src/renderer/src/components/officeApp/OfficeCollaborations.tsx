import { useEffect, useState } from 'react'
import { useAccountStore } from '@runtime'
import { listLiveDocs, type LiveDocListItem } from '../../lib/docCollabClient'
import Icon from '../Icon'

// The signed-in user's live (collaborative) documents — ones they made
// collaborative or were invited to. Reuses the same live-docs client PlexiDesk
// uses; clicking one opens the check-out editor in the office shell.

function docIcon(t: string): string {
  return t === 'sheet' ? 'table' : t === 'slides' ? 'slideshow' : t === 'map' ? 'account_tree' : 'description'
}

export default function OfficeCollaborations({
  refreshKey,
  activeId,
  onOpen
}: {
  refreshKey: number
  activeId: string | null
  onOpen: (id: string) => void
}): JSX.Element | null {
  const token = useAccountStore((s) => s.sessionToken)
  const [docs, setDocs] = useState<LiveDocListItem[]>([])

  useEffect(() => {
    if (!token) {
      setDocs([])
      return
    }
    let cancelled = false
    void listLiveDocs(token)
      .then((d) => {
        if (!cancelled) setDocs(d)
      })
      .catch(() => {
        if (!cancelled) setDocs([])
      })
    return () => {
      cancelled = true
    }
  }, [token, refreshKey])

  // Nothing to show when signed out or with no collaborations — keep the sidebar quiet.
  if (!token || docs.length === 0) return null

  return (
    <div className="shrink-0 border-t border-stone-200 dark:border-stone-800 max-h-44 overflow-auto">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-stone-400 flex items-center gap-1">
        <Icon name="group" size={12} />
        Shared & live
      </div>
      <div className="px-2 pb-2">
        {docs.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpen(d.id)}
            data-testid={`office-collab-${d.id}`}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] truncate ${
              activeId === d.id ? 'bg-accent/[0.12] text-accent' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <Icon name={docIcon(d.docType)} size={14} className="shrink-0 text-stone-400" />
            <span className="truncate flex-1">{d.title || 'Untitled'}</span>
            {d.lock && (
              <span className="shrink-0 text-amber-500" title={`Locked by ${d.lock.handle}`}>
                <Icon name="lock" size={12} />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
