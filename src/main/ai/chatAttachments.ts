// Render the live browser/doc/pdf text the user has on the canvas into a context
// block the model can act on — e.g. read a booking page and emit schedule-event
// proposals. Each attachment is capped and the whole block is bounded so a big
// page can't blow the context. Pure + unit-tested; no fabrication, only real
// gathered text goes in.

import type { ChatAttachment } from '@shared/types'

const PER = 8000
const TOTAL = 24000

export function renderAttachments(attachments: ChatAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return ''
  let used = 0
  const blocks: string[] = []
  for (const a of attachments) {
    const text = (a.text || '').trim()
    if (!text) continue
    const room = Math.min(PER, TOTAL - used)
    if (room <= 0) break
    const slice = text.slice(0, room)
    used += slice.length
    const src = a.source ? ` (${a.source})` : ''
    blocks.push(`--- ${a.kind}: "${a.title || 'Untitled'}"${src} ---\n${slice}`)
  }
  if (blocks.length === 0) return ''
  return (
    "\n\n## Content open on the user's canvas\n" +
    'The user may be asking you to act on the following live content from browser, document, or PDF widgets on their canvas. ' +
    'When they ask to create calendar events, schedule, or "add these to my calendar", extract the real dates, times, titles and durations from this content and emit schedule-event actions (absolute unix-ms startMs computed from the current-time fact; durationMinutes required; default 60 minutes when no end time is given). Do not invent details that are not present.\n\n' +
    blocks.join('\n\n')
  )
}
