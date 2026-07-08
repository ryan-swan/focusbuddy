import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { applyProposal, describeProposal } from '../lib/actionExecutor'
import { buildCanvasSnapshot } from '../lib/canvasSnapshot'
import { useViewStore } from '../stores/view'
import { useWidgetStore } from '../stores/widgets'
import type { ActionProposal, Widget } from '@shared/types'

// VoiceCommandFAB — the always-available floating mic for voice control
// of the canvas. Spec:
//   - Bottom-middle, fixed, chrome-aware (sits above the CommandCenter
//     pill, both centered)
//   - Two trigger modes (user preference in Settings → Voice):
//       press-hold   : record while held, submit on release
//       click-toggle : click to start, auto-stop after N ms of silence
//   - Live captions overlay while listening
//   - On stop: transcript stages for correction → user clicks Send
//   - AI returns ActionProposal[] → cards stack near the FAB with the
//     usual Apply / Dismiss UX
//   - Optional spoken voice-back when proposals return
//
// We deliberately reuse the existing Whisper pipeline (window.api.voiceNote)
// rather than introducing a parallel one. The mic is wired via MediaRecorder
// with audio-only constraints (no video for the FAB — it's not a recorder).

type Phase =
  | 'idle'
  | 'listening'
  | 'staged' // transcript ready for review/edit, not sent yet
  | 'sending' // hit Anthropic
  | 'result' // proposals dock visible
  | 'error' // capture/transcribe failed — show the reason (don't silently hide it)

// Intersection (not `interface extends`): ActionProposal is a discriminated
// union, and an interface extending a union silently drops the per-member
// discriminants (kind/id/widgetId). `ActionProposal & {…}` distributes over the
// union so each member keeps its fields AND gains the local UI status.
type Proposal = ActionProposal & {
  // status tracked locally so we can mark a card consumed without
  // mutating the AI's payload.
  _status?: 'pending' | 'applied' | 'dismissed' | 'failed'
  _message?: string
}

interface VoicePrefs {
  commandMode: 'press-hold' | 'click-toggle'
  autoStopSilenceMs: number
  voiceback: boolean
}

const DEFAULT_PREFS: VoicePrefs = {
  commandMode: 'press-hold',
  autoStopSilenceMs: 2000,
  voiceback: true
}

