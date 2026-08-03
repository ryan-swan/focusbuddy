import { getNode } from '../db/nodes'
import { getWidget, listWidgetsByTask } from '../db/widgets'
import { listLinksByTask } from '../db/widgetLinks'
import { summariseWidget } from './widgetSummary'
import type { Widget } from '@shared/types'

// Control room: a portal is a live data SOURCE. Its effective content is the
// aggregation of the desk it points at, PLUS everything wired into it (so one
// portal can inherit several desks and feed them all into an agent). Recursive
// with a depth cap and a visited set so portal-to-portal cycles terminate.

const MAX_DEPTH = 3
const MAX_CHARS = 9000
const PER_WIDGET = 600

interface PortalConfig {
  targetTaskId: string | null
}

function targetOf(portal: Widget): string | null {
  try {
    return (JSON.parse(portal.content || '{}') as PortalConfig).targetTaskId ?? null
  } catch {
    return null
  }
}

// A compact block for one desk: its title + a summary of each top-level widget.
function deskBlock(taskId: string): string {
  const node = getNode(taskId)
  const title = node?.title || 'Untitled desk'
  const widgets = listWidgetsByTask(taskId).filter(
    (w) => !w.archived && !w.pinned && w.parentSectionId === null && w.kind !== 'minimap'
  )
  if (widgets.length === 0) return `Desk "${title}": (empty)`
  const lines = widgets.map((w) => {
    const label = w.title ? ` "${w.title}"` : ''
    const body = summariseWidget(w).replace(/\s+/g, ' ').slice(0, PER_WIDGET)
    return `- [${w.kind}${label}] ${body}`
  })
  return `Desk "${title}":\n${lines.join('\n')}`
}

// Aggregate a portal widget. `visited` is keyed by widget id AND task id so a
// cycle through either dimension is caught.
export function aggregatePortalContent(
  portal: Widget,
  visited: Set<string> = new Set(),
  depth = 0
): string {
  if (depth > MAX_DEPTH) return '(nested portals too deep to follow further)'
  if (visited.has(`w:${portal.id}`)) return '(already included above)'
  visited.add(`w:${portal.id}`)

  const parts: string[] = []

  // 1) This portal's own target desk (skip self-reference to its own desk).
  const target = targetOf(portal)
  if (target && target !== portal.taskId && !visited.has(`t:${target}`)) {
    visited.add(`t:${target}`)
    parts.push(deskBlock(target))
  }

  // 2) Inheritance: everything wired INTO this portal (on the portal's own
  //    desk). A wired-in portal contributes its full aggregation; any other
  //    widget contributes its summary.
  const incoming = listLinksByTask(portal.taskId)
    .filter((l) => l.targetWidgetId === portal.id)
    .map((l) => getWidget(l.sourceWidgetId))
    .filter((w): w is Widget => !!w && !w.archived)

  for (const src of incoming) {
    if (src.kind === 'portal') {
      parts.push(aggregatePortalContent(src, visited, depth + 1))
    } else {
      const label = src.title ? ` "${src.title}"` : ''
      parts.push(`Inherited [${src.kind}${label}]:\n${summariseWidget(src).slice(0, PER_WIDGET)}`)
    }
  }

  if (parts.length === 0) {
    return 'This portal has no target desk and nothing wired into it yet.'
  }

  let out = parts.join('\n\n---\n\n')
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS) + '\n\n(…aggregation truncated to fit.)'
  }
  return out
}
