import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { useMeetingLaunchStore } from '../stores/meetingLaunch'
import { startArtifactMeeting } from '../lib/startMeeting'
import { MEETING_ACCESS_OPTIONS, type MeetingAccessLevel } from '../lib/meetingAccess'
import { shareArtifactWithAttendees } from '../lib/meetingShare'
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
        void shareArtifactWithAttendees({ origin, attendees: emails, level }).then((r) => {
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
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-4 space-y-3"
        data-testid="meeting-launch-dialog"
      >
        <div className="flex items-center gap-2">
          <Icon name="videocam" size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Start a meeting</h3>
        </div>
        <p className="text-[12px] text-stone-500 dark:text-stone-400">
          From <span className="font-medium text-stone-700 dark:text-stone-200">{origin.title || 'this item'}</span>. Invite
          people and choose what access they get to it.
        </p>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
            Invite people (emails, optional)
          </span>
          <textarea
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="alex@acme.com, sam@acme.com"
            rows={2}
            className="mt-1 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-2 py-1.5 text-sm resize-none"
            data-testid="launch-attendees"
          />
        </label>

        <fieldset className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
            Access for attendees
          </span>
          {MEETING_ACCESS_OPTIONS.map((opt) => (
            <label
              key={opt.level}
              className="flex items-start gap-2 cursor-pointer select-none rounded-md px-2 py-1 hover:bg-stone-50 dark:hover:bg-stone-800"
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
                <span className="block text-sm text-stone-800 dark:text-stone-100">{opt.label}</span>
                <span className="block text-[11px] text-stone-500 dark:text-stone-400">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={close} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => void start()} disabled={busy} className="btn-primary" data-testid="launch-start">
            <Icon name="videocam" size={14} />
            <span>Start meeting</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
