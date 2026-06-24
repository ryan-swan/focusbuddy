import { useState } from 'react'
import Icon from '../Icon'
import type { DocComment } from '../../lib/docCollabClient'

// The comment thread panel for a live document. Top-level comments are threads;
// each anchors to highlighted text in the editor (click to jump). Replies nest
// under their root. Any member can resolve; only the author can delete.

interface Props {
  comments: DocComment[]
  myId: string | null
  handleOf: (accountId: string) => string
  onReply: (rootId: string, body: string) => void
  onResolve: (rootId: string, resolved: boolean) => void
  onDelete: (commentId: string) => void
  onJump: (commentId: string) => void
  onClose: () => void
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Thread({
  root,
  replies,
  myId,
  handleOf,
  onReply,
  onResolve,
  onDelete,
  onJump
}: {
  root: DocComment
  replies: DocComment[]
  myId: string | null
  handleOf: (id: string) => string
  onReply: (rootId: string, body: string) => void
  onResolve: (rootId: string, resolved: boolean) => void
  onDelete: (commentId: string) => void
  onJump: (commentId: string) => void
}): JSX.Element {
  const [reply, setReply] = useState('')
  const submit = (): void => {
    const t = reply.trim()
    if (!t) return
    onReply(root.id, t)
    setReply('')
  }
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${root.resolved ? 'border-stone-200 dark:border-stone-800 opacity-60' : 'border-stone-200 dark:border-stone-700'}`}
      data-testid={`comment-thread-${root.id}`}
    >
      <div className="flex items-start gap-2">
        <button onClick={() => onJump(root.id)} className="min-w-0 flex-1 text-left" title="Jump to the highlighted text">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-stone-800 dark:text-stone-100">{handleOf(root.authorAccountId)}</span>
            <span className="text-[10px] text-stone-400">{fmtTime(root.createdAt)}</span>
            {root.resolved && <span className="text-[10px] px-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">Resolved</span>}
          </div>
          <div className="text-[12.5px] text-stone-700 dark:text-stone-200 mt-0.5 whitespace-pre-wrap">{root.body}</div>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={() => onResolve(root.id, !root.resolved)}
            className="icon-btn"
            title={root.resolved ? 'Reopen' : 'Resolve'}
            data-testid={`comment-resolve-${root.id}`}
          >
            <Icon name={root.resolved ? 'replay' : 'check_circle'} size={14} />
          </button>
          {root.authorAccountId === myId && (
            <button onClick={() => onDelete(root.id)} className="icon-btn" title="Delete">
              <Icon name="delete" size={14} />
            </button>
          )}
        </div>
      </div>

      {replies.map((r) => (
        <div key={r.id} className="ml-3 mt-1.5 pl-2 border-l border-stone-200 dark:border-stone-700">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] font-medium text-stone-700 dark:text-stone-200">{handleOf(r.authorAccountId)}</span>
            <span className="text-[10px] text-stone-400">{fmtTime(r.createdAt)}</span>
            {r.authorAccountId === myId && (
              <button onClick={() => onDelete(r.id)} className="icon-btn ml-auto" title="Delete">
                <Icon name="delete" size={12} />
              </button>
            )}
          </div>
          <div className="text-[12px] text-stone-700 dark:text-stone-200 whitespace-pre-wrap">{r.body}</div>
        </div>
      ))}

      {!root.resolved && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="Reply…"
            data-testid={`comment-reply-${root.id}`}
            className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
          />
          <button onClick={submit} disabled={!reply.trim()} className="icon-btn disabled:opacity-40" title="Reply">
            <Icon name="send" size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function CommentsPanel({ comments, myId, handleOf, onReply, onResolve, onDelete, onJump, onClose }: Props): JSX.Element {
  const roots = comments.filter((c) => !c.parentId).sort((a, b) => a.createdAt - b.createdAt)
  const repliesOf = (id: string): DocComment[] =>
    comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt - b.createdAt)
  return (
    <aside
      className="w-72 shrink-0 border-l border-stone-200 dark:border-stone-800 flex flex-col bg-white/60 dark:bg-stone-900/40"
      data-testid="comments-panel"
    >
      <div className="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2">
        <Icon name="comment" size={14} className="text-accent" />
        <span className="text-[12px] font-semibold">Comments</span>
        <span className="text-[11px] text-stone-400">{roots.length}</span>
        <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close comments">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {roots.length === 0 ? (
          <div className="text-[12px] text-stone-400 p-2">
            No comments yet. Select text in the document and choose Comment to start a thread.
          </div>
        ) : (
          roots.map((root) => (
            <Thread
              key={root.id}
              root={root}
              replies={repliesOf(root.id)}
              myId={myId}
              handleOf={handleOf}
              onReply={onReply}
              onResolve={onResolve}
              onDelete={onDelete}
              onJump={onJump}
            />
          ))
        )}
      </div>
    </aside>
  )
}
