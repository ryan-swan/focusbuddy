// PlexiOffice — the standalone app shell. A focused Word/Excel/PowerPoint-style
// experience that reuses the very same editors PlexiDesk embeds (via @office) and
// the same documents store, so the two apps stay in lockstep. It deliberately does
// NOT pull in the desk canvas, file manager, or collaboration — documents reach it
// through the cloud-documents API (@office sync), which is the integration contract
// of the lean split.
//
// This is the second product's renderer root. It builds as its own HTML entry
// (plexioffice.html); the main process loads it when the app is the PlexiOffice
// build. The @office / @runtime imports are the package boundaries that will
// become real packages — call sites here won't change when they do.

import { useEffect, useState } from 'react'
import { DocEditor, SheetEditor, SlidesEditor, type DocType, type SheetBody, type SlidesBody } from '@office'
import { useTheme } from '@runtime'
import { useDocumentsStore } from '../../stores/documents'
import Icon from '../Icon'

const NEW_KINDS: { type: DocType; label: string; icon: string }[] = [
  { type: 'doc', label: 'Document', icon: 'description' },
  { type: 'sheet', label: 'Spreadsheet', icon: 'table' },
  { type: 'slides', label: 'Slides', icon: 'slideshow' }
]

export default function PlexiOfficeApp(): JSX.Element {
  // Applying the shared theme is the whole reason useTheme lives in @runtime —
  // PlexiOffice looks like PlexiDesk without copying the theme system.
  useTheme()
  const { list, active, refresh, open, createBlank, saveBody, rename, close } = useDocumentsStore()
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function newDoc(type: DocType): Promise<void> {
    const doc = await createBlank(type)
    await open(doc.id)
  }

  return (
    <div className="h-screen w-screen flex bg-desk-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {/* Sidebar — branding, new-document actions, the document list */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-900/60">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-stone-200 dark:border-stone-800">
          <Icon name="auto_awesome" size={16} className="text-accent" />
          <span className="font-semibold text-[14px]">PlexiOffice</span>
        </div>

        <div className="p-3 flex flex-col gap-1.5">
          {NEW_KINDS.map((k) => (
            <button
              key={k.type}
              onClick={() => void newDoc(k.type)}
              data-testid={`office-new-${k.type}`}
              className="flex items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-700 px-2.5 py-1.5 text-[12.5px] hover:border-accent hover:bg-accent/[0.05]"
            >
              <Icon name={k.icon} size={15} className="text-accent" />
              New {k.label.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-stone-400">Documents</div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          {list.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-stone-400">No documents yet.</div>
          ) : (
            list.map((d) => (
              <button
                key={d.id}
                onClick={() => void open(d.id)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] truncate ${
                  active?.id === d.id
                    ? 'bg-accent/[0.12] text-accent'
                    : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <Icon
                  name={d.docType === 'sheet' ? 'table' : d.docType === 'slides' ? 'slideshow' : 'description'}
                  size={14}
                  className="shrink-0 text-stone-400"
                />
                <span className="truncate">{d.title || 'Untitled'}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Editor pane */}
      <main className="flex-1 min-w-0 flex flex-col">
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-stone-400">
            <Icon name="draft" size={40} className="mb-3 text-stone-300 dark:text-stone-600" />
            <div className="text-[14px]">Pick a document, or create a new one.</div>
            <div className="text-[12px] mt-1">Your documents sync with PlexiDesk.</div>
          </div>
        ) : (
          <>
            <header className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-stone-200 dark:border-stone-800">
              <button onClick={() => close()} className="icon-btn" title="Back to list">
                <Icon name="arrow_back" size={16} />
              </button>
              {renaming ? (
                <input
                  autoFocus
                  defaultValue={active.title}
                  onBlur={(e) => {
                    void rename(e.target.value)
                    setRenaming(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="text-[14px] font-semibold bg-transparent border-b border-accent focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => setRenaming(true)}
                  className="text-[14px] font-semibold hover:text-accent"
                  title="Rename"
                >
                  {active.title || 'Untitled'}
                </button>
              )}
            </header>
            <div className="flex-1 min-h-0">
              {active.docType === 'doc' ? (
                <DocEditor key={active.id} content={active.body} title={active.title} onChange={(b) => saveBody(b)} />
              ) : active.docType === 'sheet' ? (
                <SheetEditor
                  key={active.id}
                  body={active.body as SheetBody}
                  title={active.title}
                  onChange={(b) => saveBody(b)}
                />
              ) : (
                <SlidesEditor
                  key={active.id}
                  body={active.body as SlidesBody}
                  title={active.title}
                  onChange={(b) => saveBody(b)}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
