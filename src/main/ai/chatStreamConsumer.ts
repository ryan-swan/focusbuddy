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
import { describeAction } from './actionLabel'
import type { ChatToolTrace } from '@shared/types'

export interface ChatStreamConsumerCallbacks {
  // Fires exactly once, when the envelope's reply field closes. The prose lands
  // whole rather than token-by-token: that gives "here comes the output"
  // without markdown re-layout thrashing on every delta.
  onReply: (replyText: string) => void
  // Fires once per action object as it completes, in arrival order.
  onTool: (tool: ChatToolTrace) => void
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
  let toolIndex = 0

  return {
    push(delta: string): void {
      scanner.push(delta)
      if (!replySeen) {
        const r = scanner.extractReply()
        if (r !== null) {
          replySeen = true
          cb.onReply(r)
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
