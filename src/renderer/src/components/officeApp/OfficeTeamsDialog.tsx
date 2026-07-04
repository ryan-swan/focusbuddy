import { useEffect, useState } from 'react'
import { useAccountStore } from '@runtime'
import {
  listTeams,
  createTeam,
  listTeamMembers,
  addTeamMember,
  type Team,
  type TeamMember
} from '../../lib/teamsClient'
import Icon from '../Icon'

// Manage teams: create a team, see your teams, open one to view and add members
// (by handle). A team is then a target you can invite to a live document.

export default function OfficeTeamsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const token = useAccountStore((s) => s.sessionToken)
  const [teams, setTeams] = useState<Team[]>([])
  const [selected, setSelected] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [newName, setNewName] = useState('')
  const [handle, setHandle] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refreshTeams(): Promise<void> {
    if (!token) return
    setTeams(await listTeams(token))
  }

  useEffect(() => {
    void refreshTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function openTeam(t: Team): Promise<void> {
    setSelected(t)
    setMsg(null)
    if (token) setMembers(await listTeamMembers(token, t.id))
  }

  async function create(): Promise<void> {
    if (!token || !newName.trim() || busy) return
    setBusy(true)
    const t = await createTeam(token, newName.trim())
    setBusy(false)
    if (t) {
      setNewName('')
      await refreshTeams()
      void openTeam(t)
    }
  }

  async function add(): Promise<void> {
    if (!token || !selected || !handle.trim() || busy) return
    setBusy(true)
    const res = await addTeamMember(token, selected.id, handle.trim())
    setBusy(false)
    setMsg(res.ok ? `Added ${res.member?.handle ?? handle}.` : res.error ?? 'Could not add that handle.')
    if (res.ok) {
      setHandle('')
      setMembers(await listTeamMembers(token, selected.id))
      await refreshTeams()
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="office-teams-dialog"
        className="w-[520px] max-w-[94vw] rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Icon name="groups" size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-[var(--ink-90)]">Teams</span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        {!token ? (
          <div className="text-[12px] text-[var(--ink-50)] py-4">Sign in to create and manage teams.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Left: team list + create */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void create()
                  }}
                  placeholder="New team name"
                  data-testid="office-team-name"
                  className="flex-1 min-w-0 bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => void create()}
                  disabled={busy || !newName.trim()}
                  data-testid="office-team-create"
                  className="btn-primary text-[12px] px-2.5 py-1.5 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
              <div className="max-h-64 overflow-auto">
                {teams.length === 0 ? (
                  <div className="text-[12px] text-[var(--ink-40)] px-1 py-2">No teams yet.</div>
                ) : (
                  teams.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => void openTeam(t)}
                      data-testid={`office-team-${t.name}`}
                      className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${
                        selected?.id === t.id ? 'bg-accent/[0.12] text-accent' : 'hover:bg-[var(--surface-sunken)]'
                      }`}
                    >
                      <Icon name="group" size={14} className="text-[var(--ink-40)] shrink-0" />
                      <span className="truncate flex-1">{t.name}</span>
                      <span className="text-[10px] text-[var(--ink-40)]">{t.memberCount}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right: selected team members + add */}
            <div className="border-l border-[var(--edge-soft)] pl-4">
              {!selected ? (
                <div className="text-[12px] text-[var(--ink-40)] py-2">Pick a team to see its members.</div>
              ) : (
                <>
                  <div className="text-[12px] font-medium text-[var(--ink-70)] mb-2">{selected.name}</div>
                  {selected.role === 'owner' && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <input
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void add()
                        }}
                        placeholder="Add by handle, e.g. @alex"
                        data-testid="office-team-add-handle"
                        className="flex-1 min-w-0 bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => void add()}
                        disabled={busy || !handle.trim()}
                        data-testid="office-team-add"
                        className="btn-primary text-[12px] px-2.5 py-1.5 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  {msg && <div className="text-[11px] text-[var(--ink-50)] mb-1">{msg}</div>}
                  <div className="max-h-56 overflow-auto space-y-0.5">
                    {members.map((m) => (
                      <div key={m.accountId} className="flex items-center gap-2 text-[12px] px-1 py-1">
                        <Icon name="person" size={13} className="text-[var(--ink-40)]" />
                        <span className="truncate flex-1">{m.handle || m.accountId}</span>
                        {m.role === 'owner' && <span className="text-[10px] text-[var(--ink-40)]">owner</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
