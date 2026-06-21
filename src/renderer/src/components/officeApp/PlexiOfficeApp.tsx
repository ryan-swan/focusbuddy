// PlexiOffice — the standalone app shell. A focused Word/Excel/PowerPoint-style
// experience that reuses the very same editors PlexiDesk embeds (via @office), the
// same documents store, and the same file-manager store (OfficeDrive), so the two
// apps stay in lockstep. It deliberately does NOT pull in the desk canvas or
// collaboration — documents reach it through the cloud-documents API (@office
// sync), and the Drive organises them via the shared fb_files file manager.
//
// This is the second product's renderer root. It builds as its own HTML entry
// (plexioffice.html); the main process loads it when the app is the PlexiOffice
// build. The @office / @runtime imports are the package boundaries that will
// become real packages — call sites here won't change when they do.

import { useEffect, useState } from 'react'
import {
  DocEditor,
  SheetEditor,
  SlidesEditor,
  MapEditor,
  setCloudDocsEnabled,
  type SheetBody,
  type SlidesBody,
  type MapBody
} from '@office'
import { useTheme, useAccountStore } from '@runtime'
import { useDocumentsStore } from '../../stores/documents'
import { useFileManagerStore } from '../../stores/fileManager'
import OfficeAccountBar from './OfficeAccountBar'
import OfficeDrive from './OfficeDrive'
import UpdaterBanner from '../UpdaterBanner'
import Icon from '../Icon'

export default function PlexiOfficeApp(): JSX.Element {
  // Applying the shared theme is the whole reason useTheme lives in @runtime —
  // PlexiOffice looks like PlexiDesk without copying the theme system.
  useTheme()
  const { active, refresh, saveBody, rename, close } = useDocumentsStore()
  const refreshDrive = useFileManagerStore((s) => s.refresh)
  const [renaming, setRenaming] = useState(false)
  // PlexiOffice is cloud-first: sign in once and your documents are the same as in
  // PlexiDesk. Enable sync and boot the account session on mount.
  const token = useAccountStore((s) => s.sessionToken)
  useEffect(() => {
    setCloudDocsEnabled(true)
    void useAccountStore.getState().init()
  }, [])
  // Refresh on mount and whenever the signed-in account changes — a fresh sign-in
  // pulls that account's documents from the cloud, and the Drive reflects them.
  useEffect(() => {
    void refresh()
    void refreshDrive()
  }, [refresh, refreshDrive, token])

  // Build-time version, injected by electron-vite from package.json (same global
  // the desk footer uses). Drives the footer version pill + manual update check.
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

  return (
    <div className="h-screen w-screen flex flex-col bg-desk-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <div className="flex-1 min-h-0 flex">
      {/* Sidebar — branding, new-document actions, the document list */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-900/60">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-stone-200 dark:border-stone-800">
          <Icon name="auto_awesome" size={16} className="text-accent" />
          <span className="font-semibold text-[14px]">PlexiOffice</span>
        </div>

        {/* Drive — folders + documents, reusing the shared file-manager store. */}
        <OfficeDrive />

        <OfficeAccountBar />
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
              ) : active.docType === 'slides' ? (
                <SlidesEditor
                  key={active.id}
                  body={active.body as SlidesBody}
                  title={active.title}
                  onChange={(b) => saveBody(b)}
                />
              ) : (
                <MapEditor
                  key={active.id}
                  body={active.body as MapBody}
                  title={active.title}
                  onChange={(b) => saveBody(b)}
                />
              )}
            </div>
          </>
        )}
      </main>
      </div>

      {/* Footer — version pill (click to check for updates) + the shared updater
          banner, mirroring PlexiDesk so updates are visible here too. */}
      <footer className="h-7 shrink-0 px-3 flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 select-none">
        <span>PlexiOffice</span>
        <span className="text-stone-300 dark:text-stone-700">·</span>
        <button
          type="button"
          onClick={() => void window.api.update.check()}
          title="Click to check for updates"
          data-testid="office-version"
          className="font-mono hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
        >
          v{appVersion}
        </button>
        <UpdaterBanner />
      </footer>
    </div>
  )
}
