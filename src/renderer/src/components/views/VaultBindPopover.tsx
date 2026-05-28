import { useEffect, useRef, useState } from 'react'
import type { ConnectedApp, VaultEntryStored } from '@shared/types'
import { useVaultStore } from '../../stores/vault'
import { useConnectedAppsStore } from '../../stores/connectedApps'
import Icon from '../Icon'

interface Props {
  app: ConnectedApp
  onClose: () => void
}

// Small dropdown that binds a Connected App to a vault entry for auto-fill.
// Shown anchored under the key icon in the ConnectedAppView toolbar. The
// component owns no significant state of its own — it reads `unlocked` +
// `entries` from the vault store and the binding from the connected app.
export default function VaultBindPopover({ app, onClose }: Props): JSX.Element {
  const unlocked = useVaultStore((s) => s.unlocked)
  const entries = useVaultStore((s) => s.entries)
  const refreshMeta = useVaultStore((s) => s.refreshMeta)
  const addEntry = useVaultStore((s) => s.addEntry)
  const setVaultEntry = useConnectedAppsStore((s) => s.setVaultEntry)
  const update = useConnectedAppsStore((s) => s.update)
  const ref = useRef<HTMLDivElement | null>(null)
  const [creating, setCreating] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void refreshMeta()
  }, [refreshMeta])

  // Click-outside closes the popover. We listen on mousedown so the close fires
  // before any click handler outside that might re-open us.
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  async function bind(entry: VaultEntryStored): Promise<void> {
    await setVaultEntry(app.id, entry.id)
    onClose()
  }

  async function unbind(): Promise<void> {
    await setVaultEntry(app.id, null)
    onClose()
  }

  async function toggleAutofill(): Promise<void> {
    await update(app.id, { autofillEnabled: !app.autofillEnabled })
  }

  async function saveNew(): Promise<void> {
    if (!username || !password || saving) return
    setSaving(true)
    try {
      const entry = await addEntry({
        title: app.title,
        url: app.url,
        username,
        secret: { password }
      })
      if (entry) {
        await setVaultEntry(app.id, entry.id)
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const boundEntry = app.vaultEntryId
    ? entries.find((e) => e.id === app.vaultEntryId) ?? null
    : null

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg p-2"
    >
      <div className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-stone-200 dark:border-stone-700">
        <span className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Auto-fill
        </span>
        {boundEntry && (
          <button
            onClick={() => void toggleAutofill()}
            className="text-[10px] px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
            title="Toggle auto-fill for this app"
          >
            {app.autofillEnabled ? 'enabled' : 'disabled'}
          </button>
        )}
      </div>

      {!unlocked && (
        <div className="px-2 py-3 text-[12px] text-stone-600 dark:text-stone-400 leading-snug">
          Vault is locked. Open the Vault from the sidebar and unlock it to bind
          credentials here.
        </div>
      )}

      {unlocked && !creating && (
        <>
          {boundEntry && (
            <div className="flex items-center gap-2 mx-1 mb-2 p-2 rounded bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
              <Icon name="key" size={14} className="text-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-stone-800 dark:text-stone-100 truncate">
                  {boundEntry.title}
                </div>
                {boundEntry.username && (
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate font-mono">
                    {boundEntry.username}
                  </div>
                )}
              </div>
              <button
                onClick={() => void unbind()}
                className="icon-btn hover:!text-red-700"
                title="Unlink"
              >
                <Icon name="link_off" size={12} />
              </button>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {entries.length === 0 && (
              <div className="px-2 py-3 text-[12px] text-stone-500 dark:text-stone-400 text-center">
                No vault entries yet.
              </div>
            )}
            {entries
              .filter((e) => e.id !== boundEntry?.id)
              .map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => void bind(entry)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2"
                >
                  <Icon name="key" size={12} className="text-stone-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-stone-800 dark:text-stone-100 truncate">
                      {entry.title}
                    </div>
                    {entry.username && (
                      <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate font-mono">
                        {entry.username}
                      </div>
                    )}
                  </div>
                </button>
              ))}
          </div>

          <button
            onClick={() => setCreating(true)}
            className="mt-2 w-full px-2 py-1.5 rounded border border-dashed border-stone-300 dark:border-stone-700 text-[12px] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center justify-center gap-1"
          >
            <Icon name="add" size={12} />
            <span>Save new credentials</span>
          </button>
        </>
      )}

      {unlocked && creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void saveNew()
          }}
          className="flex flex-col gap-2 px-1"
        >
          <input
            autoFocus
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username or email"
            className="text-[12px] px-2 py-1.5 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="text-[12px] px-2 py-1.5 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-[11px] px-2 py-1 rounded border border-stone-300 dark:border-stone-700"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={!username || !password || saving}
              className="btn-primary !text-[11px] !px-2 !py-1 disabled:opacity-60"
            >
              {saving ? 'saving…' : 'save + bind'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
