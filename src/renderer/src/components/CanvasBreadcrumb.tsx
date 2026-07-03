import { useMemo } from 'react'
import type { FbNode } from '@shared/types'
import Icon from './Icon'

// System-wide canvas breadcrumb. Shows where the open task sits in the workspace
// — Home › Folder › … › ancestor task › CURRENT — derived from the node tree's
// parentId chain. Because explored mind-map node-canvases nest under their
// parent task, this same chain naturally provides the path back to the map
// (click the parent task) without any special-casing.
//
// Clickable: Home (→ workspace home), any ancestor TASK (→ open its canvas),
// any FOLDER (→ reveal/expand it in the sidebar). The current task is bold.

interface Props {
  activeTask: FbNode
  nodes: FbNode[]
  onOpenTask: (id: string) => void
  onRevealFolder: (id: string) => void
  onHome: () => void
  // Subtle hint that this canvas was explored from a mind-map node.
  fromMindmap?: boolean
}

export default function CanvasBreadcrumb({
  activeTask,
  nodes,
  onOpenTask,
  onRevealFolder,
  onHome,
  fromMindmap
}: Props): JSX.Element {
  const chain = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const out: FbNode[] = []
    let cur: FbNode | undefined = byId.get(activeTask.id) ?? activeTask
    let guard = 0
    while (cur && guard++ < 50) {
      out.unshift(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return out
  }, [activeTask, nodes])

  return (
    <div
      className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-[color:var(--glass-chrome-border)] fb-glass-chrome text-[12px] overflow-x-auto whitespace-nowrap"
      data-testid="canvas-breadcrumb"
    >
      <button
        onClick={onHome}
        className="inline-flex items-center justify-center h-6 w-6 rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] shrink-0"
        title="Workspace home"
        aria-label="Workspace home"
      >
        <Icon name="home" size={15} />
      </button>
      {chain.map((n, i) => {
        const isLast = i === chain.length - 1
        const isFolder = n.kind === 'folder'
        return (
          <span key={n.id} className="inline-flex items-center gap-0.5 shrink-0">
            <Icon name="chevron_right" size={15} className="text-[var(--ink-50)]" />
            {isLast ? (
              <span
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 font-semibold text-[var(--ink-100)] max-w-[280px]"
                data-testid="breadcrumb-current"
              >
                <Icon
                  name={fromMindmap ? 'account_tree' : isFolder ? 'folder' : 'task_alt'}
                  size={14}
                  className="text-accent shrink-0"
                />
                <span className="truncate">{n.title || '(untitled)'}</span>
              </span>
            ) : (
              <button
                onClick={() => (isFolder ? onRevealFolder(n.id) : onOpenTask(n.id))}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] max-w-[200px]"
                title={isFolder ? `Reveal “${n.title}” in the sidebar` : `Open “${n.title}”`}
                data-testid={`breadcrumb-${n.id}`}
              >
                <Icon
                  name={isFolder ? 'folder' : 'task_alt'}
                  size={13}
                  className="text-[var(--ink-50)] shrink-0"
                />
                <span className="truncate">{n.title || '(untitled)'}</span>
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
