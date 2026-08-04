import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { useViewStore } from '../../stores/view'
import { useNodeStore } from '../../stores/nodes'
import {
  routeDigest,
  listDigestDesks,
  listDigestFolders,
  type DigestInput,
  type DigestDestination,
  type RouteResult
} from '../../lib/digestRouter'

// "Save or send" for the standup. The digest is only useful if you can put it
// somewhere you work: onto a desk, into a fresh room+desk, or saved to Drive
// (root or a chosen folder). Every write goes through digestRouter, which uses the
// same public chokepoints the rest of the app uses, and reports honestly — a
// failed write says so and never claims a save that did not happen.

type Step = 'menu' | 'desk' | 'folder' | 'new' | 'result'

export default function StandupOutputPicker({ input }: { input: DigestInput | null }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('menu')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RouteResult | null>(null)
  const [desks, setDesks] = useState<Array<{ id: string; title: string }>>([])
  const [folders, setFolders] = useState<Array<{ id: string; name: string; depth: number }>>([])
  const [deskId, setDeskId] = useState('')
  const [folderId, setFolderId] = useState('')
  const [roomName, setRoomName] = useState('Standups')
  const [deskName, setDeskName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape so the popover behaves like every other menu.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) reset()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') reset()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function reset(): void {
    setOpen(false)
    setStep('menu')
    setResult(null)
    setBusy(false)
  }

  async function go(dest: DigestDestination): Promise<void> {
    if (!input || busy) return
    setBusy(true)
    const r = await routeDigest(dest, input)
    setResult(r)
    setStep('result')
    setBusy(false)
  }

  async function pickDesk(): Promise<void> {
    setDesks(await listDigestDesks())
    setStep('desk')
  }

  async function pickFolder(): Promise<void> {
    setFolders(await listDigestFolders())
    setStep('folder')
  }

  function openResult(): void {
    if (!result?.target) return
    if (result.target.deskId) {
      useNodeStore.getState().setActive(result.target.deskId)
      useViewStore.getState().goTask(result.target.deskId)
    } else if (result.target.docId) {
      useViewStore.getState().goDocument(result.target.docId)
    }
    reset()
  }

  const itemCls =
    'w-full text-left px-3 py-2 rounded-lg text-[13px] text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] flex items-center gap-2.5'

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => (open ? reset() : setOpen(true))}
        disabled={!input}
        title="Save or send this standup"
        data-testid="standup-output-btn"
        className="icon-btn h-7 px-2 gap-1.5 inline-flex items-center text-[12px] text-[var(--ink-60)] hover:text-[rgb(var(--accent))] disabled:opacity-40 rounded-lg border border-[var(--edge-soft)]"
      >
        <Icon name="ios_share" size={14} />
        <span>Save</span>
      </button>

      {open && (
        <div
          data-testid="standup-output-menu"
          className="absolute right-0 top-9 z-[95] w-72 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl p-1.5"
        >
          {step === 'menu' && (
            <div className="space-y-0.5">
              <button className={itemCls} data-testid="dest-desk" onClick={pickDesk}>
                <Icon name="dashboard" size={16} className="text-[var(--ink-50)]" />
                Add to a desk…
              </button>
              <button
                className={itemCls}
                data-testid="dest-new-room"
                onClick={() => {
                  setDeskName(`Standup — ${input?.dateLabel ?? ''}`.trim())
                  setStep('new')
                }}
              >
                <Icon name="create_new_folder" size={16} className="text-[var(--ink-50)]" />
                New room + desk
              </button>
              <button className={itemCls} data-testid="dest-drive" onClick={() => void go({ kind: 'drive' })}>
                <Icon name="cloud" size={16} className="text-[var(--ink-50)]" />
                Save to Drive
              </button>
              <button className={itemCls} data-testid="dest-folder" onClick={pickFolder}>
                <Icon name="folder" size={16} className="text-[var(--ink-50)]" />
                Save to a Drive folder…
              </button>
            </div>
          )}

          {step === 'desk' && (
            <div className="p-1.5 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--ink-50)] font-semibold">Add to which desk</div>
              {desks.length === 0 ? (
                <div className="text-[12px] text-[var(--ink-40)] py-1">No desks yet. Try “New room + desk”.</div>
              ) : (
                <select
                  data-testid="desk-select"
                  value={deskId}
                  onChange={(e) => setDeskId(e.target.value)}
                  className="w-full h-8 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface)] px-2 text-[13px]"
                >
                  <option value="">Choose a desk…</option>
                  {desks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex justify-between items-center pt-1">
                <button className="text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-90)]" onClick={() => setStep('menu')}>
                  Back
                </button>
                <button
                  disabled={!deskId || busy}
                  data-testid="desk-confirm"
                  onClick={() => void go({ kind: 'desk', deskId, deskTitle: desks.find((d) => d.id === deskId)?.title })}
                  className="h-7 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12px] disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {step === 'folder' && (
            <div className="p-1.5 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--ink-50)] font-semibold">Save into which folder</div>
              <select
                data-testid="folder-select"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full h-8 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface)] px-2 text-[13px]"
              >
                <option value="">Drive (root)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {`${'  '.repeat(f.depth)}${f.name}`}
                  </option>
                ))}
              </select>
              <div className="flex justify-between items-center pt-1">
                <button className="text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-90)]" onClick={() => setStep('menu')}>
                  Back
                </button>
                <button
                  disabled={busy}
                  data-testid="folder-confirm"
                  onClick={() =>
                    void go(
                      folderId
                        ? { kind: 'drive-folder', folderId, folderName: folders.find((f) => f.id === folderId)?.name }
                        : { kind: 'drive' }
                    )
                  }
                  className="h-7 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12px] disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {step === 'new' && (
            <div className="p-1.5 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--ink-50)] font-semibold">New room + desk</div>
              <input
                data-testid="new-room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Room name"
                className="w-full h-8 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface)] px-2 text-[13px]"
              />
              <input
                data-testid="new-desk-name"
                value={deskName}
                onChange={(e) => setDeskName(e.target.value)}
                placeholder="Desk name"
                className="w-full h-8 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface)] px-2 text-[13px]"
              />
              <div className="flex justify-between items-center pt-1">
                <button className="text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-90)]" onClick={() => setStep('menu')}>
                  Back
                </button>
                <button
                  disabled={busy}
                  data-testid="new-confirm"
                  onClick={() => void go({ kind: 'new-room-desk', roomName, deskName })}
                  className="h-7 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12px] disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="p-2.5 space-y-2" data-testid="standup-output-result">
              <div className="flex items-start gap-2">
                <Icon
                  name={result.ok ? 'check_circle' : 'error'}
                  size={16}
                  className={result.ok ? 'text-emerald-500 mt-0.5' : 'text-red-500 mt-0.5'}
                />
                <span className="text-[13px] text-[var(--ink-90)]">{result.message}</span>
              </div>
              <div className="flex justify-end gap-2">
                {result.ok && result.target && (
                  <button
                    data-testid="result-open"
                    onClick={openResult}
                    className="h-7 px-3 rounded-lg border border-[var(--edge-soft)] text-[12px] text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]"
                  >
                    Open
                  </button>
                )}
                <button onClick={reset} className="h-7 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12px]">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
