import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import FolderPickerModal from './FolderPickerModal'

// Shows where an office document is filed and lets the user set or change it in
// one click. Rendered anywhere a document is presented (its editor header, the
// Documents list, search results) so a document always says its name AND where
// it lives, and an unfiled document is one tap from being put somewhere.

type Loc = { entryId: string; parentId: string | null; path: Array<{ id: string; name: string }> } | null

interface Props {
  docId: string
  // compact hides the "Filed in" prefix, for dense rows.
  compact?: boolean
  className?: string
}

export default function DocFiledInChip({ docId, compact = false, className = '' }: Props): JSX.Element {
  const [loc, setLoc] = useState<Loc | 'loading'>('loading')
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setLoc('loading')
    void window.api.fileManager
      .locateDocument(docId)
      .then((r) => {
        if (!cancelled) setLoc(r)
      })
      .catch(() => {
        if (!cancelled) setLoc(null)
      })
    return () => {
      cancelled = true
    }
  }, [docId])

  useEffect(() => load(), [load])

  async function fileInto(folderId: string | null): Promise<void> {
    setPickerOpen(false)
    await window.api.fileManager.fileDocument(docId, folderId)
    load()
  }

  const located = loc !== 'loading' && loc !== null
  const pathLabel =
    located && loc.path.length ? loc.path.map((p) => p.name).join(' › ') : located ? 'Top level' : ''

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        data-testid="doc-filed-in-chip"
        title={located ? `Filed in ${pathLabel} — click to move` : 'Not filed yet — click to file it'}
        className={`inline-flex items-center gap-1 max-w-full text-[11.5px] rounded-md px-1.5 py-0.5 transition-colors ${
          located
            ? 'text-[var(--ink-60)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)]'
            : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
        } ${className}`}
      >
        <Icon name={located ? 'folder' : 'folder_off'} size={13} className="shrink-0" filled={located} />
        {loc === 'loading' ? (
          <span className="text-[var(--ink-40)]">…</span>
        ) : located ? (
          <span className="truncate">
            {!compact && <span className="text-[var(--ink-40)]">Filed in </span>}
            {pathLabel}
          </span>
        ) : (
          <span>{compact ? 'File it' : 'Not filed — file it'}</span>
        )}
      </button>
      {pickerOpen && (
        <FolderPickerModal
          title="File this document"
          currentParentId={located ? loc.parentId : null}
          onPick={(id) => void fileInto(id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
