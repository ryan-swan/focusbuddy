import { useEffect, useState } from 'react'
import type { DocBody, DocType, DocumentMeta } from '@shared/types'
import Icon from '../Icon'
import { htmlToDoc, wrapDocBody } from '@office'

// Shown when the user adds a Document / Spreadsheet / Slides to the canvas. It
// offers three honest paths: create a new blank one, import a real Office file
// (retaining formatting and, for sheets, formulas), or place an existing
// document from the store. Each path resolves to a document id, which the caller
// turns into a canvas widget.

interface Props {
  docType: DocType
  onPicked: (documentId: string) => void
  onClose: () => void
}

const META: Record<DocType, { label: string; importLabel: string }> = {
  doc: { label: 'Document', importLabel: 'Import a Word .docx' },
  sheet: { label: 'Spreadsheet', importLabel: 'Import an Excel .xlsx / .csv' },
  slides: { label: 'Slides', importLabel: 'Import a PowerPoint .pptx' },
  // Maps have no external import format yet — the create-new path is the only one.
  map: { label: 'Map', importLabel: '' }
}

export default function OfficeDocAddDialog({ docType, onPicked, onClose }: Props): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<DocumentMeta[] | null>(null)
  const meta = META[docType]

  useEffect(() => {
    void window.api.documents
      .list()
      .then((all) => setExisting(all.filter((d) => d.docType === docType)))
      .catch(() => setExisting([]))
  }, [docType])

  async function createNew(): Promise<void> {
    setBusy('Creating…')
    setError(null)
    try {
      const created = await window.api.documents.create({ docType, title: `Untitled ${meta.label.toLowerCase()}` })
      onPicked(created.id)
    } catch (e) {
      setBusy(null)
      setError((e as Error).message)
    }
  }

  async function importFile(): Promise<void> {
    setBusy('Importing…')
    setError(null)
    try {
      if (docType === 'doc') {
        const res = await window.api.office.importDocx()
        if (!res.ok) {
          setBusy(null)
          if (res.error) setError(res.error)
          return
        }
        const body = wrapDocBody(htmlToDoc(res.html ?? ''), {}) as unknown as DocBody
        const created = await window.api.documents.create({ docType, title: res.fileName?.replace(/\.docx$/i, '') || 'Imported document', body })
        onPicked(created.id)
      } else if (docType === 'sheet') {
        const res = await window.api.sheet.import()
        if (!res.ok || !res.body) {
          setBusy(null)
          if (res.error) setError(res.error)
          return
        }
        const created = await window.api.documents.create({ docType, title: res.name?.replace(/\.(xlsx|xls|csv)$/i, '') || 'Imported spreadsheet', body: res.body })
        onPicked(created.id)
      } else {
        const res = await window.api.slides.import()
        if (!res.ok || !res.body) {
          setBusy(null)
          if (res.error) setError(res.error)
          return
        }
        const created = await window.api.documents.create({ docType, title: res.name?.replace(/\.pptx$/i, '') || 'Imported deck', body: res.body })
        onPicked(created.id)
      }
    } catch (e) {
      setBusy(null)
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="office-add-dialog"
        className="w-[440px] max-w-[92vw] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[14px] font-semibold text-stone-800 dark:text-stone-100">Add {meta.label.toLowerCase()}</span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        {error && <div className="mb-2 text-[12px] text-red-600 dark:text-red-400">{error}</div>}

        <div className={`grid ${meta.importLabel ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          <button
            onClick={() => void createNew()}
            disabled={!!busy}
            data-testid="office-add-new"
            className="flex flex-col items-start gap-1 rounded-lg border border-stone-200 dark:border-stone-700 p-3 hover:border-accent hover:bg-accent/[0.04] disabled:opacity-50 text-left"
          >
            <Icon name="add" size={18} className="text-accent" />
            <span className="text-[13px] font-medium text-stone-800 dark:text-stone-100">Create new</span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">Start blank with our editor</span>
          </button>
          {meta.importLabel && (
          <button
            onClick={() => void importFile()}
            disabled={!!busy}
            data-testid="office-add-import"
            className="flex flex-col items-start gap-1 rounded-lg border border-stone-200 dark:border-stone-700 p-3 hover:border-accent hover:bg-accent/[0.04] disabled:opacity-50 text-left"
          >
            <Icon name="upload_file" size={18} className="text-accent" />
            <span className="text-[13px] font-medium text-stone-800 dark:text-stone-100">Import a file</span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">{meta.importLabel}, formatting kept</span>
          </button>
          )}
        </div>

        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">Place an existing one</div>
          <div className="max-h-48 overflow-auto rounded-lg border border-stone-200 dark:border-stone-700 divide-y divide-stone-100 dark:divide-stone-800">
            {existing === null ? (
              <div className="px-3 py-2 text-[12px] text-stone-400">Loading…</div>
            ) : existing.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-stone-400">No {meta.label.toLowerCase()}s yet.</div>
            ) : (
              existing.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onPicked(d.id)}
                  disabled={!!busy}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                >
                  <Icon name="description" size={14} className="text-stone-400" />
                  <span className="text-[12.5px] text-stone-700 dark:text-stone-200 truncate">{d.title || 'Untitled'}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {busy && <div className="mt-2 text-[12px] text-stone-500 dark:text-stone-400">{busy}</div>}
      </div>
    </div>
  )
}
