// The delta → trace-event loop: the piece that turns a stream of text chunks
// into "the reply landed" and "an action finished being written".
//
// It lives in its own dependency-free module rather than inline in
// sendChatStream for one reason: anthropic.ts pulls in the SQLite layer and
// cannot load under vitest, and this loop is the only part of the streaming
// path with real logic in it. Extracted here, it is tested directly — including
// the case that matters most, where the chunk boundaries fall in the worst
// possible places. What stays behind in sendChatStream is thin glue: build the
// request, open the stream, feed it here, parse the accumulated text.
//
// The consumer is deliberately dumb about meaning. It reports what the model
// finished writing, in the order it finished writing it, and nothing else.

import { StreamingEnvelopeScanner } from './streamingEnvelope'
import { describeAction, describeActivity } from './actionLabel'
import { validateChatQuestion } from './chatQuestion'
import type { ChatQuestion, ChatToolTrace } from '@shared/types'

export interface ChatStreamConsumerCallbacks {
  // Fires exactly once, when the envelope's reply field closes. The prose lands
  // whole rather than token-by-token: that gives "here comes the output"
  // without markdown re-layout thrashing on every delta.
  onReply: (replyText: string) => void
  // Fires once per action object as it completes, in arrival order.
  onTool: (tool: ChatToolTrace) => void
  // Fires once per action object as it STARTS arriving — the moment its
  // `"kind"` lands, long before the object closes. This is what lets the UI
  // say "Generating a document…" during the longest write instead of sitting
  // on a generic spinner. index lines up with the onTool that will follow.
  onActivity?: (activity: ChatToolTrace) => void
  // Fires at most once, when the envelope's optional question object closes —
  // after the reply, before any tools that would follow it (per the envelope's
  // key order, a turn that asks should carry no actions at all). Only a
  // question that survives validation is reported: emitting junk would be a
  // claim the model asked something it didn't.
  onQuestion?: (question: ChatQuestion) => void
}

export interface ChatStreamConsumer {
  push(delta: string): void
  // Everything received so far, for the whole-envelope parse at the end.
  text(): string
  // True once the reply field has closed and been reported.
  replyEmitted(): boolean
  // How many actions have been reported.
  toolCount(): number
}

export function createChatStreamConsumer(
  cb: ChatStreamConsumerCallbacks
): ChatStreamConsumer {
  const scanner = new StreamingEnvelopeScanner('actions')
  let replySeen = false
  let questionArrived = false
  let toolIndex = 0
  let activityAnnounced = 0

  // In-progress peek: count `"kind": "…"` occurrences past the actions-array
  // marker in the accumulated text and announce each new one the moment it
  // lands. Scanning only after `"actions"` keeps reply/question prose (which
  // could legitimately contain the words) from producing phantom activity.
  const KIND_RE = /"kind"\s*:\s*"([a-z0-9-]+)"/g
  const announceActivity = (): void => {
    if (!cb.onActivity) return
    const full = scanner.fullText()
    const arrayAt = full.lastIndexOf('"actions"')
    if (arrayAt < 0) return
    const tail = full.slice(arrayAt)
    const kinds: string[] = []
    for (const m of tail.matchAll(KIND_RE)) kinds.push(m[1])
    while (activityAnnounced < kinds.length) {
      const kind = kinds[activityAnnounced]
      cb.onActivity({ index: activityAnnounced, kind, label: describeActivity(kind) })
      activityAnnounced++
    }
  }

  return {
    push(delta: string): void {
      scanner.push(delta)
      announceActivity()
      if (!replySeen) {
        const r = scanner.extractReply()
        if (r !== null) {
          replySeen = true
          cb.onReply(r)
        }
      }
      // The optional question object. The scanner is one-shot per key; the
      // local flag just skips the regex work once the field has arrived.
      if (!questionArrived && cb.onQuestion) {
        const rawQuestion = scanner.extractObjectField('question')
        if (rawQuestion !== null) {
          questionArrived = true
          const q = validateChatQuestion(rawQuestion)
          if (q) cb.onQuestion(q)
        }
      }
      // Drain every action object that has finished arriving. Objects the
      // scanner cannot make sense of are skipped rather than reported: a trace
      // line for junk would be a claim about work that isn't happening.
      for (;;) {
        const next = scanner.nextItem()
        if (next === null) break
        const described = describeAction(next)
        if (described) {
          cb.onTool({ index: toolIndex++, kind: described.kind, label: described.label })
        }
      }
    },
    text(): string {
      return scanner.fullText()
    },
    replyEmitted(): boolean {
      return replySeen
    },
    toolCount(): number {
      return toolIndex
    }
  }
}
