import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { whisperEnabled, setWhisperEnabled } from '../../lib/whisperPref'
import ModuleDashboard from '../ModuleDashboard'
import { bucketByWeek, periodDelta } from '../../lib/dashboardMetrics'
import { useMeetingsStore } from '../../stores/meetings'
import NewMeetingDialog from '../NewMeetingDialog'
import { usePresenceStore } from '../../stores/presence'
import { useAccountStore } from '../../stores/account'
import { useQuickCreate } from '../../stores/quickCreate'
import { startDm, uploadAttachment, sendMessage } from '../../lib/messagingClient'
import { useNodeStore } from '../../stores/nodes'
import { personDisplayName } from '../../lib/personName'
import { transcribeRecording } from '../../lib/transcribeRecording'
import type { Meeting, TranscriptSegment } from '@shared/meetings'
import { validateRecordSpans } from '../../lib/recordSpans'
import { validateCommitments, type ValidatedCommitment } from '../../lib/commitments'
import MeetingCommitmentsCard from '../MeetingCommitmentsCard'
import { RECORD_TEMPLATES } from '../../lib/recordTemplates'
import { useViewStore } from '../../stores/view'
import type { ActionProposal } from '@shared/types'

// PlexiMeet: meetings that turn into actions. Record a meeting and it is
// transcribed, summarised, and its action items extracted; or capture notes by
// hand. Action items become real tasks beside the work. Reads only real
// meetings; an empty history is honestly empty. Live transcription needs a
// configured key, surfaced plainly when it is missing.

