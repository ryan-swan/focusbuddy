// Node-canvas origins — when a mind-map node is "explored" it opens (or creates)
// its own task canvas. This map remembers, per task id, WHERE that canvas came
// from (the source task holding the mind map + the node), so the canvas can show
// a breadcrumb back to the map. The forward link (node → taskId) lives in the
// mind-map widget's own content; this is just the reverse hint for navigation.
//
// localStorage-backed + a subscribe() broadcast so the Canvas breadcrumb updates
// live — same pattern as navPrefs / customBlockTemplates. Per-device for now.

export interface NodeCanvasOrigin {
  /** The task whose canvas holds the source mind-map widget. */
  sourceTaskId: string
  /** Display title of that task (for the breadcrumb label). */
  sourceTaskTitle: string
  /** The mind-map widget id on that task. */
  mindmapWidgetId: string
  /** The explored node's id within the mind map. */
  nodeId: string
  /** The explored node's label. */
  nodeLabel: string
  /** Ancestor labels from the map root down to (and excluding) the node. */
  nodePath: string[]
}

const KEY = 'fb.mindmap.nodeCanvasOrigins'
const listeners = new Set<() => void>()

type OriginMap = Record<string, NodeCanvasOrigin>

function readAll(): OriginMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as OriginMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: OriginMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // storage unavailable — non-fatal
  }
  for (const l of listeners) l()
}

export function getOrigin(taskId: string | null): NodeCanvasOrigin | null {
  if (!taskId) return null
  return readAll()[taskId] ?? null
}

export function setOrigin(taskId: string, origin: NodeCanvasOrigin): void {
  const all = readAll()
  all[taskId] = origin
  writeAll(all)
}

export function clearOrigin(taskId: string): void {
  const all = readAll()
  if (taskId in all) {
    delete all[taskId]
    writeAll(all)
  }
}

export function subscribeOrigins(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
