import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import ModuleHome from '../ModuleHome'
import { useMeetingsStore } from '../../stores/meetings'
import { useNodeStore } from '../../stores/nodes'
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

        <div className="px-3 py-2.5 flex items-center gap-2">
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
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[rgb(var(--accent))] text-white text-[12px] font-medium hover:bg-[rgb(var(--accent-hover))] disabled:opacity-50"
            >
              <Icon name="mic" size={15} /> Record
            </button>
          )}
          <button
            onClick={() => void addManual()}
            data-testid="meet-add"
            disabled={!!busy}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-[var(--edge-soft)] text-[var(--ink-90)] text-[12px] hover:bg-[var(--surface-sunken)]"
            title="Add a meeting from notes" aria-label="Add a meeting from notes"
          >
            <Icon name="edit_note" size={15} /> Notes
          </button>
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
          <ModuleHome
            moduleKey="meet"
            title="Meetings"
            subtitle="Record a meeting and it becomes a summary, a transcript and real action items"
            icon="groups"
            accentClass="text-rose-500"
            stats={[
              { label: 'Meetings', value: meetings.length, icon: 'groups' },
              { label: 'Action items', value: meetings.reduce((n, m) => n + m.actionItems.length, 0), icon: 'task_alt' },
              { label: 'Transcribed', value: meetings.filter((m) => m.transcript.trim().length > 0).length, icon: 'description' }
            ]}
            items={meetings.map((m) => ({
              id: m.id,
              title: m.title,
              subtitle: m.summary ? m.summary.slice(0, 90) : m.actionItems.length ? `${m.actionItems.length} action item(s)` : 'No summary yet',
              meta: fmtDate(m.createdAt),
              status: m.actionItems.length ? { tone: 'accent' as const, label: `${m.actionItems.length} actions` } : undefined,
              onOpen: () => setSelectedId(m.id)
            }))}
            recentLabel="Recent meetings"
            onCreate={() => void addManual()}
            createLabel="New meeting"
            emptyHint="No meetings yet. Record one or capture notes by hand, and its action items become real tasks."
            tips={[
              { icon: 'mic', text: 'Record a meeting and it is transcribed and summarised, with a key set; surfaced plainly when one is missing.' },
              { icon: 'edit_note', text: 'Or capture notes by hand, no recording needed.' },
              { icon: 'task_alt', text: 'Action items become real tasks beside the rest of your work.' }
            ]}
          />
        )}
      </div>
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
          className="p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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
