// Pure assembly of the real environment state into a compact context block for
// the Daily Brief. Kept side-effect free so it is unit-tested directly. Nothing
// is invented: empty inputs produce an honestly empty context, and the caller
// short-circuits to a "your day is clear" message rather than asking the model
// to hallucinate a plan.

export interface BriefTask {
  id?: string
  title: string
  status: string
  priority: number
  importance: number
  dueDate: number | null
}

// Defensive title cleanup for anything surfaced to a human (the standup, the daily
// brief, the AI prompt). Some objects carry an ugly or machine title — most often a
// map/mindmap whose title is the serialised body JSON. Never show that: pull a
// human label out of the JSON if there is one, collapse whitespace, and cap the
// length. Falls back to a kind-appropriate label when nothing usable remains.
export function cleanTitle(raw: string | null | undefined, fallback = 'Untitled'): string {
  let s = (raw ?? '').trim()
  if (!s) return fallback
  // JSON-looking title (e.g. a serialised MapBody) — try to recover a real label.
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>
      const root = (parsed.root ?? parsed) as Record<string, unknown>
      const label = root.label ?? root.title ?? root.name ?? parsed.label ?? parsed.title ?? parsed.name
      s = typeof label === 'string' && label.trim() ? label.trim() : fallback
    } catch {
      s = fallback
    }
  }
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return fallback
  return s.length > 60 ? s.slice(0, 59).trimEnd() + '…' : s
}

// A concrete, grounded action the brief proposes and the user approves: block
// time for a real task. Computed deterministically from the task list, not by
// the model, so it never proposes work that doesn't exist.
export interface BriefAction {
  taskId: string
  title: string
  startMs: number
  durationMin: number
}

// Suggest time blocks for the most important tasks that are not already on the
// calendar. Slots them into tomorrow morning. Deterministic and grounded.
export function buildBriefActions(
  tasks: BriefTask[],
  scheduledTaskIds: Set<string>,
  nowMs: number,
  max = 3
): BriefAction[] {
  const candidates = tasks
    .filter((t) => t.id && !scheduledTaskIds.has(t.id) && t.status !== 'done')
    .sort((a, b) => b.importance - a.importance || a.priority - b.priority || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
    .slice(0, max)

  const base = new Date(nowMs)
  base.setDate(base.getDate() + 1)
  base.setHours(9, 0, 0, 0)
  const start = base.getTime()
  const slots = [
    { offsetMin: 0, durationMin: 90 },
    { offsetMin: 120, durationMin: 60 },
    { offsetMin: 240, durationMin: 60 }
  ]
  return candidates.map((t, i) => ({
    taskId: t.id as string,
    title: t.title,
    startMs: start + (slots[i]?.offsetMin ?? i * 120) * 60_000,
    durationMin: slots[i]?.durationMin ?? 60
  }))
}
export interface BriefBlock {
  title: string
  startMs: number
  durationMin: number
}
export interface BriefDoc {
  title: string
  docType: string
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// True when there is genuinely nothing to brief on, so the caller can answer
// honestly without a model call.
export function briefIsEmpty(tasks: BriefTask[], blocks: BriefBlock[], docs: BriefDoc[]): boolean {
  return tasks.length === 0 && blocks.length === 0 && docs.length === 0
}

export function buildBriefContext(
  tasks: BriefTask[],
  blocks: BriefBlock[],
  docs: BriefDoc[],
  nowMs: number
): string {
  const parts: string[] = [`Current date and time: ${fmtDate(nowMs)}.`]

  if (tasks.length) {
    const ranked = [...tasks]
      .sort((a, b) => b.importance - a.importance || a.priority - b.priority)
      .slice(0, 12)
    parts.push(
      'Open and in-progress tasks (most important first):\n' +
        ranked
          .map((t) => {
            const state = t.status === 'in_progress' ? 'in progress' : 'open'
            const due = t.dueDate ? `, due ${fmtDay(t.dueDate)}` : ''
            return `- [${state}] ${t.title} (importance ${t.importance}, priority ${t.priority}${due})`
          })
          .join('\n')
    )
  }

  if (blocks.length) {
    const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs).slice(0, 15)
    parts.push(
      'Scheduled time blocks (upcoming):\n' +
        sorted.map((b) => `- ${fmtDate(b.startMs)} — ${b.title} (${b.durationMin} min)`).join('\n')
    )
  }

  if (docs.length) {
    parts.push(
      'Recently worked-on documents:\n' + docs.slice(0, 8).map((d) => `- ${d.title || 'Untitled'} (${d.docType})`).join('\n')
    )
  }

  return parts.join('\n\n')
}
