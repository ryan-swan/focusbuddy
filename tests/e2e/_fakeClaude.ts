import http from 'node:http'
import type { AddressInfo } from 'node:net'

// A stand-in for the Claude Messages API that streams a canned envelope at a
// realistic token cadence. Point the app at it with ANTHROPIC_BASE_URL and
// any ANTHROPIC_API_KEY, and the ENTIRE real streaming path runs — SDK,
// envelope scanner, IPC, store, renderer — with no model, no key, and
// deterministic output. This is what lets the AI lane judge the reveal the
// way Caleb sees it (token deltas, a bare quote, citations, a table, an
// action) without his keychain-bound key. Non-stream calls (title
// generation and the like) get a one-line text message.

export interface FakeClaudeOptions {
  // The exact text the "model" will stream — normally a JSON envelope
  // string such as JSON.stringify({ reply, actions }).
  text: string
  // Cadence: characters per delta and the pause between deltas.
  charsPerDelta?: number
  deltaMs?: number
  // Text returned by non-streaming calls.
  shortText?: string
}

export interface FakeClaude {
  url: string
  // Every streamed request's body, for assertions on what the app sent.
  requests: unknown[]
  close: () => Promise<void>
}

function sse(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function startFakeClaude(opts: FakeClaudeOptions): Promise<FakeClaude> {
  const charsPerDelta = opts.charsPerDelta ?? 9
  const deltaMs = opts.deltaMs ?? 30
  const requests: unknown[] = []
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.includes('/v1/messages')) {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let parsed: { stream?: boolean } = {}
      try {
        parsed = JSON.parse(body)
      } catch {
        /* ignore */
      }
      requests.push(parsed)
      if (!parsed.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            id: 'msg_fake_short',
            type: 'message',
            role: 'assistant',
            model: 'fake-claude',
            content: [{ type: 'text', text: opts.shortText ?? 'Launch options' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 3 }
          })
        )
        return
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      })
      sse(res, 'message_start', {
        type: 'message_start',
        message: {
          id: 'msg_fake_stream',
          type: 'message',
          role: 'assistant',
          model: 'fake-claude',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 120, output_tokens: 1 }
        }
      })
      sse(res, 'content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      })
      let at = 0
      const text = opts.text
      const step = (): void => {
        if (res.destroyed) return
        if (at >= text.length) {
          sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
          sse(res, 'message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: Math.ceil(text.length / 4) }
          })
          sse(res, 'message_stop', { type: 'message_stop' })
          res.end()
          return
        }
        const next = text.slice(at, at + charsPerDelta)
        at += charsPerDelta
        sse(res, 'content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: next }
        })
        setTimeout(step, deltaMs)
      }
      step()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
