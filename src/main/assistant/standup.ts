import type { WorkCompletedDigest } from './workCompleted'
import { buildBriefContext, briefIsEmpty, type BriefTask, type BriefBlock, type BriefDoc } from '../ai/dailyBriefContext'

// The daily "standup": one narrative that weaves the two halves of the assistant
// catch-up duo — Work-Completed (look BACK: what got done since last time) and the
// daily-brief context (look FORWARD: what's next). Operator decisions: personal
// scope by default (team toggle), a single AI narrative, run daily.
//
// This module is PURE (no DB, no model): it composes a deterministic, honest
// narrative from already-gathered pieces, and builds the prompt context the AI weave
// uses. The deterministic narrative is also the honest fallback when there's no AI
// key — so the standup never fabricates and always degrades to something real.

export interface StandupInput {
  workCompleted: WorkCompletedDigest
  // objectId -> human title, resolved by the caller (main has the node/doc stores).
  // Optional: without it the look-back uses counts only, never invented titles.
  completedTitles?: Record<string, string>
  tasks: BriefTask[]
  blocks: BriefBlock[]
  docs: BriefDoc[]
  nowMs: number
  // How to address the subject in the narrative: 'you' (personal) or e.g. 'the team'.
  subject?: string
}

export interface Standup {
  // True when there is genuinely something to say (done > 0 or a non-empty brief).
  hasContent: boolean
  // Deterministic, honest narrative — shown as-is when no AI key, or handed to the
  // AI weave as the ground truth to rephrase (never to add to).
  narrative: string
  // Compact two-part context for the AI weave to turn into one flowing narrative.
  promptContext: string
}

function titlesForCompleted(input: StandupInput, max: number): string[] {
  const map = input.completedTitles ?? {}
  const out: string[] = []
  for (const c of input.workCompleted.completed) {
    const t = (c.objectId && map[c.objectId]) || null
    if (t) out.push(t)
    if (out.length >= max) break
  }
  return out
}

function topTasks(tasks: BriefTask[], max: number): BriefTask[] {
  return [...tasks]
    .filter((t) => t.status !== 'done')
    .sort((a, b) => b.importance - a.importance || a.priority - b.priority || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
    .slice(0, max)
}

export function composeStandup(input: StandupInput): Standup {
  const subj = input.subject ?? 'you'
  const done = input.workCompleted.completed.length
  const briefEmpty = briefIsEmpty(input.tasks, input.blocks, input.docs)
  const hasContent = done > 0 || !briefEmpty

  // ── Deterministic narrative (honest fallback) ──
  const lookBack = (() => {
    if (done === 0) return `Nothing has been marked done since ${subj === 'you' ? 'you were' : 'they were'} last here.`
    const names = titlesForCompleted(input, 3)
    const extras = [
      input.workCompleted.createdCount ? `${input.workCompleted.createdCount} created` : '',
      input.workCompleted.updatedCount ? `${input.workCompleted.updatedCount} updated` : ''
    ].filter(Boolean)
    const base =
      `Since last time, ${subj} ${done === 1 ? 'completed 1 task' : `completed ${done} tasks`}` +
      (extras.length ? ` (also ${extras.join(', ')})` : '')
    return names.length ? `${base}: ${names.join(', ')}.` : `${base}.`
  })()

  const lookForward = (() => {
    const top = topTasks(input.tasks, 3)
    if (top.length === 0) return 'Nothing is currently due or in progress.'
    const items = top.map((t) => (t.dueDate ? `${t.title} (due ${new Date(t.dueDate).toLocaleDateString()})` : t.title))
    return `Next up: ${items.join('; ')}.`
  })()

  const narrative = hasContent
    ? `${lookBack} ${lookForward}`.trim()
    : `${subj === 'you' ? "You're" : "They're"} all caught up — nothing completed since last time and nothing due. A good moment to pick the one thing that would move the needle.`

  // ── Prompt context for the AI weave ──
  const backNames = titlesForCompleted(input, 8)
  const promptContext =
    'LOOK BACK — what actually got done (do not add anything not listed here):\n' +
    `${input.workCompleted.summaryLine}` +
    (backNames.length ? `\nCompleted: ${backNames.join('; ')}` : '') +
    '\n\nLOOK FORWARD — the current state to pick up from:\n' +
    buildBriefContext(input.tasks, input.blocks, input.docs, input.nowMs)

  return { hasContent, narrative, promptContext }
}
