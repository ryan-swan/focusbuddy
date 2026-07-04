import { useEffect, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import Icon from './Icon'

interface Props {
  task: FbNode
  onClose: () => void
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

function renderMarkdown(md: string): JSX.Element {
  const lines = md.split('\n')
  return (
    <div className="text-sm text-[var(--ink-90)] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) {
          return (
            <h2
              key={i}
              className="text-base font-semibold text-[var(--ink-100)] mt-3 mb-1 first:mt-0"
            >
              {line.slice(2)}
            </h2>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-sm font-semibold text-[var(--ink-100)] mt-2 mb-1">
              {line.slice(3)}
            </h3>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="pl-4 -indent-2 my-0.5">
              • {renderInline(line.slice(2))}
            </div>
          )
        }
        const numMatch = /^(\d+)\.\s+(.*)$/.exec(line)
        if (numMatch) {
          return (
            <div key={i} className="pl-5 -indent-3 my-0.5">
              <span className="text-[var(--ink-50)] font-medium">{numMatch[1]}.</span>{' '}
              {renderInline(numMatch[2])}
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />
        return (
          <div key={i} className="my-0.5">
            {renderInline(line)}
          </div>
        )
      })}
    </div>
  )
}

export default function ResumeModal({ task, onClose }: Props): JSX.Element {
  const update = useNodeStore((s) => s.update)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState(task.resumeMarkdown ?? '')
  const updatedAt = task.resumeUpdatedAt
    ? new Date(task.resumeUpdatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : null

  useEffect(() => {
    setContent(task.resumeMarkdown ?? '')
  }, [task.id, task.resumeMarkdown])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleGenerate(): Promise<void> {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = await window.api.resume.generate(task.id)
      if (result.ok && result.markdown) {
        const now = Date.now()
        await update(task.id, { resumeMarkdown: result.markdown, resumeUpdatedAt: now })
        setContent(result.markdown)
      } else {
        setError(result.error ?? 'Generation failed')
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/45 backdrop-blur-md p-6"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-raised)] rounded-lg shadow-2xl border border-[var(--edge-soft)] w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)] flex items-center gap-2">
          <Icon name="description" size={18} className="text-[var(--ink-70)]" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--ink-100)] truncate">
              Resume — {task.title}
            </h3>
            {updatedAt && (
              <p className="text-[11px] text-[var(--ink-50)]">Updated {updatedAt}</p>
            )}
          </div>
          <button onClick={onClose} className="icon-btn" title="Close (Esc)">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {content ? (
            renderMarkdown(content)
          ) : (
            <div className="text-center py-8 text-[var(--ink-70)] text-sm">
              <Icon name="description" size={36} className="text-[var(--ink-40)] mb-2" />
              <p className="mb-3">
                No resume saved yet for this task.
                <br />
                Generate one to capture where you are right now.
              </p>
            </div>
          )}
          {error && (
            <div className="mt-3 px-3 py-2 rounded bg-red-50 border border-red-200 text-xs text-red-800">
              <strong>Generation failed:</strong> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--edge-soft)] bg-[var(--surface-sunken)] flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="btn-primary"
          >
            <Icon name={generating ? 'hourglass_top' : 'auto_awesome'} size={14} />
            <span>
              {generating ? 'Generating…' : content ? 'Regenerate' : 'Generate resume'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
