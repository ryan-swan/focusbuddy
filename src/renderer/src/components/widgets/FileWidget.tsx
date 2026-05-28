import { useEffect, useState } from 'react'
import type { Widget } from '@shared/types'
import type { FbFile, FileKind } from '@shared/fields'
import { fileKindFromMime } from '@shared/fields'
import WidgetFrame from './WidgetFrame'
import { useFilesStore } from '../../stores/files'
import { useWidgetStore } from '../../stores/widgets'
import Icon from '../Icon'

interface Props {
  widget: Widget
  inline?: boolean
}

// Universal file widget.
//
// widget.content = fb_files.id. We resolve the file to an `fb-file://<id>`
// URL — that's our custom protocol registered in main, which serves the file
// directly from disk with proper Content-Type + Range-request support. This
// works in <img>, <video>, <audio>, <iframe> without needing to round-trip
// the bytes through IPC or build a blob URL.
//
// The PDF viewer uses <iframe> (not <object>) because Chromium's built-in
// PDF viewer only exposes its toolbar — including page navigation — when
// loaded as a top-level frame document.
export default function FileWidget({ widget, inline = false }: Props): JSX.Element {
  const fileId = widget.content
  const file = useFilesStore((s) => s.files[fileId] ?? null)
  const ensureLoaded = useFilesStore((s) => s.ensureLoaded)
  const update = useWidgetStore((s) => s.update)
  const [dropping, setDropping] = useState(false)

  // Load metadata into the store the first time this widget is shown. The
  // `fb-file://` URL only depends on the file id so we don't need to wait
  // for metadata to render the preview — but we need it for the header,
  // filename display, and to pick the right renderer.
  useEffect(() => {
    if (fileId) void ensureLoaded(fileId)
  }, [fileId, ensureLoaded])

  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    setDropping(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    const buffer = await f.arrayBuffer()
    const ingested = await window.api.files.ingestBuffer({
      buffer,
      originalName: f.name,
      mimeType: f.type || 'application/octet-stream'
    })
    void update(widget.id, { content: ingested.id, title: f.name })
  }

  if (!fileId) {
    const body = (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => void handleDrop(e)}
        className={`h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center ${
          dropping
            ? 'bg-accent/10 ring-2 ring-accent ring-inset'
            : 'bg-stone-50 dark:bg-stone-900'
        }`}
      >
        <Icon name="upload_file" size={28} className="text-stone-400" />
        <div className="text-[12px] text-stone-600 dark:text-stone-300">
          Drop a file here
        </div>
        <div className="text-[10px] text-stone-400">
          PDF, image, video, audio, anything
        </div>
      </div>
    )
    if (inline) return body
    return (
      <WidgetFrame widget={widget} headerLabel="File" headerAccent="bg-stone-300/60">
        {body}
      </WidgetFrame>
    )
  }

  const kind: FileKind = file ? fileKindFromMime(file.mimeType, file.ext) : 'generic'
  // The fb-file URL works even before metadata loads, so the preview shows
  // immediately on first drop. The header text falls back gracefully.
  const url = `fb-file://${fileId}`
  const body = (
    <div className="h-full w-full bg-stone-50 dark:bg-stone-900 overflow-hidden">
      <FileRenderer kind={kind} url={url} file={file} />
    </div>
  )
  if (inline) return body
  return (
    <WidgetFrame
      widget={widget}
      headerLabel={file ? file.originalName : 'File'}
      headerAccent="bg-stone-300/60"
    >
      {body}
    </WidgetFrame>
  )
}

function FileRenderer({
  kind,
  url,
  file
}: {
  kind: FileKind
  url: string
  file: FbFile | null
}): JSX.Element {
  switch (kind) {
    case 'image':
      return (
        <img
          src={url}
          alt={file?.originalName ?? ''}
          className="w-full h-full object-contain"
          draggable={false}
        />
      )
    case 'pdf':
      // <iframe> activates Chromium's full PDF viewer toolbar (page nav,
      // zoom, rotate, print, download). <object> often suppresses the
      // toolbar. The `#toolbar=1` hash is a no-op for fb-file:// but kept
      // for documentation of intent.
      return (
        <iframe
          src={`${url}#toolbar=1&navpanes=1&view=FitH`}
          title={file?.originalName ?? 'PDF'}
          className="w-full h-full border-0"
        />
      )
    case 'video':
      return (
        <video
          src={url}
          controls
          className="w-full h-full bg-black"
          preload="metadata"
        />
      )
    case 'audio':
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-4">
          <Icon name="music_note" size={32} className="text-accent" />
          <div className="text-[12px] font-medium text-stone-800 dark:text-stone-100 truncate max-w-full">
            {file?.originalName ?? 'Audio'}
          </div>
          <audio src={url} controls className="w-full" preload="metadata" />
        </div>
      )
    case 'generic':
    default:
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center">
          <Icon name="description" size={32} className="text-stone-400" />
          <div className="text-[12px] font-medium text-stone-800 dark:text-stone-100 truncate max-w-full">
            {file?.originalName ?? 'File'}
          </div>
          {file && (
            <div className="text-[10px] text-stone-500">
              {(file.sizeBytes / 1024).toFixed(1)} KB · {file.mimeType}
            </div>
          )}
          <a
            href={url}
            download={file?.originalName ?? 'file'}
            className="text-[11px] px-2 py-1 rounded bg-accent text-white hover:opacity-90"
          >
            Download
          </a>
        </div>
      )
  }
}
