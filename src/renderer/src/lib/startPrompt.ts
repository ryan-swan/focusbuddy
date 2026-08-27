import type { FbNode } from '@shared/types'
import { queueOf } from './attentionQueues'
import { itemContext, parseTags, urgencyOf } from './itemTags'

// DEC-038 — "start it with Plexii": the bridge from a captured intent to the
// work itself.
//
// The operator's ask: "when it is time to focus on that item, the AI prompt to
// get started quick already exists based on the original intent and context
// capture" — and his ruling: it opens a PREFILLED CHAT. Staged in the
// composer, never sent: the assistant does not begin acting because you
// glanced at your queue. You read it, edit it, and press send.
//
// Everything in the prompt is already known — the capture, its class, its
// notes, its desk, its plan, its due date, its tags. Nothing is invented, no
// model call is made to build it, and it works with the key removed. That is
// the point: the queue holds the thinking, and this hands it over intact.

/** What each class actually asks the assistant FOR. The verb differs because
 *  the work differs — helping decide is not helping do. */
const ASK_BY_CLASS: Record<string, string> = {
  to_do: 'Help me get this done. Start with the first concrete step.',
  to_review:
    'Help me review this. Tell me what to look at first, what usually goes wrong, and what would make it a yes.',
  to_decide:
    'Help me decide this. Lay out the real options, what each one costs, and what you would pick — then say why.',
  to_respond: 'Help me respond. Draft something I can edit, in my voice, and keep it short.',
  to_meet: 'Help me set this up: who needs to be there, how long it needs, and an agenda worth the time.',
  to_discuss:
    'Help me prepare for this conversation: the points worth making, the likely pushback, and what a good outcome looks like.',
  to_remember: 'Help me develop this idea — is it worth pursuing, and what would the first move be?',
  to_know: 'Help me understand this and tell me whether it changes anything I should do.'
}

const line = (label: string, value: string | null | undefined): string | null =>
  value ? `${label}: ${value}` : null

/**
 * The prompt for ONE item. Facts first, then the ask, so the assistant reads
 * the context before the instruction.
 */
export function startPromptForItem(item: FbNode, nodesById: Map<string, FbNode>): string {
  const ctx = itemContext(item, nodesById)
  const cls = queueOf(item)
  const notes = (item.description ?? '').trim()
  const tags = parseTags(item.tags)
  const urg = urgencyOf(item)
  const due = item.dueAt
    ? new Date(item.dueAt).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      })
    : null

  const facts = [
    line('Where', ctx.desk?.title),
    line('Plan', ctx.plan?.title),
    line('Due', due),
    line('Urgency', urg),
    line('Tags', tags.length ? tags.join(', ') : null)
  ].filter(Boolean)

  const parts = [
    `I need to work on this: ${item.title.trim()}`,
    notes ? `\nWhat I captured about it:\n${notes}` : '',
    facts.length ? `\n${facts.join('\n')}` : '',
    `\n${ASK_BY_CLASS[cls] ?? ASK_BY_CLASS.to_do}`
  ]
  return parts.filter(Boolean).join('\n').trim()
}

/**
 * The prompt for SEVERAL items — the operator's "let Plexii do it for you"
 * over a multi-selection.
 *
 * One prompt covering all of them rather than N chats: the whole point of
 * selecting several is that they are related, and the assistant should see
 * them together. Their notes are deliberately NOT inlined — N paragraphs of
 * captured context would bury the list — so the ask is about sequencing and
 * starting, which is what a batch is actually for.
 */
export function startPromptForMany(items: FbNode[], nodesById: Map<string, FbNode>): string {
  if (items.length === 0) return ''
  if (items.length === 1) return startPromptForItem(items[0], nodesById)

  const rows = items.map((i) => {
    const ctx = itemContext(i, nodesById)
    const bits = [
      ctx.desk?.title,
      i.dueAt
        ? `due ${new Date(i.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : null,
      urgencyOf(i)
    ].filter(Boolean)
    return `- ${i.title.trim()}${bits.length ? ` (${bits.join(' · ')})` : ''}`
  })

  return [
    `I want to get moving on these ${items.length} items:`,
    '',
    ...rows,
    '',
    'Help me get started: what order would you do them in, what can be done right now,',
    'and what do you need from me for each one?'
  ].join('\n')
}
