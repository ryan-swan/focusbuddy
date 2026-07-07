import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import Modal from './plexi/Modal'
import { useMeetingRoomStore } from '../stores/meetingRoom'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useAccountStore } from '../stores/account'
import { newMeetingRoomId } from '../lib/startMeeting'
import { sendMeetingInvites } from '../lib/meetingInvite'
import { personDisplayName } from '../lib/personName'

// Start or schedule a meeting and invite anyone by email, not only teammates who
// happen to be online. Two modes share one invitee list:
//  - Start now: opens the live room immediately and emails the join link to the
//    addresses entered, so external guests can join the same room.
//  - Schedule: writes a real calendar meeting block (with a stable room id) and
//    emails the invite. The host and every invitee open the same room later via
//    the calendar Join button or the haptyx://meet?room= link.
// Email delivery uses the connected mailbox; with none, we say so honestly rather
// than pretending the invites went out.

type Mode = 'now' | 'schedule'

const DURATIONS = [15, 30, 45, 60, 90, 120]

// Local datetime string (yyyy-MM-ddThh:mm) for the default schedule time: the
// next round half hour. Built from local parts so the picker matches the clock.
function defaultDateTime(): { date: string; time: string } {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
}

export default function NewMeetingDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const startRoom = useMeetingRoomStore((s) => s.start)
  const createBlock = useTimeBlockStore((s) => s.create)
  const account = useAccountStore((s) => s.account)
  const hostName = account ? personDisplayName(account) : undefined

  const [mode, setMode] = useState<Mode>('now')
  const [title, setTitle] = useState('')
  const [invitees, setInvitees] = useState('')
  const def = useMemo(defaultDateTime, [])
  const [date, setDate] = useState(def.date)
  const [time, setTime] = useState(def.time)
  const [durationMin, setDurationMin] = useState(30)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function parseEmails(): string[] {
    return Array.from(
      new Set(
        invitees
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes('@'))
      )
    )
  }

  // Turn the email result into one honest line: how many went out, who failed,
  // or that a mailbox needs connecting. Returns null when there was nothing to
  // send so the caller can skip the note.
  function inviteNote(r: { sent: number; failed: string[]; noAccount: boolean }, count: number): string | null {
    if (count === 0) return null
    if (r.noAccount) return 'Connect a mailbox in Mail to email the invites. The join link is on the meeting.'
    if (r.failed.length > 0) return `Invited ${r.sent}; could not email ${r.failed.join(', ')}.`
    return `Invited ${r.sent} ${r.sent === 1 ? 'person' : 'people'} by email.`
  }

  async function startNow(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const emails = parseEmails()
      const roomId = await startRoom(title.trim() || 'Meeting')
      if (!roomId) {
        setError('Could not start the meeting. Check your microphone and camera permissions.')
        return
      }
      // Email the join link for the room we just opened, so invited guests land
      // in the same room. The host is already in it; delivery runs in the
      // background and its outcome is reported honestly.
      if (emails.length > 0) {
        const r = await sendMeetingInvites({
          title: title.trim() || 'Meeting',
          startMs: Date.now(),
          durationMin,
          roomId,
          invitees: emails,
          hostName
        })
        const msg = inviteNote(r, emails.length)
        if (msg) setNote(msg)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function schedule(): Promise<void> {
    if (busy) return
    const emails = parseEmails()
    const startMs = new Date(`${date}T${time}`).getTime()
    if (!Number.isFinite(startMs)) {
      setError('Pick a valid date and time.')
      return
    }
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const roomId = newMeetingRoomId()
      await createBlock({
        title: title.trim() || 'Meeting',
        startMs,
        durationMin,
        meeting: { roomId, invitees: emails }
      })
      let msg = 'Meeting scheduled. It is on your calendar with a Join button.'
      if (emails.length > 0) {
        const r = await sendMeetingInvites({ title: title.trim() || 'Meeting', startMs, durationMin, roomId, invitees: emails, hostName })
        const im = inviteNote(r, emails.length)
        if (im) msg = `${msg} ${im}`
      }
      setNote(msg)
      // Give the confirmation a moment to read, then close.
      setTimeout(onClose, 1400)
    } finally {
      setBusy(false)
    }
  }

  const emailCount = parseEmails().length

  return createPortal(
    <Modal
      onClose={onClose}
      label="New meeting"
      z={300}
      className="w-[400px] rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-4 space-y-3"
      testId="new-meeting-dialog"
    >
      <div className="flex items-center gap-2">
        <Icon name="video_call" size={17} className="text-rose-500" />
        <h3 className="text-sm font-semibold text-[var(--ink-100)]">New meeting</h3>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex self-start rounded-md border border-[var(--edge-soft)] overflow-hidden text-[12px]" data-testid="new-meeting-mode">
        {(['now', 'schedule'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setNote(null)
              setError(null)
            }}
            className={`px-3 py-1 ${mode === m ? 'bg-rose-500 text-white' : 'text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'}`}
            data-testid={`new-meeting-mode-${m}`}
          >
            {m === 'now' ? 'Start now' : 'Schedule'}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">Title (optional)</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting"
          className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm"
          data-testid="new-meeting-title"
        />
      </label>

      {mode === 'schedule' && (
        <div className="flex items-end gap-2" data-testid="new-meeting-when">
          <label className="block flex-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm"
              data-testid="new-meeting-date"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm"
              data-testid="new-meeting-time"
            />
          </label>
        </div>
      )}

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">Length</span>
        <select
          value={durationMin}
          onChange={(e) => setDurationMin(Number(e.target.value))}
          className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm"
          data-testid="new-meeting-duration"
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d < 60 ? `${d} min` : d === 60 ? '1 hour' : `${d / 60} hours`}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">
          Invite by email (optional)
        </span>
        <textarea
          value={invitees}
          onChange={(e) => setInvitees(e.target.value)}
          placeholder="alex@acme.com, sam@example.com"
          rows={2}
          className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm resize-none"
          data-testid="new-meeting-invitees"
        />
        <span className="mt-0.5 block text-[11px] text-[var(--ink-50)]">
          Anyone with the emailed link can join, inside or outside your organisation.
        </span>
      </label>

      {note && (
        <div className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11.5px] px-2.5 py-1.5" data-testid="new-meeting-note">
          {note}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11.5px] px-2.5 py-1.5" data-testid="new-meeting-error">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        {mode === 'now' ? (
          <button onClick={() => void startNow()} disabled={busy} className="btn-primary" data-testid="new-meeting-start">
            <Icon name="videocam" size={14} />
            <span>{emailCount > 0 ? `Start & invite ${emailCount}` : 'Start now'}</span>
          </button>
        ) : (
          <button onClick={() => void schedule()} disabled={busy} className="btn-primary" data-testid="new-meeting-schedule">
            <Icon name="event" size={14} />
            <span>{emailCount > 0 ? `Schedule & invite ${emailCount}` : 'Schedule'}</span>
          </button>
        )}
      </div>
    </Modal>,
    document.body
  )
}