function activeTaskId(): string | null {
  const v = useViewStore.getState().view
  return v.kind === 'task' ? v.taskId : null
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number } }) => void
  onerror: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export default function VoiceCommandFAB(): JSX.Element {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_PREFS)
  const [phase, setPhase] = useState<Phase>('idle')
  const [liveCaption, setLiveCaption] = useState<string>('')
  const [transcript, setTranscript] = useState<string>('')
  const [editedTranscript, setEditedTranscript] = useState<string>('')
  const [reply, setReply] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [hovering, setHovering] = useState<boolean>(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const interimAtRef = useRef<number>(0) // last time we saw interim or final speech
  const pressHoldArmedRef = useRef<boolean>(false)
  // Re-entrancy guard. Set synchronously the moment a capture begins and
  // cleared only when that capture's whole stop+transcribe cycle ends. Without
  // it, a second click/tap before phase flips to 'listening' (getUserMedia is
  // async) spins up a SECOND MediaRecorder; both push into chunksRef and the
  // interleaved webm from two streams is a corrupt file Whisper rejects with
  // "Invalid file format … seconds: 0".
  const capturingRef = useRef<boolean>(false)
  // Web-Audio analyser for REAL silence detection. webkitSpeechRecognition
  // (the old interim-result source) doesn't work in Electron, so we measure
  // actual mic level to know when the user has genuinely stopped talking.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Load persisted prefs.
  useEffect(() => {
    void (async () => {
      try {
        const p = await window.api.voiceCommand.getPrefs()
        setPrefs(p)
      } catch {
        // Fall back to defaults — IPC may not be ready yet on first paint.
      }
    })()
  }, [])

  const stopCaptureStream = useCallback((): void => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        // already stopped
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  const stopLiveCaptions = useCallback((): void => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
  }, [])

  const clearSilenceTimer = useCallback((): void => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopCaptureStream()
      stopLiveCaptions()
      clearSilenceTimer()
    }
  }, [stopCaptureStream, stopLiveCaptions, clearSilenceTimer])

  // ── Live captions via Web Speech API (Chromium-only, works in Electron)
  const startLiveCaptions = useCallback((): void => {
    const SR: SpeechRecognitionCtor | undefined =
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
    if (!SR) return
    try {
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = navigator.language || 'en-US'
      let finalText = ''
      rec.onresult = (event): void => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]
          if (r.isFinal) finalText += r[0].transcript + ' '
          else interim += r[0].transcript
        }
        interimAtRef.current = Date.now()
        setLiveCaption((finalText + ' ' + interim).trim())
      }
      rec.onerror = (): void => {
        // Captions are non-essential — Whisper provides the authoritative
        // transcript on stop. Swallow.
      }
      rec.start()
      recognitionRef.current = rec
    } catch {
      // unsupported on this build
    }
  }, [])

  // ── Begin / end capture
  const beginCapture = useCallback(async (): Promise<void> => {
    // Non-reentrant: a second start while one is already in flight would create
    // a second MediaRecorder whose chunks corrupt the first's webm.
    if (capturingRef.current) {
      // eslint-disable-next-line no-console
      console.log('[voice] ignored duplicate beginCapture — already capturing')
      return
    }
    capturingRef.current = true
    setError(null)
    setLiveCaption('')
    setTranscript('')
    setEditedTranscript('')
    setReply('')
    setProposals([])
    // eslint-disable-next-line no-console
    console.log('[voice] beginCapture — mode:', prefs.commandMode)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      // eslint-disable-next-line no-console
      console.log(
        '[voice] getUserMedia OK — audio tracks:',
        stream.getAudioTracks().map((t) => t.label || t.kind)
      )
      // Press-hold race: if the user released during the async getUserMedia,
      // don't start recording — release the just-acquired mic and bail, so a
      // quick tap can't leave the recorder running with no way to stop it.
      if (prefs.commandMode === 'press-hold' && !pressHoldArmedRef.current) {
        // eslint-disable-next-line no-console
        console.log('[voice] ABORTED — released during getUserMedia (too-quick tap); nothing recorded')
        stream.getTracks().forEach((t) => t.stop())
        capturingRef.current = false
        setPhase('idle')
        return
      }
      streamRef.current = stream
      chunksRef.current = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (e): void => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.start(250)
      recorderRef.current = mr
      interimAtRef.current = Date.now()
      setPhase('listening')
      // eslint-disable-next-line no-console
      console.log('[voice] recording started (phase=listening) — hold and speak')
      startLiveCaptions()
      // Click-toggle mode: arm the silence watchdog. When silence
      // exceeds the threshold, stop capture — the transcript still
      // stages for correction; we don't auto-send. The user always
      // decides what to send.
      if (prefs.commandMode === 'click-toggle') {
        // Real silence detection from actual mic level. Stops only after a
        // forgiving window of GENUINE silence, so a minor mid-sentence pause
        // never cuts you off (the old path relied on webkitSpeechRecognition
        // interim results, which never fire in Electron — so it was really a
        // fixed timer from start).
        try {
          const ctx = new AudioContext()
          const srcNode = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          srcNode.connect(analyser)
          audioCtxRef.current = ctx
          analyserRef.current = analyser
        } catch {
          // Web Audio unavailable — fall back to the fixed-timer behaviour.
        }
        const SPEECH_RMS = 6 // idle hiss ~1-3, speech ~12-40
        // Clamp to a sane, responsive window regardless of any stale stored
        // pref (the old default was 5000ms = a 5s fixed cutoff).
        const silenceWindowMs = Math.max(1500, Math.min(prefs.autoStopSilenceMs || 2000, 3000))
        const tick = (): void => {
          if (recorderRef.current?.state !== 'recording') return
          const a = analyserRef.current
          if (a) {
            const lv = new Uint8Array(a.fftSize)
            a.getByteTimeDomainData(lv)
            let sum = 0
            for (let i = 0; i < lv.length; i++) {
              const d = lv[i] - 128
              sum += d * d
            }
            // Above the noise floor → user is speaking; reset the silence clock.
            if (Math.sqrt(sum / lv.length) > SPEECH_RMS) interimAtRef.current = Date.now()
          }
          if (Date.now() - interimAtRef.current >= silenceWindowMs) {
            void stopCapture()
            return
          }
          silenceTimerRef.current = window.setTimeout(tick, 180)
        }
        silenceTimerRef.current = window.setTimeout(tick, 180)
      }
    } catch (err) {
      const e = err as Error
      // eslint-disable-next-line no-console
      console.error('[voice] getUserMedia FAILED:', e?.name, '·', e?.message)
      capturingRef.current = false
      setError(
        e?.name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it in System Settings → Privacy & Security → Microphone, then try again. (In dev the app appears as “Electron”.)'
          : e?.name === 'NotFoundError'
            ? 'No microphone found. Connect one and try again.'
            : e?.message || 'Microphone unavailable.'
      )
      setPhase('error')
    }
  }, [prefs.commandMode, prefs.autoStopSilenceMs, startLiveCaptions])

  const stopCapture = useCallback(async (): Promise<void> => {
    clearSilenceTimer()
    stopLiveCaptions()
    const rec = recorderRef.current
    // eslint-disable-next-line no-console
    console.log('[voice] stopCapture — recorder present:', !!rec, rec ? `(state=${rec.state})` : '')
    if (!rec) {
      capturingRef.current = false
      return
    }
    // Wait for the final dataavailable to land before we package.
    await new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, 600) // hard cap
      rec.onstop = (): void => {
        window.clearTimeout(t)
        resolve()
      }
      try {
        if (rec.state !== 'inactive') rec.stop()
      } catch {
        // already stopped
        resolve()
      }
    })
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
      analyserRef.current = null
    }

    const captionText = liveCaption.trim()
    // eslint-disable-next-line no-console
    console.log('[voice] captured chunks:', chunksRef.current.length, '· caption:', JSON.stringify(captionText))
    if (chunksRef.current.length === 0 && !captionText) {
      // eslint-disable-next-line no-console
      console.error('[voice] NO AUDIO CAPTURED — 0 chunks. The mic stream delivered no data.')
      capturingRef.current = false
      setError('No audio captured. Check your microphone, then hold the mic a moment longer while you speak.')
      setPhase('error')
      return
    }
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    // eslint-disable-next-line no-console
    console.log('[voice] audio blob bytes:', blob.size)
    // Spec: "when finished are staged for correction" — both modes land
    // here. The user reviews / edits the transcript and clicks Send when
    // ready. We never auto-send: the user always controls when the
    // canvas snapshot is shipped to the AI.
    setPhase('staged')
    const buf = await blob.arrayBuffer()
    try {
      const provider = await window.api.voiceNote.getProvider()
      // eslint-disable-next-line no-console
      console.log('[voice] transcribing via provider:', provider, '· bytes:', buf.byteLength)
      let res
      if (provider === 'local') {
        const samples = await decodeToMono16k(buf)
        res = await window.api.voiceNote.transcribe({ samples, sampleRate: 16000 })
      } else {
        res = await window.api.voiceNote.transcribe({ buffer: buf, mimeType: 'audio/webm' })
      }
      // eslint-disable-next-line no-console
      console.log('[voice] transcribe result:', JSON.stringify(res))
      if (res.ok) {
        const final = res.transcript.trim() || captionText
        setTranscript(final)
        setEditedTranscript(final)
      } else {
        // Whisper failed — fall back to the live caption text. Better
        // a slightly-wrong transcript the user can edit than nothing.
        setTranscript(captionText)
        setEditedTranscript(captionText)
        if (!captionText) {
          setError(res.error)
          setPhase('error')
          return
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[voice] transcribe threw:', (err as Error)?.name, '·', (err as Error)?.message)
      setTranscript(captionText)
      setEditedTranscript(captionText)
      if (!captionText) {
        setError((err as Error).message || 'Transcription failed.')
        setPhase('error')
      }
    } finally {
      // Capture cycle complete — release the re-entrancy guard so the next
      // recording can start.
      capturingRef.current = false
    }
  }, [clearSilenceTimer, liveCaption, stopLiveCaptions])

  const sendToAi = useCallback(async (): Promise<void> => {
    const text = (editedTranscript || transcript).trim()
    if (!text) return
    setPhase('sending')
    setError(null)
    setProposals([])
    setReply('')

    // Switch to the streaming variant so cards pop in as Claude emits
    // them. The first reply / proposal lands in ~600ms instead of
    // waiting ~1.5s for the full response — feels alive.
    const snapshot = buildCanvasSnapshot(activeTaskId())
    const requestId = `vc-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`

    return new Promise<void>((resolve) => {
      const unsubscribe = window.api.voiceCommand.runStream(
        {
          requestId,
          transcript: text,
          activeTaskId: snapshot.activeTaskId,
          selectedWidgetId: snapshot.selectedWidgetId,
          widgets: snapshot.widgets.map((w) => ({
            id: w.id,
            kind: w.kind,
            title: w.title,
            contentPreview: w.contentPreview,
            selected: w.selected,
            recentlyTouched: w.recentlyTouched,
            visible: w.visible
          }))
        },
        {
          onReply: (replyText) => {
            setReply(replyText)
            // Move to result phase on first signal — so the dock appears
            // immediately instead of waiting for the first proposal.
            setPhase('result')
          },
          onProposal: (proposal) => {
            // Each new proposal appears as its own card.
            setProposals((prev) => {
              if (prev.some((p) => p.id === proposal.id)) return prev
              return [...prev, { ...proposal, _status: 'pending' }]
            })
            setPhase('result')
          },
          onError: (err) => {
            setError(err.error)
            // If we already had some proposals streamed, keep them up
            // and surface the error inline; otherwise fall back to
            // staged so the user can edit + resend.
            setPhase((prev) => (prev === 'result' ? 'result' : 'staged'))
            unsubscribe()
            resolve()
          },
          onComplete: (summary) => {
            // Speak the reply (or a fallback) for voice-back users.
            if (prefs.voiceback) {
              speak(
                summary.replyText ||
                  `${summary.totalProposals} suggestion${
                    summary.totalProposals === 1 ? '' : 's'
                  }`
              )
            }
            unsubscribe()
            resolve()
          }
        }
      )
    })
  }, [editedTranscript, transcript, prefs.voiceback])

  // ── Apply / Dismiss
  const onApply = useCallback(
    async (id: string): Promise<void> => {
      const p = proposals.find((x) => x.id === id)
      if (!p) return
      const result = await applyProposal(p, { activeTaskId: activeTaskId() })
      setProposals((prev) =>
        prev.map((q) =>
          q.id === id
            ? { ...q, _status: result.ok ? 'applied' : 'failed', _message: result.message }
            : q
        )
      )
    },
    [proposals]
  )

  const onDismiss = useCallback((id: string): void => {
    setProposals((prev) =>
      prev.map((q) => (q.id === id ? { ...q, _status: 'dismissed' } : q))
    )
  }, [])

  const onDismissAll = useCallback((): void => {
    setProposals([])
    setReply('')
    setTranscript('')
    setEditedTranscript('')
    setError(null)
    setPhase('idle')
  }, [])

  // ── FAB interaction handlers
  const fabPressDown = useCallback(
    async (e: React.PointerEvent): Promise<void> => {
      if (prefs.commandMode === 'press-hold') {
        e.preventDefault()
        pressHoldArmedRef.current = true
        await beginCapture()
      }
    },
    [prefs.commandMode, beginCapture]
  )

  const fabPressUp = useCallback(
    async (e: React.PointerEvent): Promise<void> => {
      if (prefs.commandMode === 'press-hold' && pressHoldArmedRef.current) {
        e.preventDefault()
        pressHoldArmedRef.current = false
        // Stop based on the live recorder ref, not the (possibly stale) phase:
        // if recording started, stop + transcribe; if getUserMedia is still
        // pending, clearing the armed flag above makes beginCapture abort.
        if (recorderRef.current) {
          await stopCapture()
        }
      }
    },
    [prefs.commandMode, stopCapture]
  )

  const fabClick = useCallback(async (): Promise<void> => {
    if (prefs.commandMode === 'click-toggle') {
      if (phase === 'idle') {
        await beginCapture()
      } else if (phase === 'listening') {
        await stopCapture()
      }
    }
  }, [prefs.commandMode, phase, beginCapture, stopCapture])

  // ── Render
  const isActive = phase === 'listening'
  const showOverlay = phase !== 'idle'

  return (
    <>
      {/* The mic button — inline, positioned alongside CommandCenter by App.tsx */}
      <div
        className="relative flex flex-col items-center pointer-events-none"
        data-testid="voice-command-root"
      >
        {/* Live captions / transcript / result overlay — floats above the button */}
        {showOverlay && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-auto w-[min(600px,90vw)]">
            {phase === 'listening' && (
              <div className="fb-glass-chrome rounded-lg border border-accent/40 px-3 py-2 text-[12px] text-stone-100 shadow-xl min-h-[44px] flex items-center">
                <div className="text-accent text-[10px] uppercase tracking-[0.18em] mr-2 shrink-0">
                  Listening
                </div>
                <div className="flex-1 leading-snug">
                  {liveCaption || <span className="text-stone-500 italic">Say it…</span>}
                </div>
              </div>
            )}
            {phase === 'staged' && (
              <div className="fb-glass-chrome rounded-lg border border-[color:var(--glass-chrome-border)] p-3 shadow-xl">
                <div className="text-accent text-[10px] uppercase tracking-[0.18em] mb-1.5">
                  Transcript · edit and send
                </div>
                <textarea
                  ref={(el) => {
                    // Auto-focus when staged so the user can immediately
                    // correct without reaching for the mouse.
                    if (el && document.activeElement !== el) el.focus()
                  }}
                  value={editedTranscript}
                  onChange={(e) => setEditedTranscript(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void sendToAi()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      onDismissAll()
                    }
                  }}
                  rows={3}
                  placeholder={transcript ? '' : 'Transcribing…'}
                  className="w-full bg-stone-50/40 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60 rounded px-2 py-1.5 text-[12px] text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent resize-none"
                  data-testid="voice-command-transcript"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] text-stone-500">⌘⏎ to send · Esc to cancel</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={onDismissAll}
                      className="text-[11px] px-2 py-1 rounded hover:bg-stone-100/10 text-stone-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void sendToAi()}
                      disabled={!editedTranscript.trim()}
                      className="text-[11px] px-2.5 py-1 rounded bg-accent text-white disabled:opacity-50 hover:brightness-110"
                      data-testid="voice-command-send"
                    >
                      Send
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="text-[10px] text-amber-400 mt-1.5">{error}</div>
                )}
              </div>
            )}
            {phase === 'error' && (
              <div className="fb-glass-chrome rounded-lg border border-amber-500/40 p-3 shadow-xl">
                <div className="text-amber-400 text-[10px] uppercase tracking-[0.18em] mb-1 flex items-center gap-1">
                  <Icon name="warning" size={12} />
                  Voice command couldn’t run
                </div>
                <div className="text-[12px] text-stone-200 leading-snug">
                  {error || 'Something went wrong. Try again.'}
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={onDismissAll}
                    className="text-[11px] px-2.5 py-1 rounded bg-stone-100/10 hover:bg-stone-100/20 text-stone-200"
                    data-testid="voice-command-error-dismiss"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {phase === 'sending' && (
              <div className="fb-glass-chrome rounded-lg border border-accent/40 px-3 py-2 text-[12px] text-stone-100 shadow-xl inline-flex items-center gap-2">
                <Icon name="hourglass_empty" size={12} className="text-accent" />
                Interpreting…
              </div>
            )}
            {phase === 'result' && (
              <div
                className="fb-glass-chrome rounded-lg border border-[color:var(--glass-chrome-border)] p-3 shadow-xl"
                data-testid="voice-command-result"
              >
                {reply && (
                  <div className="text-[12px] text-stone-200 mb-2 leading-snug">{reply}</div>
                )}
                {proposals.length === 0 ? (
                  <div className="text-[11px] text-stone-400 italic">
                    No actions proposed.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {proposals.map((p) => (
                      <ProposalCard
                        key={p.id}
                        proposal={p}
                        onApply={() => void onApply(p.id)}
                        onDismiss={() => onDismiss(p.id)}
                      />
                    ))}
                  </div>
                )}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={onDismissAll}
                    className="text-[10px] text-stone-400 hover:text-stone-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* The button itself — pointer-events-auto so it receives clicks inside the none container */}
        <button
          onPointerDown={fabPressDown}
          onPointerUp={fabPressUp}
          onPointerLeave={fabPressUp}
          onClick={fabClick}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={`pointer-events-auto h-10 w-10 rounded-full flex items-center justify-center shadow-xl transition-all duration-150 ${
            isActive
              ? 'bg-accent text-white scale-110 fb-halo'
              : 'bg-stone-800/90 dark:bg-stone-900/90 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_4px_16px_rgba(0,0,0,0.40)] hover:bg-stone-700/90 dark:hover:bg-stone-800/90'
          }`}
          title={
            prefs.commandMode === 'press-hold'
              ? 'Hold to speak'
              : phase === 'listening'
                ? 'Click to stop'
                : 'Click to speak'
          }
          aria-label="Voice command"
          data-testid="voice-command-fab"
          data-phase={phase}
        >
          <Icon name={isActive ? 'graphic_eq' : 'mic'} size={20} />
        </button>
        {!showOverlay && hovering && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] text-stone-300 bg-stone-900/85 rounded px-1.5 py-0.5 whitespace-nowrap">
            {prefs.commandMode === 'press-hold' ? 'Hold to speak' : 'Click to speak'}
          </div>
        )}
      </div>
    </>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: Proposal
  onApply: () => void
  onDismiss: () => void
}

function ProposalCard({ proposal, onApply, onDismiss }: ProposalCardProps): JSX.Element {
  const desc = describeProposal(proposal)
  const isDestructive = proposal.kind === 'delete-widget'
  const isUpdate = proposal.kind === 'update-widget'
  const status = proposal._status ?? 'pending'

  // Look up the target widget so update cards can render a before/after
  // diff inline. Subscribed reactively — if the widget mutates while a
  // proposal is pending, the card stays accurate.
  const target = useWidgetStore((s) =>
    proposal.kind === 'update-widget' || proposal.kind === 'delete-widget' || proposal.kind === 'focus-widget'
      ? s.widgets.find((w) => w.id === proposal.widgetId)
      : undefined
  )

  if (status === 'applied') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200">
        <Icon name="check" size={12} />
        <span className="flex-1 truncate">{proposal._message || `${desc.verb} ${desc.subject}`}</span>
      </div>
    )
  }
  if (status === 'dismissed') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-stone-700/20 border border-stone-600/20 text-[11px] text-stone-500 italic">
        <Icon name="close" size={12} />
        <span className="flex-1 truncate">Dismissed · {desc.subject}</span>
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
        <Icon name="warning" size={12} />
        <span className="flex-1 truncate">{proposal._message || 'Failed'}</span>
        <button
          onClick={onDismiss}
          className="text-[10px] text-stone-400 hover:text-stone-200"
        >
          Close
        </button>
      </div>
    )
  }
  return (
    <div
      className={`px-2 py-1.5 rounded border text-[11px] ${
        isDestructive
          ? 'bg-rose-500/5 border-rose-500/30'
          : 'bg-stone-800/40 border-stone-700/60'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name={desc.icon}
          size={12}
          className={isDestructive ? 'text-rose-400' : 'text-accent'}
        />
        <div className="flex-1 min-w-0">
          <div className="text-stone-100 font-medium truncate">{desc.verb}</div>
          <div className="text-stone-400 text-[10px] truncate">{desc.subject}</div>
        </div>
        <button
          onClick={onDismiss}
          className="text-[10px] text-stone-400 hover:text-stone-200 px-1"
          data-testid={`voice-proposal-dismiss-${proposal.id}`}
        >
          Dismiss
        </button>
        <button
          onClick={onApply}
          className={`text-[10px] px-2 py-0.5 rounded text-white hover:brightness-110 ${
            isDestructive ? 'bg-rose-600' : 'bg-accent'
          }`}
          data-testid={`voice-proposal-apply-${proposal.id}`}
        >
          {isDestructive ? 'Confirm delete' : 'Apply'}
        </button>
      </div>
      {isUpdate && target && proposal.kind === 'update-widget' && (
        <UpdateDiff
          before={target}
          proposal={proposal as Extract<ActionProposal, { kind: 'update-widget' }>}
        />
      )}
    </div>
  )
}

// Inline before/after diff for update-widget proposals. Only renders
// rows for fields the proposal actually mutates — keeps the card
// compact when only one attribute changes. Long text values are
// clipped to a single ellipsised line; the full content is in the
// canvas after Apply.
interface UpdateDiffProps {
  before: Widget
  proposal: Extract<ActionProposal, { kind: 'update-widget' }>
}

function UpdateDiff({ before, proposal }: UpdateDiffProps): JSX.Element {
  const rows: Array<{ field: string; from: string; to: string }> = []
  if (proposal.title !== undefined) {
    rows.push({ field: 'Title', from: before.title || '(empty)', to: proposal.title || '(empty)' })
  }
  if (proposal.content !== undefined) {
    const op = proposal.operation ?? 'replace'
    if (op === 'append') {
      rows.push({
        field: 'Append',
        from: clip(before.content || '', 36),
        to: `... + ${clip(proposal.content, 36)}`
      })
    } else if (op === 'prepend') {
      rows.push({
        field: 'Prepend',
        from: clip(before.content || '', 36),
        to: `${clip(proposal.content, 36)} + ...`
      })
    } else {
      rows.push({
        field: 'Content',
        from: clip(before.content || '', 36),
        to: clip(proposal.content, 36)
      })
    }
  }
  if (proposal.x !== undefined || proposal.y !== undefined) {
    rows.push({
      field: 'Position',
      from: `(${Math.round(before.x)}, ${Math.round(before.y)})`,
      to: `(${Math.round(proposal.x ?? before.x)}, ${Math.round(proposal.y ?? before.y)})`
    })
  }
  if (proposal.width !== undefined || proposal.height !== undefined) {
    rows.push({
      field: 'Size',
      from: `${Math.round(before.width)} x ${Math.round(before.height)}`,
      to: `${Math.round(proposal.width ?? before.width)} x ${Math.round(proposal.height ?? before.height)}`
    })
  }
  if (rows.length === 0) return <></>
  return (
    <div
      className="mt-1.5 pt-1.5 border-t border-stone-700/60 space-y-0.5"
      data-testid="voice-proposal-diff"
    >
      {rows.map((r) => (
        <div key={r.field} className="flex items-center gap-1 text-[10px] min-w-0">
          <span className="text-stone-500 w-14 shrink-0">{r.field}</span>
          <span className="text-stone-400 truncate flex-1" title={r.from}>
            {r.from}
          </span>
          <Icon name="arrow_right_alt" size={10} className="text-stone-500 shrink-0" />
          <span className="text-accent truncate flex-1" title={r.to}>
            {r.to}
          </span>
        </div>
      ))}
    </div>
  )
}

function clip(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  if (flat.length <= n) return flat || '(empty)'
  return flat.slice(0, n) + '...'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Decode an arbitrary audio blob (webm/opus etc) into mono 16kHz Float32 PCM
// samples — the format the local Whisper model expects. Matches the
// VoiceRecorderWidget's helper but inlined here so the FAB is standalone.
async function decodeToMono16k(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AC: typeof AudioContext =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
  const ctx = new AC({ sampleRate: 16000 })
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
  let mono: Float32Array
  if (decoded.numberOfChannels === 1) {
    mono = decoded.getChannelData(0)
  } else {
    const len = decoded.length
    mono = new Float32Array(len)
    const ch0 = decoded.getChannelData(0)
    const ch1 = decoded.getChannelData(1)
    for (let i = 0; i < len; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5
  }
  await ctx.close()
  return mono
}

// Spoken voice-back via Web Speech API. Best-effort: any platform that
// doesn't have synthesis (rare in Chromium / Electron) just no-ops.
function speak(text: string): void {
  try {
    const synth = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
    if (!synth) return
    synth.cancel() // kill any in-flight utterance
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    u.pitch = 1.0
    u.volume = 0.85
    synth.speak(u)
  } catch {
    // ignore
  }
}
