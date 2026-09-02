import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { AnimatePresence, motion } from 'framer-motion'
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
import type { CarriedItem, Meeting, TranscriptSearchHit, TranscriptSegment } from '@shared/meetings'
import { useGuestCaptureStore } from '../../stores/guestCapture'
import { fmtOffset } from '../../lib/transcriptMerge'
import { validateRecordSpans } from '../../lib/recordSpans'
import { validateCommitments, type ValidatedCommitment } from '../../lib/commitments'
import MeetingCommitmentsCard, { CarriedFromLastTime } from '../MeetingCommitmentsCard'
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

// Canon Part IV — name the value, not the mechanism; tabular where numeric.
const RETENTION_LABEL: Record<'0' | '7' | '30' | '90' | 'keep', string> = {
  '0': 'Discarded at wrap-up',
  '7': '7 days',
  '30': '30 days',
  '90': '90 days',
  keep: 'Kept forever'
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
  // M4 — Recall: segment hits across EVERY meeting for the current query.
  // The citation is the answer: a speaker, a timestamp and a door into the
  // Thread. Pure FTS — no model call sits between the question and the quote.
  const [recallHits, setRecallHits] = useState<TranscriptSearchHit[]>([])
  // A segment to land on once the detail's segments load (from a Recall hit
  // or an fb:open-meeting with a segmentId).
  const [pendingSegment, setPendingSegment] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [whisper, setWhisper] = useState(whisperEnabled())
  const [retention, setRetention] = useState<'0' | '7' | '30' | '90' | 'keep'>('30')
  // Canon Part III — the retention pill opens ONE drawer of option chips.
  const [retentionOpen, setRetentionOpen] = useState(false)
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
      const segmentId = (e as CustomEvent).detail?.segmentId as string | undefined
      if (id) setSelectedId(id)
      // M4 — a caller may name the exact line: land the Thread on it.
      if (segmentId) setPendingSegment(segmentId)
    }
    window.addEventListener('fb:open-meeting', onOpen)
    return () => window.removeEventListener('fb:open-meeting', onOpen)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return meetings
    return meetings.filter((m) => `${m.title} ${m.summary} ${m.transcript}`.toLowerCase().includes(q))
  }, [meetings, query])

  useEffect(() => {
    const q = query.trim()
    // Two characters is the floor — a single letter matches half the corpus
    // and the hit list would just be noise under the meeting rows.
    if (q.length < 2 || typeof window.api.meetings.searchSegments !== 'function') {
      setRecallHits([])
      return
    }
    let alive = true
    const t = setTimeout(() => {
      void window.api.meetings
        .searchSegments(q, 12)
        .then((hits) => {
          if (alive) setRecallHits(hits)
        })
        .catch(() => {
          if (alive) setRecallHits([])
        })
    }, 220)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

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
    // House material (the operator's "still feels vibe-coded" round): the
    // DESIGN-CANON TEST (operator, 2026-09-02): PlexiMeet redesigned against
    // the draft Plexii Design Canon — accent-as-commit (Part III), labelled
    // pills + option-chip drawers (Part III), the white-thumb segmented
    // control (Part II signature element), filled fields, micro-labels
    // (Law 6), tabular numerics (Part II), and the copy laws (Part IV). Not
    // adopted as canon — an experiment to see whether the principles
    // translate. Every handler and testid preserved.
    <div className="h-full w-full flex desk-paper no-tod text-[var(--ink-100)]" data-testid="pleximeet-view">
      {/* List */}
      <div className="w-[330px] shrink-0 border-r border-[var(--edge-soft)] flex flex-col bg-[color-mix(in_oklab,var(--surface-raised)_88%,transparent)] backdrop-blur-[2px]">
        <div className="px-4 py-3.5 border-b border-[var(--edge-soft)]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-chip)] bg-rose-500/10 text-rose-500 shadow-[inset_0_0_0_1px_rgb(244_63_94/0.18)]">
              <Icon name="groups" size={17} filled />
            </span>
            <div className="min-w-0">
              <h1 className="fb-display text-[15px] font-bold tracking-tight text-[var(--ink-100)] leading-tight">PlexiMeet</h1>
              <p className="text-[11.5px] text-[var(--ink-50)] leading-tight">Meetings that turn into actions.</p>
            </div>
          </div>
        </div>

        <div className="px-3 py-2.5 space-y-2">
          {/* Primary: a live, multi-party meeting (connect to teammates). */}
          <button
            onClick={openNew}
            data-testid="meet-start-live"
            className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-[11px] text-white text-[13px] font-semibold fb-press bg-gradient-to-b from-[rgb(var(--accent))] to-[rgb(var(--accent-hover))] shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-[1.06]"
          >
            <Icon name="video_call" size={17} /> Start or schedule a meeting
          </button>

          {/* DEC-098 made meeting recording consent-only; the calls consent
              round closed the same hole for 1:1s. This preference now only
              expresses MY side: on a call it records my mic and ASKS the
              other person — their voice is captured when they say yes, and
              a decline is honoured by construction (never tapped). */}
          <div className="fb-card px-2.5 py-2.5 space-y-2.5">
          {/* Law 6 — name the dimension. */}
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-[var(--ink-40)]">Recording preferences</div>
          <label
            className="flex items-start gap-2 px-0.5 text-[11.5px] text-[var(--ink-70)] cursor-pointer leading-snug"
            title="Applies to 1:1 calls: your mic is recorded and the other person is asked before their voice is captured — declining keeps them out entirely. Meetings never auto-record."
          >
            <input
              type="checkbox"
              checked={whisper}
              onChange={(e) => {
                setWhisper(e.target.checked)
                setWhisperEnabled(e.target.checked)
              }}
              data-testid="meet-whisper-toggle"
              className="accent-[rgb(var(--accent))] mt-0.5 shrink-0"
            />
            {/* Part IV — the AI's role stated plainly, where it acts. */}
            <span>Transcribe &amp; summarise my 1:1 calls. The other person is always asked first.</span>
          </label>

          {/* M2c (CR-13) — audio retention. Canon Part III: a labelled pill
              that opens ONE drawer of option chips, with a one-line question.
              Native <select> retired (Part VII favours the app's own chrome). */}
          <div className="px-0.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-[var(--ink-40)] mb-1">Audio kept on this machine</div>
            <button
              type="button"
              onClick={() => setRetentionOpen((v) => !v)}
              aria-expanded={retentionOpen}
              data-testid="meet-retention-pill"
              className="w-full h-9 px-2.5 rounded-[var(--radius-field)] bg-[var(--surface-raised)] border border-[var(--edge-strong)] inline-flex items-center justify-between gap-1.5 text-[12.5px] text-[var(--ink-100)] fb-press hover:border-[rgb(var(--accent))]"
            >
              <span className="fb-tabular">{RETENTION_LABEL[retention]}</span>
              <Icon name="expand_more" size={16} className={`text-[var(--ink-40)] transition-transform ${retentionOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {retentionOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.3, 0.9, 0.3, 1] }}
                  className="overflow-hidden"
                  data-testid="meet-retention-drawer"
                >
                  <p className="mt-1.5 mb-1 text-[11.5px] text-[var(--ink-50)] leading-snug">How long should a meeting keep its audio here? It never leaves this machine.</p>
                  <div className="flex flex-wrap gap-1">
                    {(['0', '7', '30', '90', 'keep'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setRetention(v)
                          void window.api.meetings.setAudioRetention(v)
                          setTimeout(() => setRetentionOpen(false), 150)
                        }}
                        data-testid={`meet-retention-opt-${v}`}
                        className={`h-7 px-2.5 rounded-full text-[11.5px] fb-press border transition-colors ${
                          retention === v
                            ? 'bg-[rgb(var(--accent))] text-white border-transparent'
                            : 'bg-transparent text-[var(--ink-70)] border-[var(--edge-strong)] hover:border-[rgb(var(--accent))]'
                        }`}
                      >
                        {RETENTION_LABEL[v]}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>

          {/* Secondary: recording is one option, not the whole feature. */}
          <div className="grid grid-cols-2 gap-1.5">
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
                className="fb-btn-surface fb-press inline-flex items-center justify-center gap-1.5 h-8 px-2 text-[12px] text-[var(--ink-90)] whitespace-nowrap disabled:opacity-50"
                title="Record audio, transcribe it and extract action items"
              >
                <Icon name="mic" size={15} /> Record notes
              </button>
            )}
            <button
              onClick={() =>
                void useGuestCaptureStore.getState().start({ title: 'External meeting' })
              }
              data-testid="meet-record-external"
              className="fb-btn-surface fb-press inline-flex items-center justify-center gap-1.5 h-8 px-2 text-[12px] text-[var(--ink-90)] whitespace-nowrap"
              title="Record a meeting happening outside Plexii (Zoom, Meet, Teams) — your mic + this machine's audio, transcribed locally"
            >
              <Icon name="radio_button_checked" size={15} /> Record external
            </button>
            <button
              onClick={() => setShowMsg((v) => !v)}
              data-testid="meet-message"
              className="fb-btn-surface fb-press inline-flex items-center justify-center gap-1.5 h-8 px-2 text-[12px] text-[var(--ink-90)] whitespace-nowrap"
              title="Record a quick message and send it to a teammate who is away"
            >
              <Icon name="voicemail" size={15} /> Message
            </button>
            <button
              onClick={() => void addManual()}
              data-testid="meet-add"
              disabled={!!busy}
              className="fb-btn-surface fb-press inline-flex items-center justify-center gap-1.5 h-8 px-2 text-[12px] text-[var(--ink-90)] whitespace-nowrap"
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
          <div className="flex items-center gap-1.5 px-2.5 h-9 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] border border-transparent focus-within:border-[rgb(var(--accent))] transition-colors">
            <Icon name="search" size={14} className="text-[var(--ink-50)]" />
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
          {recallHits.length > 0 && (
            <div className="mb-2" data-testid="recall-hits">
              <div className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wider text-[var(--ink-40)]">
                FROM THE TRANSCRIPTS
              </div>
              {recallHits.map((h) => (
                <button
                  key={h.segmentId}
                  onClick={() => {
                    setSelectedId(h.meetingId)
                    setPendingSegment(h.segmentId)
                  }}
                  data-testid={`recall-hit-${h.segmentId}`}
                  className="w-full text-left rounded-lg px-3 py-2 mb-0.5 hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <div className="text-[11.5px] text-[var(--ink-90)] leading-snug line-clamp-2">
                    <span className="fb-tabular text-[var(--ink-50)]">[{fmtOffset(h.startMs)}]</span>{' '}
                    <span className="font-medium">{h.speakerName || 'Unknown'}:</span> {h.text}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-[var(--ink-50)] truncate">{h.meetingTitle}</div>
                </button>
              ))}
            </div>
          )}
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
                className={`w-full text-left rounded-lg px-3 py-2.5 mb-1 fb-press transition-colors ${
                  m.id === selectedId
                    ? 'bg-[rgb(var(--accent)/0.10)] border border-[rgb(var(--accent)/0.30)] shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]'
                    : 'hover:bg-[var(--surface-sunken)] border border-transparent'
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
            initialSegmentId={pendingSegment}
            onJumpConsumed={() => setPendingSegment(null)}
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
  onDelete,
  initialSegmentId,
  onJumpConsumed
}: {
  meeting: Meeting
  onChange: (patch: { title?: string; summary?: string; transcript?: string; actionItems?: string[] }) => void
  onDelete: () => void
  // M4 — a Recall hit names its line: once segments load, the Thread opens
  // scrolled to it. Consumed exactly once so later renders stay put.
  initialSegmentId?: string | null
  onJumpConsumed?: () => void
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
  // The engine-repair door: the retained takes re-run through the CURRENT
  // local engine (the model ruling moved wrap-ups to whisper-base after tiny
  // looped a real recording), replacing segments, transcript and summary.
  // Audio never leaves the machine — same decode path as the wrap-up.
  const [retranscribing, setRetranscribing] = useState<string | null>(null)
  // M5 — series memory: the previous instance and what it left open, plus
  // the Q14 per-series brief knob. Database facts; absent for ad-hoc meetings.
  const [carried, setCarried] = useState<CarriedItem[]>([])
  const [lastMeeting, setLastMeeting] = useState<{ id: string; title: string; createdAt: number } | null>(null)
  const [seriesBriefs, setSeriesBriefs] = useState<boolean | null>(null)
  const [seriesShare, setSeriesShare] = useState<boolean | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const threadRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!meeting.seriesId || typeof window.api.meetings.prep !== 'function') return
    let alive = true
    void window.api.meetings
      .prep({ seriesId: meeting.seriesId, excludeMeetingId: meeting.id })
      .then((prep) => {
        if (!alive) return
        setCarried(prep.carried)
        setLastMeeting(prep.lastMeeting)
      })
      .catch(() => {})
    void window.api.meetings
      .getSeriesPrefs(meeting.seriesId)
      .then((prefs) => {
        if (!alive) return
        setSeriesBriefs(prefs.briefs)
        setSeriesShare(prefs.shareBriefs)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [meeting.id, meeting.seriesId])

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
  // M4 — consume a named landing line once its segment exists on screen.
  useEffect(() => {
    if (!initialSegmentId || segments.length === 0) return
    if (!segments.some((s) => s.id === initialSegmentId)) return
    jumpToSegment(initialSegmentId)
    onJumpConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSegmentId, segments])

  // Canon Law 12 — number keys select the rendering directly (1/2/3), but
  // never while a text field is focused (they'd type into notes/summary).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) return
      if (e.key === '1') setView('commitments')
      else if (e.key === '2') setView('brief')
      else if (e.key === '3') setView('thread')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const jumpToSegment = (segmentId: string): void => {
    setView('thread')
    setTimeout(() => {
      threadRef.current
        ?.querySelector(`[data-segment-id="${segmentId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
  }

  async function retranscribe(): Promise<void> {
    if (retranscribing) return
    setRetranscribing('Loading the saved audio…')
    try {
      const takes = await window.api.meetings.loadAudioTakes(meeting.id)
      if (!takes.length) {
        setRetranscribing(null)
        return
      }
      const drafts: Array<{
        speakerAccountId: string | null
        speakerName: string
        startMs: number
        endMs: number
        text: string
        confidence: number | null
      }> = []
      for (let i = 0; i < takes.length; i++) {
        const take = takes[i]
        setRetranscribing(`Transcribing on-device — ${take.speaker} (${i + 1} of ${takes.length})…`)
        const buf = take.bytes.buffer.slice(
          take.bytes.byteOffset,
          take.bytes.byteOffset + take.bytes.byteLength
        ) as ArrayBuffer
        const r = await transcribeRecording(buf, take.mimeType, { forceLocal: true })
        if (!r.ok) {
          setRetranscribing(null)
          return
        }
        const segs = r.segments ?? [
          { startMs: 0, endMs: Math.round((r.durationSec ?? 0) * 1000), text: r.transcript, confidence: null }
        ]
        for (const s of segs) {
          if (!s.text.trim()) continue
          drafts.push({
            speakerAccountId: null,
            speakerName: take.speaker,
            startMs: take.offsetMs + s.startMs,
            endMs: take.offsetMs + s.endMs,
            text: s.text.trim(),
            confidence: s.confidence
          })
        }
      }
      drafts.sort((a, b) => a.startMs - b.startMs)
      const saved = await window.api.meetings.saveSegments(meeting.id, drafts)
      const transcriptText = drafts
        .map((d) => `[${fmtOffset(d.startMs)}] ${d.speakerName}: ${d.text}`)
        .join('\n')
      setRetranscribing('Summarising…')
      const sum = await window.api.voiceNote
        .process({ transcript: transcriptText, mode: 'summary' })
        .catch(() => null)
      onChange({ transcript: transcriptText, ...(sum?.ok ? { summary: sum.text } : {}) })
      setTranscript(transcriptText)
      if (sum?.ok) setSummary(sum.text)
      setSegments(saved)
      // The commitments door reopens over the corrected transcript.
      setFoundCommitments(null)
    } finally {
      setRetranscribing(null)
    }
  }

  async function makeTask(idx: number, text: string): Promise<void> {
    await createNode({ kind: 'task', title: text, parentId: null }).catch(() => null)
    setMadeTasks((m) => ({ ...m, [idx]: true }))
  }

  return (
    <div className="h-full flex flex-col overflow-auto" data-testid="meet-detail">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-5 py-3 border-b border-[var(--edge-soft)] bg-[color-mix(in_oklab,var(--surface-raised)_92%,transparent)] backdrop-blur-[3px]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== meeting.title && onChange({ title })}
          className="flex-1 bg-transparent fb-display text-[20px] font-semibold tracking-[-0.018em] text-[var(--ink-100)] outline-none"
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

      {/* Canon Part II/III — the segmented control: a --field track with a
          single WHITE RAISED THUMB (the one signature raised element on the
          screen), sliding by layoutId (Part V). Three renderings of one
          Record; number keys 1/2/3 select directly (Law 12). */}
      <div className="px-5 pt-3" data-testid="record-views">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-[var(--surface-sunken)] shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]">
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
              className="relative h-7 px-3 rounded-full text-[12.5px] font-medium fb-press inline-flex items-center gap-1.5"
            >
              {view === v && (
                <motion.span
                  layoutId="record-view-thumb"
                  transition={{ type: 'spring', stiffness: 480, damping: 40 }}
                  className="absolute inset-0 rounded-full bg-[var(--surface-raised)] shadow-[0_1px_2px_rgb(0_0_0/0.14),inset_0_1px_0_rgb(255_255_255/0.6)]"
                />
              )}
              <span className={`relative z-10 ${view === v ? 'text-[var(--ink-100)]' : 'text-[var(--ink-60)] hover:text-[var(--ink-100)]'}`}>{label}</span>
              <span className={`relative z-10 fb-tabular text-[10px] ${view === v ? 'text-[var(--ink-40)]' : 'text-[var(--ink-30)]'}`}>{key}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'commitments' && (
        <div className="px-5 py-4 space-y-5 max-w-[780px]" data-testid="rendering-commitments">
          {carried.length > 0 && (
            <CarriedFromLastTime
              items={carried}
              lastTitle={lastMeeting?.title}
              lastAt={lastMeeting?.createdAt}
            />
          )}
          {segments.length > 0 && foundCommitments === null && (
            <div className="space-y-2">
              {/* Part IV — explain the AI's role once, plainly, where it acts;
                  Law 4/14 — nothing files until you accept. */}
              <p className="text-[12px] text-[var(--ink-50)] leading-snug">
                Plexii can read this transcript for commitments. Nothing files until you confirm each one, and anything owned by someone else stays a reference, never an assignment.
              </p>
              <button
                onClick={() => void findCommitments()}
                disabled={extracting}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[11px] text-white text-[12.5px] font-semibold fb-press bg-gradient-to-b from-[rgb(var(--accent))] to-[rgb(var(--accent-hover))] shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-[1.06] disabled:opacity-50"
                data-testid="find-commitments"
              >
                <Icon name="auto_awesome" size={14} />
                {extracting ? 'Reading the transcript…' : 'Find commitments'}
              </button>
            </div>
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
        <div className="px-5 py-4 space-y-4 max-w-[780px]" data-testid="rendering-brief-outer">
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
        <div className="px-5 pb-4 max-w-[780px]" data-testid="rendering-brief">
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
        <div className="px-5 py-4 max-w-[780px]" data-testid="rendering-thread" ref={threadRef}>
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

      {/* M5 (Q14) — the per-series brief knob, on the series meeting itself:
          a series whose briefs are noise gets silenced here, and the wrap-up
          asks before minting the next one. */}
      {meeting.seriesId && seriesBriefs !== null && (
        <div className="px-5 pb-2">
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-50)] cursor-pointer" data-testid="series-briefs-row">
            <input
              type="checkbox"
              checked={seriesBriefs}
              onChange={(e) => {
                const next = e.target.checked
                setSeriesBriefs(next)
                void window.api.meetings
                  .setSeriesPrefs(meeting.seriesId!, { briefs: next })
                  .catch(() => setSeriesBriefs(!next))
              }}
              className="accent-[rgb(var(--accent))]"
              data-testid="series-briefs-toggle"
            />
            <span>Brief me after each meeting in this series</span>
          </label>
          {/* Q14, the delivery half — OFF by default: sending is its own
              act. On: the wrap-up DMs the brief to the other attendees
              (server-persisted, so an away teammate meets it on next open);
              whether it FILES on their side is their own per-series choice. */}
          {seriesShare !== null && (
            <label className="mt-1 flex items-center gap-2 text-[11.5px] text-[var(--ink-50)] cursor-pointer" data-testid="series-share-row">
              <input
                type="checkbox"
                checked={seriesShare}
                onChange={(e) => {
                  const next = e.target.checked
                  setSeriesShare(next)
                  void window.api.meetings
                    .setSeriesPrefs(meeting.seriesId!, { shareBriefs: next })
                    .catch(() => setSeriesShare(!next))
                }}
                className="accent-[rgb(var(--accent))]"
                data-testid="series-share-toggle"
              />
              <span>Send the brief to the other attendees too</span>
            </label>
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
              <button
                onClick={() => void retranscribe()}
                disabled={!!retranscribing}
                className="fb-press text-[11px] text-[var(--ink-50)] hover:text-[var(--ink-100)] disabled:opacity-50"
                title="Run the saved audio through the current on-device engine again — segments, transcript and summary are rewritten; audio never leaves this machine"
                data-testid="meet-retranscribe"
              >
                {retranscribing ?? 'Re-transcribe'}
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
          {/* Law 6 — micro-label names the dimension. Part III — a filled
              field (--field bg, no border, accent focus ring). */}
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-[var(--ink-40)] mb-1.5">Summary</div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary !== meeting.summary && onChange({ summary })}
            placeholder="The summary appears here after recording, or write your own."
            className="w-full min-h-[80px] resize-y rounded-[12px] bg-[var(--surface-sunken)] border border-transparent focus:border-[rgb(var(--accent))] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink-100)] placeholder:text-[var(--ink-50)] outline-none transition-colors"
          />
        </section>

        <section>
          {/* Law 5 — a disclosure with a visible affordance (chevron rotates). */}
          <button
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.075em] text-[var(--ink-40)] mb-1.5 fb-press"
          >
            <Icon name="expand_more" size={14} className={`transition-transform ${showTranscript ? 'rotate-180' : ''}`} /> Transcript
          </button>
          {showTranscript && (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onBlur={() => transcript !== meeting.transcript && onChange({ transcript })}
              placeholder="The full transcript appears here after recording, or paste your own."
              className="w-full min-h-[160px] resize-y rounded-[12px] bg-[var(--surface-sunken)] border border-transparent focus:border-[rgb(var(--accent))] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--ink-90)] placeholder:text-[var(--ink-50)] outline-none transition-colors"
            />
          )}
        </section>
      </div>
    </div>
  )
}
