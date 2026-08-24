import { describe, it, expect } from 'vitest'
import { parseChatJson } from '../../src/main/ai/anthropic'

// A6/B3b — the chat door: the model can offer a supervised browsing run as
// an agent-browse card (R5: the card acts). The parser accepts only a real
// task, caps it, and keeps the start URL only when it is a genuine http(s)
// address — the run's own sanitiser re-checks everything at act time.
describe('parseChatJson - agent-browse proposals', () => {
  it('parses an agent-browse action into a proposal', () => {
    const raw = JSON.stringify({
      reply: 'I can do that on the site for you.',
      actions: [
        {
          kind: 'agent-browse',
          task: 'Search the venue site for availability on June 12 and open the booking page',
          url: 'https://example.com/venues',
          reason: 'multi-step site interaction'
        }
      ]
    })
    const { proposals } = parseChatJson(raw)
    const browse = proposals.find((p) => p.kind === 'agent-browse')
    expect(browse).toBeTruthy()
    expect(browse && browse.kind === 'agent-browse' && browse.task).toContain('June 12')
    expect(browse && browse.kind === 'agent-browse' && browse.url).toBe('https://example.com/venues')
  })

  it('drops an agent-browse with no task', () => {
    const raw = JSON.stringify({ reply: '', actions: [{ kind: 'agent-browse', url: 'https://x.com' }] })
    expect(parseChatJson(raw).proposals.some((p) => p.kind === 'agent-browse')).toBe(false)
  })

  it('discards a non-http url but keeps the task', () => {
    const raw = JSON.stringify({
      reply: '',
      actions: [{ kind: 'agent-browse', task: 'Do the thing', url: 'javascript:alert(1)' }]
    })
    const browse = parseChatJson(raw).proposals.find((p) => p.kind === 'agent-browse')
    expect(browse).toBeTruthy()
    expect(browse && browse.kind === 'agent-browse' && browse.url).toBeUndefined()
  })

  it('caps a runaway task at 500 characters', () => {
    const raw = JSON.stringify({
      reply: '',
      actions: [{ kind: 'agent-browse', task: 'x'.repeat(2000) }]
    })
    const browse = parseChatJson(raw).proposals.find((p) => p.kind === 'agent-browse')
    expect(browse && browse.kind === 'agent-browse' && browse.task.length).toBe(500)
  })
})
