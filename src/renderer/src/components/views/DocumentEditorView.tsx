import { useEffect } from 'react'
import type { SheetBody, SlidesBody } from '@shared/types'
import { useDocumentsStore } from '../../stores/documents'
import { useViewStore } from '../../stores/view'
import DocEditor from '../documents/DocEditor'
import SheetEditor from '../documents/SheetEditor'
import SlidesEditor from '../documents/SlidesEditor'
import Icon from '../Icon'

// Document editor — loads the active document and hands its body to the right
// surface (doc / sheet / slides). The header carries the editable title, a
// live "saved" indicator, and a way back to the hub. Body edits flow through
// the store's debounced autosave so nothing is lost.

interface Props {
  documentId: string
}

export default function DocumentEditorView({ documentId }: Props): JSX.Element {
  const active = useDocumentsStore((s) => s.active)
  const saving = useDocumentsStore((s) => s.saving)
  const open = useDocumentsStore((s) => s.open)
  const close = useDocumentsStore((s) => s.close)
  const saveBody = useDocumentsStore((s) => s.saveBody)
  const rename = useDocumentsStore((s) => s.rename)
  const goDocuments = useViewStore((s) => s.goDocuments)

  useEffect(() => {
    void open(documentId)
    return () => close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  if (!active || active.id !== documentId) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod text-[13px] text-stone-400">
        Loading…
      </div>
    )
  }

  const typeLabel =
    active.docType === 'doc' ? 'Document' : active.docType === 'sheet' ? 'Spreadsheet' : 'Slides'
  const typeIcon =
    active.docType === 'doc' ? 'description' : active.docType === 'sheet' ? 'table_chart' : 'slideshow'

  return (
    <div className="h-full flex flex-col desk-paper no-tod">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3">
        <button
          onClick={() => {
            close()
            goDocuments()
          }}
          className="icon-btn"
          title="Back to Documents"
        >
          <Icon name="arrow_back" size={17} />
        </button>
        <Icon name={typeIcon} size={16} className="text-accent shrink-0" />
        <input
          value={active.title}
          onChange={(e) => void rename(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-[14px] font-semibold text-stone-900 dark:text-stone-100 focus:outline-none"
        />
        <span className="text-[11px] text-stone-400 dark:text-stone-500 inline-flex items-center gap-1 shrink-0">
          <Icon name={saving ? 'sync' : 'cloud_done'} size={13} className={saving ? 'animate-spin' : 'text-emerald-500'} />
          {saving ? 'Saving' : 'Saved'}
        </span>
        <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">{typeLabel}</span>
      </div>

      {/* Surface */}
      <div className="flex-1 overflow-auto min-h-0">
        {active.docType === 'doc' && (
          <DocEditor key={active.id} content={active.body} title={active.title} onChange={(json) => saveBody(json)} />
        )}
        {active.docType === 'sheet' && (
          <SheetEditor key={active.id} body={active.body as SheetBody} title={active.title} onChange={(b) => saveBody(b)} />
        )}
        {active.docType === 'slides' && (
          <SlidesEditor key={active.id} body={active.body as SlidesBody} onChange={(b) => saveBody(b)} />
        )}
      </div>
    </div>
  )
}
