import { useCallback, useEffect, useState } from 'react'
import Icon from '../Icon'

// ── Backup & data ────────────────────────────────────────────────────────────
// Everything you make lives in one local database. This section is the recovery
// story: export a portable snapshot, restore one, and a note that the app also
// keeps automatic rotating snapshots. API keys are deliberately out of scope —
// they live in the OS keychain and can't travel in a portable file.

interface BackupInfo {
  dir: string
  count: number
  lastBackupMs: number | null
}

function relativeTime(ms: number | null): string {
  if (ms == null) return 'none yet'
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

export default function BackupSection(): JSX.Element {
  const [info, setInfo] = useState<BackupInfo | null>(null)
  const [busy, setBusy] = useState<'export' | 'restore' | 'exportJson' | 'importJson' | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    setInfo(await window.api.backup.info())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onExport(): Promise<void> {
    setBusy('export')
    setMessage(null)
    try {
      const r = await window.api.backup.export()
      if (r.ok) {
        setMessage({ kind: 'ok', text: 'Backup saved.' })
        await refresh()
      } else if (!r.canceled) {
        setMessage({ kind: 'err', text: r.error ?? 'Export failed.' })
      }
    } finally {
      setBusy(null)
    }
  }

  // Portable export is a different promise from a backup. A .fbbackup restores
  // THIS app; the JSON is the one you can read, keep, and take somewhere else.
  async function onExportJson(): Promise<void> {
    setBusy('exportJson')
    setMessage(null)
    try {
      const r = await window.api.workspaceExport.exportJson()
      if ('canceled' in r && r.canceled) return
      if (r.ok) {
        const total = Object.values(r.counts).reduce((a, b) => a + b, 0)
        setMessage({
          kind: 'ok',
          text: `Exported ${total.toLocaleString()} records to ${r.path.split('/').pop()} (${(r.bytes / 1e6).toFixed(1)} MB). File contents are referenced, not embedded — see the note inside.`
        })
      } else {
        setMessage({ kind: 'err', text: r.error ?? 'Export failed.' })
      }
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function onImportJson(): Promise<void> {
    setBusy('importJson')
    setMessage(null)
    try {
      const r = await window.api.workspaceExport.importJson()
      if (r.canceled) return
      if (!r.ok) {
        setMessage({ kind: 'err', text: r.reason ?? 'Import failed.' })
        return
      }
      setMessage({
        kind: 'ok',
        text:
          `Imported ${r.imported.toLocaleString()} records` +
          (r.skipped > 0 ? `, skipped ${r.skipped.toLocaleString()} already here` : '') +
          (r.exportedAt ? ` (from an export made ${new Date(r.exportedAt).toLocaleDateString()})` : '') +
          '. Nothing existing was overwritten.'
      })
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function onRestore(): Promise<void> {
    setBusy('restore')
    setMessage(null)
    try {
      const r = await window.api.backup.restore()
      if (r.ok) {
        // The live database was swapped under us. Reload the window so every
        // view re-reads the restored data.
        setMessage({ kind: 'ok', text: 'Restored. Reloading…' })
        setTimeout(() => window.location.reload(), 600)
      } else if (!r.canceled) {
        setMessage({ kind: 'err', text: r.error ?? 'Restore failed.' })
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-2">
      <div className="fb-t-caption uppercase tracking-[0.12em] font-medium">
        Backup &amp; data
      </div>
      <p className="fb-t-caption text-[var(--ink-50)] leading-snug">
        Everything you make is stored in one local database. Export a portable snapshot to keep
        it safe or move it to another machine. The app also keeps automatic snapshots and rotates
        the last seven.
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => void onExport()}
          disabled={busy !== null}
          className="fb-btn-surface inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-chip)] fb-t-caption hover:bg-[var(--surface-sunken)] hover:border-accent transition-colors disabled:opacity-50"
        >
          <Icon name="download" size={13} />
          <span>{busy === 'export' ? 'Exporting…' : 'Export a backup'}</span>
        </button>
        <button
          onClick={() => void onRestore()}
          disabled={busy !== null}
          className="fb-btn-surface inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-chip)] fb-t-caption hover:bg-[var(--surface-sunken)] hover:border-accent transition-colors disabled:opacity-50"
        >
          <Icon name="restore" size={13} />
          <span>{busy === 'restore' ? 'Restoring…' : 'Restore from backup…'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => void onExportJson()}
          disabled={busy !== null}
          data-testid="workspace-export-json"
          className="fb-btn-surface inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-chip)] fb-t-caption hover:bg-[var(--surface-sunken)] hover:border-accent transition-colors disabled:opacity-50"
        >
          <Icon name="file_save" size={13} />
          <span>{busy === 'exportJson' ? 'Exporting…' : 'Export my work (JSON)'}</span>
        </button>
        <button
          onClick={() => void onImportJson()}
          disabled={busy !== null}
          data-testid="workspace-import-json"
          className="fb-btn-surface inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-chip)] fb-t-caption hover:bg-[var(--surface-sunken)] hover:border-accent transition-colors disabled:opacity-50"
        >
          <Icon name="upload_file" size={13} />
          <span>{busy === 'importJson' ? 'Importing…' : 'Import an export…'}</span>
        </button>
      </div>

      <div className="flex items-center justify-between fb-t-caption text-[var(--ink-50)]">
        <span>
          {info ? `${info.count} snapshot${info.count === 1 ? '' : 's'} · last ${relativeTime(info.lastBackupMs)}` : 'Checking…'}
        </span>
        <button
          onClick={() => void window.api.backup.revealFolder()}
          className="hover:text-accent underline-offset-2 hover:underline"
        >
          Open backups folder
        </button>
      </div>

      {message && (
        <div
          className={`fb-t-caption rounded-[var(--radius-chip)] p-1.5 ${
            message.kind === 'ok'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <p className="fb-t-caption text-[var(--ink-40)] leading-snug">
        A backup restores this app. The JSON export is the one you can read and take
        elsewhere: it holds your desks, documents, tables, notes and knowledge in a
        documented format, never your vault, and it references file contents rather
        than embedding them. Importing only ever adds — it cannot overwrite what is
        already here. Restoring replaces all current data. Your current data is snapshotted first, so a restore
        is itself reversible. API keys are stored in your system keychain and are not included in a
        backup, so re-enter them after restoring on a new machine.
      </p>
    </div>
  )
}