function proposalLabels(p: ActionProposal): string[] {
  if (p.kind === 'create-todo-list') return p.items?.length ? p.items : [p.title]
  if (p.kind === 'create-task') return [p.title]
  if (p.kind === 'open-url') return [p.title || p.url]
  if ('title' in p && p.title) return [p.title]
  return []
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PlexiMeetView(): JSX.Element {
  const meetings = useMeetingsStore((s) => s.meetings)
  const loaded = useMeetingsStore((s) => s.loaded)
  const load = useMeetingsStore((s) => s.load)
  const createMeeting = useMeetingsStore((s) => s.create)
  const updateMeeting = useMeetingsStore((s) => s.update)
  const removeMeeting = useMeetingsStore((s) => s.remove)

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [whisper, setWhisper] = useState(whisperEnabled())
  const [retention, setRetention] = useState<'0' | '7' | '30' | '90' | 'keep'>('30')
  useEffect(() => {
    void window.api.meetings.getAudioRetention().then(setRetention).catch(() => {})
  }, [])
  const recRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  // DEC-079 — an Attention item's "meeting" chip lands here: select the
  // meeting it points at so the transcript is on screen. The id is selected
  // even if the list is still loading — selection resolves when it arrives.
  useEffect(() => {
    function onOpen(e: Event): void {
      const id = (e as CustomEvent).detail?.id as string | undefined
      if (id) setSelectedId(id)
    }
    window.addEventListener('fb:open-meeting', onOpen)
    return () => window.removeEventListener('fb:open-meeting', onOpen)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return meetings
    return meetings.filter((m) => `${m.title} ${m.summary} ${m.transcript}`.toLowerCase().includes(q))
  }, [meetings, query])

  const selected = meetings.find((m) => m.id === selectedId) ?? null
  const now = Date.now()

  async function startRecording(): Promise<void> {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        await transcribeAndSave(await blob.arrayBuffer(), rec.mimeType || 'audio/webm')
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch {
      setError('Could not access the microphone. Check your system permissions.')
    }
  }

  function stopRecording(): void {
    recRef.current?.stop()
  }

  async function transcribeAndSave(buffer: ArrayBuffer, mimeType: string): Promise<void> {
    setBusy('Transcribing the recording…')
    setError(null)
    try {
      // Unguarded before: a rejected transcribe left the spinner stuck forever.
      const t = await transcribeRecording(buffer, mimeType)
      if (!t.ok) {
        setError(
          t.reason === 'no_key'
            ? 'Recording captured, but transcription needs a key. Add an OpenAI or Anthropic key in Settings, then record again.'
            : `Transcription failed: ${t.error}`
        )
        return
      }
      setBusy('Summarising…')
      const sum = await window.api.voiceNote.process({ transcript: t.transcript, mode: 'summary' }).catch(() => null)
      setBusy('Pulling out action items…')
      const acts = await window.api.voiceNote.extractActions({ transcript: t.transcript }).catch(() => null)
      const actionItems = acts?.ok ? acts.proposals.flatMap(proposalLabels).filter(Boolean) : []
      const created = await createMeeting({
        title: `Meeting · ${fmtDate(Date.now())}`,
        transcript: t.transcript,
        // An empty summary when the AI step failed is honest: the transcript is
        // the real captured value, and nothing fake is filled in.
        summary: sum?.ok ? sum.text : '',
        actionItems,
        durationSec: t.durationSec
      })
      if (created) setSelectedId(created.id)
    } catch {
      setError('Something went wrong saving the recording. The audio was captured; please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function addManual(): Promise<void> {
    const created = await createMeeting({ title: 'New meeting' })
    if (created) setSelectedId(created.id)
  }

  // Live meeting + record-a-message wiring.
  const [showNew, setShowNew] = useState(false)
  const presencePeers = usePresenceStore((s) => s.peers)
  const token = useAccountStore((s) => s.sessionToken)
  const [showMsg, setShowMsg] = useState(false)
  const [msgTo, setMsgTo] = useState<{ accountId: string; handle: string; firstName?: string | null; lastName?: string | null } | null>(null)
  const [msgRecording, setMsgRecording] = useState(false)
  const [msgNote, setMsgNote] = useState<string | null>(null)
  const msgRecRef = useRef<MediaRecorder | null>(null)

  // Opening the New meeting dialog is the single entry point for starting or
  // scheduling a meeting, so the invite-by-email and schedule options are always
  // available no matter where the request comes from.
  function openNew(): void {
    setError(null)
    setShowNew(true)
  }

  // Global quick-create (Cmd+K "Start a meeting").
  const quickPending = useQuickCreate((s) => s.pending)
  useEffect(() => {
    if (quickPending === 'meet' && useQuickCreate.getState().consume('meet')) openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPending])

  // Record a short video message and send it to a teammate as a DM — the
  // "they're away, leave them something" path, like a quick Loom. Reuses the real
  // chat attachment pipeline (video kind), so a failure surfaces honestly rather
  // than pretending it sent. Falls back to audio only if there is no camera.
  async function recordMessageTo(peer: { accountId: string; handle: string; firstName?: string | null; lastName?: string | null }): Promise<void> {
    setMsgNote(null)
    setError(null)
    let stream: MediaStream
    let isVideo = true
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    } catch {
      // No camera (or denied): leave a voice message instead, still honest.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        isVideo = false
      } catch {
        setError('Could not access your camera or microphone. Check your system permissions.')
        return
      }
    }
    try {
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      const startedAt = Date.now()
      const mime = rec.mimeType || (isVideo ? 'video/webm' : 'audio/webm')
      const kind = isVideo ? ('video' as const) : ('voice' as const)
      const name = isVideo ? 'message-video.webm' : 'message.webm'
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setMsgRecording(false)
        if (!token) {
          setError('Sign in to send a message.')
          return
        }
        const blob = new Blob(chunks, { type: mime })
        const peerName = personDisplayName(peer, peer.handle)
        setMsgNote(`Sending to ${peerName}…`)
        const conversationId = await startDm(token, peer.handle)
        if (!conversationId) {
          setMsgNote(null)
          setError(`Could not open a conversation with ${peerName}.`)
          return
        }
        const att = await uploadAttachment(token, conversationId, kind, await blob.arrayBuffer(), { name, mime, ext: 'webm' })
        if (!att) {
          setMsgNote(null)
          setError('Could not upload the message.')
          return
        }
        const sent = await sendMessage(token, conversationId, '', {
          kind,
          id: att.id,
          name,
          mimeType: mime,
          sizeBytes: att.sizeBytes,
          durationMs: Date.now() - startedAt
        })
        setMsgNote(sent ? `Sent to ${peerName}.` : null)
        if (!sent) setError('Could not send the message.')
        setMsgTo(null)
      }
      msgRecRef.current = rec
      rec.start()
      setMsgTo(peer)
      setMsgRecording(true)
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      setError('Could not start recording. Check your system permissions.')
    }
  }

  function stopMessage(): void {
    msgRecRef.current?.stop()
  }

  return (
    <div className="h-full w-full flex bg-[var(--surface-base)] text-[var(--ink-100)]" data-testid="pleximeet-view">
      {/* List */}
      <div className="w-[330px] shrink-0 border-r border-[var(--edge-soft)] flex flex-col">
        <div className="px-4 py-3.5 border-b border-[var(--edge-soft)]">
          <div className="flex items-center gap-2">
            <Icon name="groups" size={18} className="text-rose-500" filled />
            <h1 className="text-[15px] font-bold tracking-tight text-[var(--ink-100)]">PlexiMeet</h1>
          </div>
          <p className="mt-0.5 text-[11.5px] text-[var(--ink-70)]">Meetings that turn into actions.</p>
        </div>

        <div className="px-3 py-2.5 space-y-2">
          {/* Primary: a live, multi-party meeting (connect to teammates). */}
          <button
            onClick={openNew}
            data-testid="meet-start-live"
            className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-md bg-rose-500 text-white text-[12.5px] font-semibold hover:bg-rose-600"
          >
            <Icon name="video_call" size={17} /> Start or schedule a meeting
          </button>

          {/* DEC-098 made meeting recording consent-only: this preference no
              longer starts anything in a MEETING (recording begins in the
              room, with everyone asked). It still governs 1:1 PlexiCam calls
              until their own consent round — the copy says what is true. */}
          <label
            className="flex items-center gap-2 px-0.5 text-[11.5px] text-[var(--ink-70)] cursor-pointer"
            title="Applies to 1:1 calls. Meetings never auto-record — recording starts in the room and every participant is asked first."
          >
            <input
              type="checkbox"
              checked={whisper}
              onChange={(e) => {
                setWhisper(e.target.checked)
                setWhisperEnabled(e.target.checked)
              }}
              data-testid="meet-whisper-toggle"
              className="accent-[rgb(var(--accent))]"
            />
            <span>Transcribe &amp; summarise my 1:1 calls</span>
          </label>

          {/* M2c (CR-13) — audio retention. Local disk only, never uploaded. */}
          <label className="flex items-center justify-between gap-2 px-0.5 text-[11.5px] text-[var(--ink-70)]">
            <span title="Meeting audio stays on this machine and expires after this window. 'Keep' on a meeting overrides it.">
              Keep meeting audio
            </span>
            <select
              value={retention}
              onChange={(e) => {
                const v = e.target.value as '0' | '7' | '30' | '90' | 'keep'
                setRetention(v)
                void window.api.meetings.setAudioRetention(v)
              }}
              data-testid="meet-retention-select"
              className="fb-field bg-[var(--surface-sunken)] px-1.5 py-1 text-[11.5px]"
            >
              <option value="0">never (discard at wrap-up)</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="keep">forever</option>
            </select>
          </label>

          {/* Secondary: recording is one option, not the whole feature. */}
          <div className="flex items-center gap-2">
            {recording ? (
              <button
                onClick={stopRecording}
                data-testid="meet-stop"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-red-500 text-white text-[12px] font-medium animate-pulse"
              >
                <Icon name="stop_circle" size={15} /> Stop recording
              </button>
            ) : (
              <button
                onClick={() => void startRecording()}
                data-testid="meet-record"
                disabled={!!busy}
                className="fb-btn-surface flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                title="Record audio, transcribe it and extract action items"
              >
                <Icon name="mic" size={15} /> Record notes
              </button>
            )}
            <button
              onClick={() => setShowMsg((v) => !v)}
              data-testid="meet-message"
              className="fb-btn-surface flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)]"
              title="Record a quick message and send it to a teammate who is away"
            >
              <Icon name="voicemail" size={15} /> Message
            </button>
            <button
              onClick={() => void addManual()}
              data-testid="meet-add"
              disabled={!!busy}
              className="fb-btn-surface inline-flex items-center gap-1 px-2 py-1.5 text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)]"
              title="Add a meeting from notes" aria-label="Add a meeting from notes"
            >
              <Icon name="edit_note" size={15} />
            </button>
          </div>

          {/* Record-a-message picker: choose a teammate (away ones flagged) and leave them a voice note. */}
          {showMsg && (
            <div className="fb-card p-2" data-testid="meet-message-picker">
              {msgRecording && msgTo ? (
                <button
                  onClick={stopMessage}
                  data-testid="meet-message-stop"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-red-500 text-white text-[12px] font-medium animate-pulse"
                >
                  <Icon name="stop_circle" size={15} /> Stop &amp; send to {personDisplayName(msgTo, msgTo.handle)}
                </button>
              ) : (
                <>
                  <p className="px-1 pb-1 text-[11px] text-[var(--ink-50)]">Record a video message and send it to a teammate</p>
                  {Object.values(presencePeers).length === 0 ? (
                    <p className="px-1 py-2 text-[11.5px] text-[var(--ink-50)]">No teammates online right now.</p>
                  ) : (
                    Object.values(presencePeers).map((p) => (
                      <button
                        key={p.accountId}
                        onClick={() => void recordMessageTo({ accountId: p.accountId, handle: p.handle, firstName: p.firstName, lastName: p.lastName })}
                        data-testid={`meet-message-to-${p.accountId}`}
                        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-[var(--surface-sunken)] text-left"
                      >
                        <Icon name="account_circle" size={16} className="text-[var(--ink-50)]" />
                        <span className="flex-1 text-[12px] text-[var(--ink-90)] truncate">{personDisplayName(p, p.handle)}</span>
                        {(p.status === 'away' || p.status === 'busy' || p.status === 'focus') && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">{p.status}</span>
                        )}
                        <Icon name="videocam" size={14} className="text-[var(--ink-50)]" />
                      </button>
                    ))
                  )}
                </>
              )}
              {msgNote && <p className="mt-1.5 px-1 text-[11px] text-emerald-600 dark:text-emerald-400" data-testid="meet-message-note">{msgNote}</p>}
            </div>
          )}
        </div>

        {busy && (
          <div className="mx-3 mb-2 flex items-center gap-2 text-[11px] text-[var(--ink-70)]">
            <Icon name="progress_activity" size={13} className="animate-spin" /> {busy}
          </div>
        )}
        {error && (
          <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed" data-testid="meet-error">
            {error}
          </div>
        )}

        <div className="px-3 pb-2">
          <div className="fb-card flex items-center gap-1.5 px-2 py-1.5">
            <Icon name="search" size={14} className="text-[var(--ink-70)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings"
              data-testid="meet-search"
              className="flex-1 bg-transparent text-[12px] text-[var(--ink-100)] placeholder:text-[var(--ink-50)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 pb-2">
          {!loaded ? (
            <div className="px-3 py-10 flex items-center justify-center gap-2 text-[12px] text-[var(--ink-70)]">
              <Icon name="progress_activity" size={15} className="text-[rgb(var(--accent))] animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <Icon name="forum" size={26} className="text-[var(--ink-30)]" />
              <p className="mt-2 text-[12px] text-[var(--ink-70)] leading-relaxed">
                {meetings.length === 0
                  ? 'No meetings yet. Record one or add notes, and the actions land beside your work.'
                  : 'Nothing matches that search.'}
              </p>
            </div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                data-testid={`meet-row-${m.id}`}
                className={`w-full text-left rounded-lg px-3 py-2.5 mb-1 transition-colors ${
                  m.id === selectedId ? 'bg-[rgb(var(--accent)/0.10)] border border-[rgb(var(--accent)/0.30)]' : 'hover:bg-[var(--surface-sunken)] border border-transparent'
                }`}
              >
                <div className="text-[13px] font-semibold text-[var(--ink-100)] truncate">{m.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-[var(--ink-70)] fb-tabular">
                  <span>{fmtDate(m.createdAt)}</span>
                  {m.actionItems.length > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Icon name="task_alt" size={11} /> {m.actionItems.length}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <MeetingDetail
            key={selected.id}
            meeting={selected}
            onChange={(patch) => void updateMeeting(selected.id, patch)}
            onDelete={() => {
              void removeMeeting(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          <ModuleDashboard
            moduleKey="meet"
            title="Meetings"
            subtitle="Record a meeting and it becomes a summary, a transcript and real action items"
            icon="groups"
            accentClass="text-rose-500"
            stats={[
              {
                icon: 'groups',
                label: 'Meetings',
                value: meetings.length,
                tone: 'rose',
                delta: periodDelta(meetings.map((m) => m.createdAt), 7 * 86400000, now),
                sparkline: bucketByWeek(meetings.map((m) => m.createdAt), 8, now)
              },
              { icon: 'task_alt', label: 'Action items', value: meetings.reduce((n, m) => n + m.actionItems.length, 0), tone: 'accent' },
              {
                icon: 'schedule',
                label: 'Avg length',
                value: (() => {
                  const d = meetings.map((m) => m.durationSec).filter((s): s is number => typeof s === 'number')
                  return d.length ? `${Math.round(d.reduce((a, c) => a + c, 0) / d.length / 60)}m` : '—'
                })(),
                tone: 'sky'
              },
              { icon: 'description', label: 'Transcribed', value: meetings.filter((m) => m.transcript.trim().length > 0).length, tone: 'violet' }
            ]}
            timeline={{
              title: 'Meetings over time',
              points: bucketByWeek(meetings.map((m) => m.createdAt), 8, now),
              bucketLabel: 'last 8 weeks',
              unit: 'meetings',
              tone: 'rose',
              emptyHint: 'Hold your first meeting to see your cadence here.'
            }}
            breakdown={{
              title: 'Capture',
              icon: 'donut_small',
              items: [
                { label: 'Transcribed', value: meetings.filter((m) => m.transcript.trim().length > 0).length, tone: 'violet' as const },
                { label: 'Notes only', value: meetings.filter((m) => m.transcript.trim().length === 0).length, tone: 'stone' as const }
              ].filter((i) => i.value > 0),
              emptyHint: 'No meetings yet.'
            }}
            recentItems={{
              label: 'Recent meetings',
              items: meetings.slice(0, 6).map((m) => ({
                id: m.id,
                title: m.title,
                subtitle: m.summary ? m.summary.slice(0, 90) : m.actionItems.length ? `${m.actionItems.length} action item(s)` : 'No summary yet',
                meta: fmtDate(m.createdAt),
                status: m.actionItems.length ? { tone: 'accent' as const, label: `${m.actionItems.length} actions` } : undefined,
                onOpen: () => setSelectedId(m.id)
              })),
              onCreate: openNew,
              createLabel: 'Start a meeting',
              emptyHint: 'Start a live meeting and invite your teammates, or record notes and a message to send. Action items become real tasks.'
            }}
          />
        )}
      </div>

      {showNew && <NewMeetingDialog onClose={() => setShowNew(false)} />}
    </div>
  )
}

// M2b (SPEC-003 §3.4) — the three renderings of one Record, and the
// provenance treatment that is the entire trust model:
//   yours    — full ink, no marker. The user's words, never rewritten.
//   heard    — normal ink with a hairline left rule; the timestamp on
//              hover; clicking jumps to the moment in Thread.
//   inferred — lighter ink, no rule, no anchor. The machine's guess LOOKS
//              like a guess (the same accent-vs-ink doctrine as capture).
type RecordView = 'commitments' | 'brief' | 'thread'

function MeetingDetail({
  meeting,
  onChange,
  onDelete
}: {
  meeting: Meeting
  onChange: (patch: { title?: string; summary?: string; transcript?: string; actionItems?: string[] }) => void
  onDelete: () => void
}): JSX.Element {
  const createNode = useNodeStore((s) => s.create)
  const [title, setTitle] = useState(meeting.title)
  const [summary, setSummary] = useState(meeting.summary)
  const [transcript, setTranscript] = useState(meeting.transcript)
  const [showTranscript, setShowTranscript] = useState(false)
  const [madeTasks, setMadeTasks] = useState<Record<number, boolean>>({})
  // M2b — Commitments opens by default: the person who just left the room
  // is the most common reader and needs the shortest artifact (S3-DEC-022).
  const [view, setView] = useState<RecordView>('commitments')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const threadRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let alive = true
    setSegments([])
    void window.api.meetings.segments(meeting.id).then((s) => {
      if (alive) setSegments(s)
    })
    return () => {
      alive = false
    }
  }, [meeting.id])
  // 1/2/3 pick the rendering (SPEC-003 §3.10), never while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === '1') setView('commitments')
      if (e.key === '2') setView('brief')
      if (e.key === '3') setView('thread')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const fmtMs = (ms: number): string => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  // M2c — audio presence + the per-meeting keep override (CR-13), export,
  // template rebuild, and the door to the meeting's desk (S3-DEC-020).
  const [audio, setAudio] = useState<{ present: boolean; files: number; bytes: number; kept: boolean } | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  // M3 — extraction for PAST meetings: the same confirm stop, on demand.
  const [extracting, setExtracting] = useState(false)
  const [foundCommitments, setFoundCommitments] = useState<ValidatedCommitment[] | null>(null)
  const selfId = useAccountStore((s) => s.account?.id ?? '')
  async function findCommitments(): Promise<void> {
    if (extracting || segments.length === 0) return
    setExtracting(true)
    try {
      const roster = [
        ...new Map(
          segments
            .filter((s) => s.speakerAccountId)
            .map((s) => [s.speakerAccountId as string, { accountId: s.speakerAccountId as string, name: s.speakerName }])
        ).values()
      ]
      const ex = await window.api.meetings.extractCommitments({
        title: meeting.title,
        notes: (meeting.record?.spans ?? [])
          .filter((s) => s.tier === 'yours')
          .map((s) => s.text)
          .join('\n'),
        segments: segments.map((s) => ({
          id: s.id,
          startMs: s.startMs,
          speakerName: s.speakerName,
          speakerAccountId: s.speakerAccountId,
          text: s.text
        })),
        roster
      })
      setFoundCommitments(ex.ok ? validateCommitments(ex.commitments, segments, selfId) : [])
    } finally {
      setExtracting(false)
    }
  }
  const [exported, setExported] = useState<string | null>(null)
  const refreshMeetings = useMeetingsStore((s) => s.load)
  const goTask = useViewStore((s) => s.goTask)
  useEffect(() => {
    let alive = true
    setAudio(null)
    setExported(null)
    void window.api.meetings.audioInfo(meeting.id).then((a) => {
      if (alive) setAudio(a)
    })
    return () => {
      alive = false
    }
  }, [meeting.id])
  async function rebuildBrief(sections: string[]): Promise<void> {
    if (rebuilding || segments.length === 0) return
    setRebuilding(true)
    try {
      const enh = await window.api.meetings.enhanceRecord({
        title: meeting.title,
        // yours spans were minted at wrap-up from the live notes; reuse their
        // text as context — the user's words are already in the record.
        notes: (meeting.record?.spans ?? [])
          .filter((s) => s.tier === 'yours')
          .map((s) => s.text)
          .join('\n'),
        sections,
        segments: segments.map((s) => ({ id: s.id, startMs: s.startMs, speakerName: s.speakerName, text: s.text }))
      })
      if (enh.ok) {
        const yours = (meeting.record?.spans ?? []).filter((s) => s.tier === 'yours')
        const spans = [...yours, ...validateRecordSpans(enh.spans, segments)]
        await window.api.meetings.update(meeting.id, { record: { spans, generatedAt: Date.now() } })
        await refreshMeetings()
      }
    } finally {
      setRebuilding(false)
    }
  }
  const jumpToSegment = (segmentId: string): void => {
    setView('thread')
    setTimeout(() => {
      threadRef.current
        ?.querySelector(`[data-segment-id="${segmentId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
  }

  async function makeTask(idx: number, text: string): Promise<void> {
    await createNode({ kind: 'task', title: text, parentId: null }).catch(() => null)
    setMadeTasks((m) => ({ ...m, [idx]: true }))
  }

  return (
    <div className="h-full flex flex-col overflow-auto" data-testid="meet-detail">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--edge-soft)]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== meeting.title && onChange({ title })}
          className="flex-1 bg-transparent text-[17px] font-bold text-[var(--ink-100)]"
          data-testid="meet-title"
        />
        {meeting.deskNodeId && (
          <button
            onClick={() => goTask(meeting.deskNodeId!)}
            className="fb-btn-surface inline-flex items-center gap-1 text-[11px] px-2 py-1 text-[var(--ink-80)]"
            title="Open this meeting's desk — its documents live there"
            data-testid="meet-open-desk"
          >
            <Icon name="desk" size={13} /> Desk
          </button>
        )}
        <button
          onClick={() => void window.api.meetings.export(meeting.id, 'markdown').then((r) => r.ok && setExported(r.path ?? null))}
          className="fb-btn-surface inline-flex items-center gap-1 text-[11px] px-2 py-1 text-[var(--ink-80)]"
          title="Export as Markdown — notes, brief, commitments and transcript, provenance kept"
          data-testid="meet-export-md"
        >
          <Icon name="download" size={13} /> .md
        </button>
        <button
          onClick={() => void window.api.meetings.export(meeting.id, 'json').then((r) => r.ok && setExported(r.path ?? null))}
          className="fb-btn-surface inline-flex items-center gap-1 text-[11px] px-2 py-1 text-[var(--ink-80)]"
          title="Export as JSON — the full record, segments and audio manifest"
          data-testid="meet-export-json"
        >
          <Icon name="download" size={13} /> .json
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-[var(--ink-40)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          title="Delete meeting — its transcript segments and audio go with it" aria-label="Delete meeting"
          data-testid="meet-delete"
        >
          <Icon name="delete" size={16} />
        </button>
      </div>

      {/* M2b — the segmented control: three renderings, one Record. */}
      <div className="px-5 pt-3 flex items-center gap-1" data-testid="record-views">
        {(
          [
            ['commitments', 'Commitments', '1'],
            ['brief', 'Brief', '2'],
            ['thread', 'Thread', '3']
          ] as const
        ).map(([v, label, key]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            data-testid={`record-view-${v}`}
            className={`h-8 px-3 rounded-[var(--radius-chip)] text-[12.5px] font-medium fb-press transition-colors inline-flex items-center gap-1.5 ${
              view === v
                ? 'bg-[rgb(var(--accent))] text-white'
                : 'text-[var(--ink-60)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)]'
            }`}
          >
            {label}
            <span className={`text-[10px] ${view === v ? 'text-white/60' : 'text-[var(--ink-30)]'}`}>{key}</span>
          </button>
        ))}
      </div>

      {view === 'commitments' && (
        <div className="px-5 py-4 space-y-5" data-testid="rendering-commitments">
          {segments.length > 0 && foundCommitments === null && (
            <button
              onClick={() => void findCommitments()}
              disabled={extracting}
              className="fb-btn-surface inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 text-[var(--ink-90)] disabled:opacity-50"
              data-testid="find-commitments"
              title="Extract commitments from the transcript — they go through the confirm stop, never silently into Attention"
            >
              <Icon name="auto_awesome" size={14} className="text-[rgb(var(--accent))]" />
              {extracting ? 'Reading the transcript…' : 'Find commitments'}
            </button>
          )}
          {foundCommitments !== null &&
            (foundCommitments.length > 0 ? (
              <MeetingCommitmentsCard
                commitments={foundCommitments}
                meetingId={meeting.id}
                meetingTitle={meeting.title}
                deskNodeId={meeting.deskNodeId}
                onFiled={() => setFoundCommitments(null)}
              />
            ) : (
              <p className="text-[12.5px] text-[var(--ink-50)]">
                Nothing in this transcript reads as a commitment — an honest zero, not a failure.
              </p>
            ))}
          {meeting.actionItems.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-50)]">
              Nothing was committed to in this meeting — or nothing was recorded. Owners and
              routing into Attention arrive with extraction.
            </p>
          ) : (
            <div className="space-y-1.5">
              {meeting.actionItems.map((item, i) => (
                <div key={i} className="fb-card flex items-center gap-2 px-3 py-2">
                  <Icon name="task_alt" size={15} className="text-[rgb(var(--accent))] shrink-0" />
                  <span className="flex-1 text-[13px] text-[var(--ink-90)]">{item}</span>
                  <button
                    onClick={() => void makeTask(i, item)}
                    disabled={madeTasks[i]}
                    className="fb-btn-surface shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                    data-testid={`meet-make-task-${i}`}
                  >
                    <Icon name={madeTasks[i] ? 'check' : 'add_task'} size={13} /> {madeTasks[i] ? 'Added' : 'Task'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'brief' && (
        <div className="px-5 py-4 space-y-4" data-testid="rendering-brief-outer">
          {/* M2c (§3.5) — rebuild the Brief under a different template. The
              Commitments rendering is never templated: its shape is the
              product. yours spans survive every rebuild untouched. */}
          {segments.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap" data-testid="record-templates">
              {RECORD_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  disabled={rebuilding}
                  onClick={() => void rebuildBrief(tpl.sections)}
                  title={`Rebuild the Brief as “${tpl.name}” — sections: ${tpl.sections.join(' · ')}`}
                  className="h-7 px-2.5 rounded-full text-[11.5px] fb-press bg-[var(--surface-sunken)] text-[var(--ink-70)] hover:text-[var(--ink-100)] disabled:opacity-50"
                >
                  {rebuilding ? '…' : tpl.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {view === 'brief' && (
        <div className="px-5 pb-4" data-testid="rendering-brief">
          {meeting.record && meeting.record.spans.length > 0 ? (
            <div className="space-y-4">
              {/* yours first — the reader's own words lead. */}
              {meeting.record.spans.filter((s) => s.tier === 'yours').length > 0 && (
                <div className="space-y-1" data-testid="brief-yours">
                  {meeting.record.spans
                    .filter((s) => s.tier === 'yours')
                    .map((s, i) => (
                      <p key={`y${i}`} className="text-[13.5px] leading-relaxed text-[var(--ink-100)]">
                        {s.text}
                      </p>
                    ))}
                </div>
              )}
              {[...new Set(meeting.record.spans.filter((s) => s.tier !== 'yours').map((s) => s.section ?? 'Notes'))].map(
                (section) => (
                  <section key={section}>
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-70)] mb-1.5">
                      {section}
                    </h2>
                    <div className="space-y-1.5">
                      {meeting.record!.spans
                        .filter((s) => s.tier !== 'yours' && (s.section ?? 'Notes') === section)
                        .map((s, i) =>
                          s.tier === 'heard' && s.segmentId ? (
                            <button
                              key={`h${i}`}
                              onClick={() => jumpToSegment(s.segmentId!)}
                              title={s.startMs != null ? `Heard at ${fmtMs(s.startMs)} — click to jump to the moment` : undefined}
                              data-tier="heard"
                              className="block w-full text-left text-[13px] leading-relaxed text-[var(--ink-90)] border-l-2 border-[var(--edge-strong)] pl-2.5 hover:border-[rgb(var(--accent))] fb-press"
                            >
                              {s.text}
                            </button>
                          ) : (
                            <p key={`i${i}`} data-tier="inferred" className="text-[13px] leading-relaxed text-[var(--ink-50)]">
                              {s.text}
                            </p>
                          )
                        )}
                    </div>
                  </section>
                )
              )}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--ink-50)]">
              {meeting.summary
                ? meeting.summary
                : 'No record yet — it is built when a recorded meeting ends.'}
            </p>
          )}
        </div>
      )}

      {view === 'thread' && (
        <div className="px-5 py-4" data-testid="rendering-thread" ref={threadRef}>
          {segments.length > 0 ? (
            <div className="space-y-2">
              {segments.map((s) => (
                <div
                  key={s.id}
                  data-segment-id={s.id}
                  className={`flex items-start gap-2.5 ${
                    s.confidence != null && s.confidence < 0.5 ? 'opacity-60' : ''
                  }`}
                  title={
                    s.confidence != null
                      ? `Engine confidence ${(s.confidence * 100).toFixed(0)}%`
                      : 'Engine confidence unknown (on-device)'
                  }
                >
                  <span className="fb-tabular text-[11px] text-[var(--ink-40)] w-10 shrink-0 pt-0.5">
                    {fmtMs(s.startMs)}
                  </span>
                  <span className="text-[12px] font-semibold text-[var(--ink-70)] w-20 shrink-0 truncate pt-0.5">
                    {s.speakerName || 'Speaker'}
                  </span>
                  <span className="flex-1 text-[13px] leading-relaxed text-[var(--ink-90)]">{s.text}</span>
                </div>
              ))}
            </div>
          ) : meeting.transcript ? (
            <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink-80)] font-[inherit]">
              {meeting.transcript}
            </pre>
          ) : (
            <p className="text-[13px] text-[var(--ink-50)]">No transcript for this meeting.</p>
          )}
        </div>
      )}

      {(audio?.present || exported) && (
        <div className="px-5 pb-2 space-y-1.5">
          {audio?.present && (
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--ink-50)]" data-testid="meet-audio-row">
              <Icon name="graphic_eq" size={13} className="shrink-0" />
              <span className="flex-1">
                {audio.files} audio track{audio.files === 1 ? '' : 's'} on this machine (
                {(audio.bytes / 1_000_000).toFixed(1)} MB) — never uploaded.
              </span>
              <button
                onClick={() =>
                  void window.api.meetings.keepAudio(meeting.id, !audio.kept).then(() =>
                    window.api.meetings.audioInfo(meeting.id).then(setAudio)
                  )
                }
                className={`fb-press text-[11px] px-2 py-0.5 rounded-full ${
                  audio.kept ? 'bg-accent/15 text-[rgb(var(--accent))]' : 'bg-[var(--surface-sunken)] text-[var(--ink-60)]'
                }`}
                title={audio.kept ? 'Kept forever — click to return to the retention window' : 'Keep this meeting’s audio past the retention window'}
                data-testid="meet-keep-audio"
              >
                {audio.kept ? 'Kept' : 'Keep'}
              </button>
              <button
                onClick={() => void window.api.meetings.revealAudio(meeting.id)}
                className="fb-press text-[11px] text-[var(--ink-50)] hover:text-[var(--ink-100)]"
                title="Show the audio files in Finder"
              >
                Reveal
              </button>
            </div>
          )}
          {exported && (
            <div className="text-[11.5px] text-[var(--ink-50)]" data-testid="meet-exported">
              Exported to {exported}
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-4 space-y-5 border-t border-[var(--edge-soft)]">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-70)] mb-1.5">Summary</h2>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary !== meeting.summary && onChange({ summary })}
            placeholder="The AI summary appears here after recording, or write your own notes."
            className="fb-card w-full min-h-[80px] resize-y px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-100)] placeholder:text-[var(--ink-50)] focus:border-[rgb(var(--accent)/0.40)]"
          />
        </section>

        <section>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-70)] mb-1.5"
          >
            <Icon name={showTranscript ? 'expand_less' : 'expand_more'} size={14} /> Transcript
          </button>
          {showTranscript && (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onBlur={() => transcript !== meeting.transcript && onChange({ transcript })}
              placeholder="The full transcript appears here after recording, or paste your own."
              className="fb-card w-full min-h-[160px] resize-y px-3 py-2 text-[12.5px] leading-relaxed text-[var(--ink-90)] placeholder:text-[var(--ink-50)]"
            />
          )}
        </section>
      </div>
    </div>
  )
}
