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
import type { Meeting } from '@shared/meetings'
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
  const recRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    void load()
  }, [load])

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
      const t = await window.api.voiceNote.transcribe({ buffer, mimeType })
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

          {/* Whisper opt-in. Off by default (never forced); turning it on also
              becomes the default for future meetings until turned off. */}
          <label
            className="flex items-center gap-2 px-0.5 text-[11.5px] text-[var(--ink-70)] cursor-pointer"
            title="When on, your live meetings are recorded, transcribed and summarised into a doc with suggested tasks and follow-ups. Off by default."
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
            <span>Transcribe &amp; summarise my meetings (Whisper)</span>
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--edge-soft)] text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                title="Record audio, transcribe it and extract action items"
              >
                <Icon name="mic" size={15} /> Record notes
              </button>
            )}
            <button
              onClick={() => setShowMsg((v) => !v)}
              data-testid="meet-message"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--edge-soft)] text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)]"
              title="Record a quick message and send it to a teammate who is away"
            >
              <Icon name="voicemail" size={15} /> Message
            </button>
            <button
              onClick={() => void addManual()}
              data-testid="meet-add"
              disabled={!!busy}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-[var(--edge-soft)] text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)]"
              title="Add a meeting from notes" aria-label="Add a meeting from notes"
            >
              <Icon name="edit_note" size={15} />
            </button>
          </div>

          {/* Record-a-message picker: choose a teammate (away ones flagged) and leave them a voice note. */}
          {showMsg && (
            <div className="rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-2" data-testid="meet-message-picker">
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
          <div className="flex items-center gap-1.5 rounded-md bg-[var(--surface-raised)] border border-[var(--edge-soft)] px-2 py-1.5">
            <Icon name="search" size={14} className="text-[var(--ink-70)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings"
              data-testid="meet-search"
              className="flex-1 bg-transparent text-[12px] text-[var(--ink-100)] placeholder:text-[var(--ink-50)] focus:outline-none"
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
          className="flex-1 bg-transparent text-[17px] font-bold text-[var(--ink-100)] outline-none"
          data-testid="meet-title"
        />
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-[var(--ink-40)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          title="Delete meeting" aria-label="Delete meeting"
          data-testid="meet-delete"
        >
          <Icon name="delete" size={16} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-70)] mb-1.5">Summary</h2>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary !== meeting.summary && onChange({ summary })}
            placeholder="The AI summary appears here after recording, or write your own notes."
            className="w-full min-h-[80px] resize-y rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-100)] placeholder:text-[var(--ink-50)] focus:outline-none focus:border-[rgb(var(--accent)/0.40)]"
          />
        </section>

        {meeting.actionItems.length > 0 && (
          <section data-testid="meet-actions">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-70)] mb-1.5">Action items</h2>
            <div className="space-y-1.5">
              {meeting.actionItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-3 py-2">
                  <Icon name="task_alt" size={15} className="text-[rgb(var(--accent))] shrink-0" />
                  <span className="flex-1 text-[13px] text-[var(--ink-90)]">{item}</span>
                  <button
                    onClick={() => void makeTask(i, item)}
                    disabled={madeTasks[i]}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--edge-soft)] text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                    data-testid={`meet-make-task-${i}`}
                  >
                    <Icon name={madeTasks[i] ? 'check' : 'add_task'} size={13} /> {madeTasks[i] ? 'Added' : 'Task'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

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
              className="w-full min-h-[160px] resize-y rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--ink-90)] placeholder:text-[var(--ink-50)] focus:outline-none"
            />
          )}
        </section>
      </div>
    </div>
  )
}
