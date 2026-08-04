import { useState } from 'react'
import Icon from '../Icon'

// Bulk-add files and folders to the Brain, independent of any desk (operator ask).
// Reuses the existing bulk primitives: fileManager.pickFiles (multi-select) and
// importFolder (whole tree) ingest into the file library (so the items are also in
// Drive and can be added to desks / used in Assemble later), then
// brain.ingestWorkspace indexes them so the AI grounds on them. Honest results —
// reports exactly what was added and indexed; a cancel says "nothing added".

export default function BrainBulkAdd(): JSX.Element {
  const [busy, setBusy] = useState<null | 'files' | 'folder'>(null)
  const [note, setNote] = useState<string | null>(null)

  async function index(): Promise<number | null> {
    try {
      const res = await window.api.brain.ingestWorkspace()
      return res.files
    } catch {
      return null
    }
  }

  async function addFiles(): Promise<void> {
    if (busy) return
    setBusy('files')
    setNote(null)
    try {
      const files = await window.api.fileManager.pickFiles(null)
      if (!files || files.length === 0) {
        setNote('Nothing added.')
        return
      }
      const indexed = await index()
      setNote(
        `Added ${files.length} file${files.length === 1 ? '' : 's'} to the Brain` +
          (indexed !== null ? ` — ${indexed} indexed for AI.` : '.')
      )
    } catch (e) {
      setNote(`Could not add files: ${(e as Error).message || 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  async function addFolder(): Promise<void> {
    if (busy) return
    setBusy('folder')
    setNote(null)
    try {
      const res = await window.api.fileManager.importFolder(null)
      if (!res.ok || res.canceled) {
        setNote('Nothing added.')
        return
      }
      const n = res.files ?? 0
      const indexed = await index()
      setNote(
        `Added ${n} file${n === 1 ? '' : 's'} from the folder to the Brain` +
          (indexed !== null ? ` — ${indexed} indexed for AI.` : '.')
      )
    } catch (e) {
      setNote(`Could not add folder: ${(e as Error).message || 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-[var(--edge-soft)] text-[11.5px] text-[var(--ink-80)] hover:border-[rgb(var(--accent))]/40 hover:text-[rgb(var(--accent))] disabled:opacity-50'

  return (
    <div className="px-3 pb-2.5" data-testid="brain-bulk-add">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold mb-1.5">
        Add files &amp; folders
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => void addFiles()} disabled={!!busy} data-testid="brain-add-files" className={btn} title="Add many files at once">
          <Icon name={busy === 'files' ? 'autorenew' : 'upload_file'} size={15} className={busy === 'files' ? 'animate-spin' : ''} />
          Files
        </button>
        <button onClick={() => void addFolder()} disabled={!!busy} data-testid="brain-add-folder" className={btn} title="Add a whole folder (with its subfolders)">
          <Icon name={busy === 'folder' ? 'autorenew' : 'drive_folder_upload'} size={15} className={busy === 'folder' ? 'animate-spin' : ''} />
          Folder
        </button>
      </div>
      {note && (
        <div className="mt-1.5 text-[11px] text-[var(--ink-50)]" data-testid="brain-add-note">
          {note}
        </div>
      )}
    </div>
  )
}
