// Pure assembly of the real environment state into a compact context block for
// the Daily Brief. Kept side-effect free so it is unit-tested directly. Nothing
// is invented: empty inputs produce an honestly empty context, and the caller
// short-circuits to a "your day is clear" message rather than asking the model
// to hallucinate a plan.

export interface BriefTask {
  title: string
  status: string
  priority: number
  importance: number
  dueDate: number | null
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
