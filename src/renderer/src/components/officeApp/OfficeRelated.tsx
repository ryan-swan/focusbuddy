import { useState } from 'react'
import Icon from '../Icon'
import { useDocumentsStore } from '../../stores/documents'

// The workspace connecting itself: a dropdown of the documents most related to
// the open one, by content overlap. Computed locally, no graph to build and no
// AI call. An honest empty state when nothing overlaps — no invented links.

interface Related {
  docId: string
  title: string
  docType: string
  snippet: string
}

function docIcon(t: string): string {
  return t === 'sheet' ? 'table_chart' : t === 'slides' ? 'slideshow' : t === 'map' ? 'account_tree' : 'description'
}

export default function OfficeRelated({ docId }: { docId: string }): JSX.Element {
  const open = useDocumentsStore((s) => s.open)
  const [panel, setPanel] = useState(false)
  const [items, setItems] = useState<Related[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function toggle(): Promise<void> {
    const next = !panel
    setPanel(next)
    if (next && items === null) {
      setBusy(true)
      try {
        setItems(await window.api.workspace.related(docId))
      } catch {
        setItems([])
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => void toggle()}
        data-testid="office-related-btn"
        className="fb-btn-surface inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] hover:border-accent hover:text-accent"
        title="Documents related to this one"
      >
        <Icon name="hub" size={14} />
        Related
      </button>
      {panel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPanel(false)} />
          <div
            className="fb-glass-panel rounded-[var(--radius-card)] fb-pop-in absolute right-0 mt-1 w-80 max-h-[60vh] overflow-auto z-50 p-1"
            data-testid="office-related-panel"
          >
            {busy ? (
              <div className="px-3 py-2 text-[12px] text-[var(--ink-40)]">Finding related…</div>
            ) : !items || items.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[var(--ink-40)]">No related documents found.</div>
            ) : (
              items.map((r) => (
                <button
                  key={r.docId}
                  onClick={() => {
                    void open(r.docId)
                    setPanel(false)
                  }}
                  data-testid={`office-related-item-${r.title}`}
                  className="w-full flex items-start gap-2 text-left rounded-md px-2.5 py-1.5 hover:bg-[var(--surface-sunken)]"
                >
                  <Icon name={docIcon(r.docType)} size={14} className="text-accent shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[var(--ink-90)] truncate">{r.title}</span>
                    {r.snippet && <span className="block text-[11px] text-[var(--ink-50)] line-clamp-2">{r.snippet}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
