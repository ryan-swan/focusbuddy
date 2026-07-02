import { useRef, useState } from 'react'
import Icon from '../../Icon'
import { uploadAttachment, attachmentKindForMime, type MessageAttachment } from '../../../lib/messagingClient'
import { EmojiPicker } from './EmojiPicker'
import { GifPicker } from './GifPicker'
import { launchMeeting } from '../../../lib/startMeeting'

// The message composer: text plus the ways to enrich a message — attach a file or
// image, record a voice note, insert an emoji. A pending attachment is uploaded
// to the conversation immediately and shown as a chip; sending then posts the
// message that references it. Upload failures surface honestly rather than
// silently dropping the file.

interface PendingAttachment {
  attachment: Extract<MessageAttachment, { kind: 'image' | 'file' | 'voice' | 'video' | 'gif' }>
  previewUrl?: string // object URL for local image/gif preview before send
}

export function ChatComposer({
  conversationId,
  token,
  onSend,
  onTyping
}: {
  conversationId: string
  token: string
  onSend: (body: string, attachment: MessageAttachment | null) => Promise<void>
  onTyping: () => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<PendingAttachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)

  function extOf(name: string): string {
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.slice(i).toLowerCase() : ''
  }

  async function uploadFile(file: File): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const kind = attachmentKindForMime(file.type)
      const buf = await file.arrayBuffer()
      const result = await uploadAttachment(token, conversationId, kind, buf, {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        ext: extOf(file.name)
      })
      if (!result) {
        setError('Could not upload that file.')
        return
      }
      setPending({
        attachment: {
          kind,
          id: result.id,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: result.sizeBytes
        },
        previewUrl: kind === 'file' ? undefined : URL.createObjectURL(file)
      })
    } finally {
      setBusy(false)
    }
  }

  async function startRecording(): Promise<void> {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const durationMs = Date.now() - recordStartRef.current
        setBusy(true)
        try {
          const result = await uploadAttachment(token, conversationId, 'voice', await blob.arrayBuffer(), {
            name: `voice-note.webm`,
            mime: blob.type || 'audio/webm',
            ext: '.webm'
          })
          if (!result) {
            setError('Could not save the voice note.')
            return
          }
          setPending({
            attachment: {
              kind: 'voice',
              id: result.id,
              name: 'Voice note',
              mimeType: blob.type || 'audio/webm',
              sizeBytes: result.sizeBytes,
              durationMs
            }
          })
        } finally {
          setBusy(false)
        }
      }
      recordStartRef.current = Date.now()
      rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch {
      setError('Microphone is not available.')
    }
  }

  function stopRecording(): void {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  // Selecting a GIF: download the chosen gif bytes and upload them as a 'gif'
  // attachment, so it persists in our blob store and renders through the same
  // authenticated route as other attachments (no hotlinking).
  async function pickGif(url: string, description: string): Promise<void> {
    setShowGif(false)
    setError(null)
    setBusy(true)
    try {
      const resp = await fetch(url)
      if (!resp.ok) {
        setError('Could not fetch that GIF.')
        return
      }
      const buf = await resp.arrayBuffer()
      const result = await uploadAttachment(token, conversationId, 'gif', buf, {
        name: `${description || 'gif'}.gif`.slice(0, 80),
        mime: 'image/gif',
        ext: '.gif'
      })
      if (!result) {
        setError('Could not attach that GIF.')
        return
      }
      setPending({
        attachment: { kind: 'gif', id: result.id, name: description || 'GIF', mimeType: 'image/gif', sizeBytes: result.sizeBytes },
        previewUrl: url
      })
    } finally {
      setBusy(false)
    }
  }

  function clearPending(): void {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  async function submit(): Promise<void> {
    const body = draft.trim()
    if (!body && !pending) return
    if (busy) return
    const attachment = pending?.attachment ?? null
    setDraft('')
    clearPending()
    setShowEmoji(false)
    await onSend(body, attachment)
  }

  const canSend = (draft.trim().length > 0 || pending !== null) && !busy

  return (
    <div className="px-4 py-3 border-t border-stone-200 dark:border-stone-800">
      {error && (
        <div className="mb-2 text-[11px] text-rose-500" data-testid="composer-error">
          {error}
        </div>
      )}
      {pending && (
        <div
          className="mb-2 inline-flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--edge-soft)] px-2 py-1.5"
          data-testid="composer-pending"
        >
          {pending.previewUrl && pending.attachment.kind === 'video' ? (
            <video src={pending.previewUrl} className="h-9 w-9 rounded object-cover bg-black" muted />
          ) : pending.previewUrl && pending.attachment.kind !== 'voice' ? (
            <img src={pending.previewUrl} alt="" className="h-9 w-9 rounded object-cover" />
          ) : (
            <Icon name={pending.attachment.kind === 'voice' ? 'mic' : pending.attachment.kind === 'video' ? 'movie' : 'description'} size={16} />
          )}
          <span className="text-[12px] text-[var(--ink-90)] truncate max-w-[200px]">{pending.attachment.name}</span>
          <button onClick={clearPending} aria-label="Remove attachment" className="text-[var(--ink-50)] hover:text-[var(--ink-90)]">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          data-testid="composer-file-input"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0]
            if (f) void uploadFile(f)
            e.currentTarget.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="icon-btn shrink-0"
          title="Attach a file or image"
          data-testid="composer-attach"
          disabled={busy}
        >
          <Icon name="attach_file" size={16} />
        </button>
        <button
          onClick={() => (recording ? stopRecording() : void startRecording())}
          className={`icon-btn shrink-0 ${recording ? 'text-rose-500' : ''}`}
          title={recording ? 'Stop recording' : 'Record a voice note'}
          data-testid="composer-voice"
          disabled={busy && !recording}
        >
          <Icon name={recording ? 'stop_circle' : 'mic'} size={16} />
        </button>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowEmoji((s) => !s)}
            className="icon-btn"
            title="Emoji"
            data-testid="composer-emoji"
          >
            <Icon name="mood" size={16} />
          </button>
          {showEmoji && (
            <EmojiPicker
              onPick={(e) => {
                setDraft((d) => d + e)
                setShowEmoji(false)
              }}
              onClose={() => setShowEmoji(false)}
            />
          )}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowGif((s) => !s)}
            className="icon-btn"
            title="GIF"
            data-testid="composer-gif"
          >
            <Icon name="gif_box" size={16} />
          </button>
          {showGif && <GifPicker onSelect={(url, desc) => void pickGif(url, desc)} onClose={() => setShowGif(false)} />}
        </div>
        <button
          onClick={() => void launchMeeting({ kind: 'chat', channelId: conversationId, title: 'Chat meeting' })}
          className="icon-btn shrink-0"
          title="Start a meeting"
          data-testid="composer-meet"
        >
          <Icon name="videocam" size={16} />
        </button>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            onTyping()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={recording ? 'Recording… tap stop when done' : 'Write a message…'}
          rows={1}
          data-testid="message-composer"
          className="flex-1 resize-none bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSend}
          className="btn-primary shrink-0"
          data-testid="message-send"
        >
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  )
}
