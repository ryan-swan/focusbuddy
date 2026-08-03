import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import Modal from './plexi/Modal'
import { useMeetingLaunchStore } from '../stores/meetingLaunch'
import { startArtifactMeeting } from '../lib/startMeeting'
import { MEETING_ACCESS_OPTIONS, type MeetingAccessLevel } from '../lib/meetingAccess'
import { shareArtifactWithAttendees, type MeetingAfterAccess } from '../lib/meetingShare'
import { notifyExternal } from '../lib/notify'

// The start-meeting dialog for a meeting launched from an artifact. It collects
// the people to invite and the access they get to the artifact, then opens the
// room. Adding attendees is optional; with none, this is just a labelled "start
// the meeting" step. Access "trickles down" to whoever is invited: each attendee
// is shared the artifact at the chosen level as the room opens.
export default function MeetingLaunchDialog(): JSX.Element | null {
  const origin = useMeetingLaunchStore((s) => s.origin)
  const close = useMeetingLaunchStore((s) => s.close)
  const [attendees, setAttendees] = useState('')
  const [level, setLevel] = useState<MeetingAccessLevel>('view-once')
  const [afterAccess, setAfterAccess] = useState<MeetingAfterAccess>('downgrade-view')
  const [busy, setBusy] = useState(false)

  if (!origin) return null

  function parseAttendees(): string[] {
    return attendees
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'))
  }

  async function start(): Promise<void> {
    if (busy || !origin) return
    setBusy(true)
    try {
      const emails = parseAttendees()
      // Open the room and navigate to it straight away so the host is in the
      // meeting without waiting on email delivery.
      await startArtifactMeeting(origin)
      // Trickle the artifact access down to the attendees in the background,
      // then report the honest outcome (sent / partial / no mailbox).
      if (emails.length > 0) {
        void shareArtifactWithAttendees({ origin, attendees: emails, level, afterAccess }).then((r) => {
          if (!r) return
          if (r.failed.length > 0) {
            notifyExternal('Meeting started', `Shared with ${r.shared}; could not reach ${r.failed.join(', ')}.`)
          } else if (r.shared > 0 && r.emailed < r.shared) {
            notifyExternal('Meeting started', `Shared with ${r.shared} in their inbox; some emails could not be sent.`)
          } else if (r.shared > 0) {
            notifyExternal('Meeting started', `Shared and invited ${r.shared} ${r.shared === 1 ? 'person' : 'people'}.`)
          }
        })
      }
      close()
      setAttendees('')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <Modal
      onClose={close}
      label="Start a meeting"
      z={300}
      className="w-[380px] rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-4 space-y-3"
      testId="meeting-launch-dialog"
    >
        <div className="flex items-center gap-2">
          <Icon name="videocam" size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-[var(--ink-100)]">Start a meeting</h3>
        </div>
        <p className="text-[12px] text-[var(--ink-50)]">
          From <span className="font-medium text-[var(--ink-70)]">{origin.title || 'this item'}</span>. Invite
          people and choose what access they get to it.
        </p>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">
            Invite people (emails, optional)
          </span>
          <textarea
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="alex@acme.com, sam@acme.com"
            rows={2}
            className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm resize-none"
            data-testid="launch-attendees"
          />
        </label>

        <fieldset className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">
            Access for attendees
          </span>
          {MEETING_ACCESS_OPTIONS.map((opt) => (
            <label
              key={opt.level}
              className="flex items-start gap-2 cursor-pointer select-none rounded-md px-2 py-1 hover:bg-[var(--surface-sunken)]"
            >
              <input
                type="radio"
                name="meeting-access"
                checked={level === opt.level}
                onChange={() => setLevel(opt.level)}
                className="mt-0.5 accent-accent"
                data-testid={`launch-access-${opt.level}`}
              />
              <span>
                <span className="block text-sm text-[var(--ink-90)]">{opt.label}</span>
                <span className="block text-[11px] text-[var(--ink-50)]">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {level === 'collaborate' && (
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">
              When the meeting ends
            </span>
            <select
              value={afterAccess}
              onChange={(e) => setAfterAccess(e.target.value as MeetingAfterAccess)}
              className="mt-1 w-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] rounded-md px-2 py-1.5 text-sm"
              data-testid="launch-after-access"
            >
              <option value="downgrade-view">Make it read-only</option>
              <option value="keep">Keep collaborate access</option>
              <option value="revoke">Revoke access</option>
            </select>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={close} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => void start()} disabled={busy} className="btn-primary" data-testid="launch-start">
            <Icon name="videocam" size={14} />
            <span>Start meeting</span>
          </button>
        </div>
    </Modal>,
    document.body
  )
}
