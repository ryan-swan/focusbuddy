import { describe, it, expect } from 'vitest'
import { StreamingEnvelopeScanner } from '../../src/main/ai/streamingEnvelope'

// The scanner is what makes "watch the tools being prepared" honest: an object
// is handed over the moment its closing brace lands, and never before. These
// tests pin both halves of that contract — that a complete object comes out
// exactly once, and that a half-written one stays invisible until it finishes.
//
// Feeding the same envelope one character at a time is the adversarial case:
// every chunk boundary falls inside a token, so any state the scanner keeps
// across push() calls has to survive being interrupted everywhere.

// Drain everything the scanner can see right now — the same loop both callers run.
function drain(s: StreamingEnvelopeScanner): unknown[] {
  const out: unknown[] = []
  for (;;) {
    const next = s.nextItem()
    if (next === null) break
    out.push(next)
  }
  return out
}

// Push a whole string one character at a time, draining after each char. Returns
// every item emitted, in order, plus the reply if it landed.
function feedCharwise(
  text: string,
  arrayKey: string
): { items: unknown[]; reply: string | null } {
  const s = new StreamingEnvelopeScanner(arrayKey)
  const items: unknown[] = []
  let reply: string | null = null
  for (const ch of text) {
    s.push(ch)
    if (reply === null) reply = s.extractReply()
    items.push(...drain(s))
  }
  return { items, reply }
}

describe('StreamingEnvelopeScanner — array key parameterisation', () => {
  it('finds the "proposals" array (voice command envelope)', () => {
    const s = new StreamingEnvelopeScanner('proposals')
    s.push('{"reply":"ok","proposals":[{"kind":"create-task","title":"A"}]}')
    expect(drain(s)).toEqual([{ kind: 'create-task', title: 'A' }])
  })

  it('finds the "actions" array (chat envelope)', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"ok","actions":[{"kind":"compose-mail","subject":"Hi"}]}')
    expect(drain(s)).toEqual([{ kind: 'compose-mail', subject: 'Hi' }])
  })

  it('ignores an array under a different key', () => {
    // A chat-keyed scanner must not drain a voice-keyed envelope, or the two
    // surfaces would silently cross-feed each other's payloads.
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"ok","proposals":[{"kind":"create-task","title":"A"}]}')
    expect(drain(s)).toEqual([])
  })

  it('does not treat a regex-special key as a pattern', () => {
    // "a.c" must match the literal key, not "abc". A key that silently matched
    // the wrong field would drain the wrong array.
    const s = new StreamingEnvelopeScanner('a.c')
    s.push('{"abc":[{"wrong":1}],"a.c":[{"right":1}]}')
    expect(drain(s)).toEqual([{ right: 1 }])
  })
})

describe('StreamingEnvelopeScanner — extractReply', () => {
  it('returns null until the closing quote lands, then the decoded string', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"Here is ')
    expect(s.extractReply()).toBeNull()
    s.push('your answer')
    expect(s.extractReply()).toBeNull()
    s.push('","actions":[]}')
    expect(s.extractReply()).toBe('Here is your answer')
  })

  it('decodes JSON escapes rather than handing back the raw fragment', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"line one\\nline two — \\"quoted\\" and a backslash \\\\","actions":[]}')
    expect(s.extractReply()).toBe('line one\nline two — "quoted" and a backslash \\')
  })

  it('is not fooled by an escaped quote mid-reply', () => {
    // The naive scan stops at the first `"` and would truncate to `He said `.
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"He said \\"no\\" twice","actions":[]}')
    expect(s.extractReply()).toBe('He said "no" twice')
  })

  it('is not fooled by a trailing escaped backslash before the closing quote', () => {
    // `\\` must consume both chars so the following `"` is seen as the terminator.
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"path C:\\\\","actions":[]}')
    expect(s.extractReply()).toBe('path C:\\')
  })

  it('returns null on the second call — the caller emits a reply once', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"hi","actions":[]}')
    expect(s.extractReply()).toBe('hi')
    expect(s.extractReply()).toBeNull()
  })

  it('tolerates whitespace around the key and colon', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{\n  "reply" :  "spaced out",\n  "actions": []\n}')
    expect(s.extractReply()).toBe('spaced out')
  })
})

describe('StreamingEnvelopeScanner — nextItem', () => {
  it('emits nothing while an object is still being written', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","actions":[{"kind":"compose-mail","subject":"Rel')
    expect(drain(s)).toEqual([])
    s.push('ease update"}')
    expect(drain(s)).toEqual([{ kind: 'compose-mail', subject: 'Release update' }])
  })

  it('emits each complete object exactly once across repeated drains', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","actions":[{"n":1},{"n":2}')
    expect(drain(s)).toEqual([{ n: 1 }, { n: 2 }])
    // Nothing new has arrived — a second drain must not re-emit.
    expect(drain(s)).toEqual([])
    s.push(',{"n":3}]}')
    expect(drain(s)).toEqual([{ n: 3 }])
  })

  it('handles adjacent objects with no whitespace between them', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","actions":[{"n":1},{"n":2},{"n":3}]}')
    expect(drain(s)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('keeps nested braces and brackets balanced', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push(
      '{"reply":"x","actions":[' +
        '{"kind":"create-table","columns":[{"label":"Asset","type":"text-short"}],"meta":{"deep":{"deeper":[1,2]}}},' +
        '{"kind":"create-task","title":"after"}]}'
    )
    const items = drain(s) as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[0].kind).toBe('create-table')
    expect((items[0].meta as { deep: { deeper: number[] } }).deep.deeper).toEqual([1, 2])
    expect(items[1].kind).toBe('create-task')
  })

  it('does not let braces or brackets inside a string move the depth counter', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","actions":[{"body":"a } b ] c { d [ e"},{"n":2}]}')
    expect(drain(s)).toEqual([{ body: 'a } b ] c { d [ e' }, { n: 2 }])
  })

  it('does not let an escaped quote inside a string end it early', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","actions":[{"body":"he said \\"} not the end {\\" ok"}]}')
    expect(drain(s)).toEqual([{ body: 'he said "} not the end {" ok' }])
  })

  it('drops the truncated tail but keeps every object that finished', () => {
    // The real failure mode: the model runs out of output tokens mid-object.
    const s = new StreamingEnvelopeScanner('actions')
    s.push(
      '{"reply":"Here is your workspace.","actions":[' +
        '{"kind":"create-todo-list","title":"Gates"},' +
        '{"kind":"create-table","title":"Registry"},' +
        '{"kind":"add-table-row","cells":{"Asset":"cut off here'
    )
    const items = drain(s) as Array<{ kind: string }>
    expect(items.map((i) => i.kind)).toEqual(['create-todo-list', 'create-table'])
  })

  it('stops at the closing bracket and stays stopped', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","actions":[{"n":1}]}')
    expect(drain(s)).toEqual([{ n: 1 }])
    // Trailing envelope text must not be mistaken for more items.
    s.push('\n\nSome trailing prose the model added.')
    expect(drain(s)).toEqual([])
  })

  it('emits nothing for an empty array', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"nothing to do","actions":[]}')
    expect(drain(s)).toEqual([])
  })

  it('emits nothing when the array key never arrives', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"just prose"}')
    expect(drain(s)).toEqual([])
  })
})

describe('StreamingEnvelopeScanner — chunk boundaries', () => {
  it('survives a boundary at every single character', () => {
    // One char per push is the worst case: every key, every escape and every
    // brace is split. The result must be identical to the one-shot parse.
    const envelope =
      '{"reply":"Two things, \\"quoted\\" and split.","actions":[' +
      '{"kind":"compose-mail","to":["ryan@example.com"],"subject":"Release update","body":"line1\\nline2"},' +
      '{"kind":"create-doc","title":"Release update","sections":[{"heading":"H","body":"B"}]}' +
      ']}'
    const { items, reply } = feedCharwise(envelope, 'actions')
    expect(reply).toBe('Two things, "quoted" and split.')
    const kinds = (items as Array<{ kind: string }>).map((i) => i.kind)
    expect(kinds).toEqual(['compose-mail', 'create-doc'])
    expect(items[0]).toEqual(JSON.parse(JSON.stringify(JSON.parse(envelope).actions[0])))
    expect(items).toEqual(JSON.parse(envelope).actions)
  })

  it('survives a boundary that splits the array key itself', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","act')
    expect(drain(s)).toEqual([])
    s.push('ions":[{"n":1}]}')
    expect(drain(s)).toEqual([{ n: 1 }])
  })

  it('survives a boundary between the reply key and its value', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"re')
    expect(s.extractReply()).toBeNull()
    s.push('ply":')
    expect(s.extractReply()).toBeNull()
    s.push('"hello"}')
    expect(s.extractReply()).toBe('hello')
  })
})

describe('StreamingEnvelopeScanner — extractObjectField', () => {
  // The question envelope used throughout: reply, then question, then actions —
  // the key order the chat prompt mandates.
  const Q = '{ "prompt": "Which desk?", "options": ["Marketing", "A new desk"], "allowFreeText": true }'
  const ENVELOPE = `{"reply":"One thing first.","question":${Q},"actions":[]}`

  it('returns null until the object closes, then the parsed object, exactly once', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"One thing first.","question":{ "prompt": "Which desk?", "options": ["Marketing", "A new')
    s.extractReply()
    expect(s.extractObjectField('question')).toBeNull()
    s.push(' desk"], "allowFreeText": true }')
    expect(s.extractObjectField('question')).toEqual(JSON.parse(Q))
    // One-shot: the field has been handed over.
    expect(s.extractObjectField('question')).toBeNull()
  })

  it('survives a boundary at every single character', () => {
    const s = new StreamingEnvelopeScanner('actions')
    let reply: string | null = null
    let question: unknown | null = null
    for (const ch of ENVELOPE) {
      s.push(ch)
      if (reply === null) reply = s.extractReply()
      if (question === null) question = s.extractObjectField('question')
    }
    expect(reply).toBe('One thing first.')
    expect(question).toEqual(JSON.parse(Q))
  })

  it('does not scan before the reply has closed', () => {
    // Honesty constraint: the reply is prose and may spell the key. Nothing may
    // be extracted while the only place the key could live is inside it.
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"question":{"prompt":"early?","options":["a","b"]},"reply":"still open')
    expect(s.extractObjectField('question')).toBeNull()
  })

  it('is not fooled by the key spelled inside the reply prose', () => {
    // The reply QUOTES a question-shaped fragment. Emitting it would render a
    // question the model never asked — the exact class of invention the trace
    // work removed. Only the real post-reply field may come out.
    const s = new StreamingEnvelopeScanner('actions')
    s.push(
      '{"reply":"Write \\"question\\": {\\"prompt\\": \\"fake\\"} in your config.","question":' +
        Q +
        ',"actions":[]}'
    )
    expect(s.extractReply()).toBe('Write "question": {"prompt": "fake"} in your config.')
    expect(s.extractObjectField('question')).toEqual(JSON.parse(Q))
  })

  it('ignores a question spelled raw in a protocol-violating preamble', () => {
    // Models sometimes preface the envelope with prose despite the JSON-only
    // instruction. Outside a JSON string nothing is escaped, so the spelling
    // in the preamble matches the key pattern exactly — the post-reply guard
    // is what keeps it from being emitted as a question the model never asked.
    const s = new StreamingEnvelopeScanner('actions')
    s.push(
      'Sure — put "question": {"prompt": "fake", "options": ["a", "b"]} in your envelope, like this:\n' +
        `{"reply":"ok","question":${Q},"actions":[]}`
    )
    expect(s.extractReply()).toBe('ok')
    expect(s.extractObjectField('question')).toEqual(JSON.parse(Q))
    expect(s.extractObjectField('question')).toBeNull()
  })

  it('returns null forever when the field never arrives', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"no question here","actions":[{"n":1}]}')
    s.extractReply()
    expect(s.extractObjectField('question')).toBeNull()
    s.push('\n')
    expect(s.extractObjectField('question')).toBeNull()
  })

  it('keeps nested structures and brace-bearing strings balanced', () => {
    const nested =
      '{"prompt":"Pick { a } shape?","options":["curly } brace","square ] bracket"],"meta":{"deep":[1,2]}}'
    const s = new StreamingEnvelopeScanner('actions')
    s.push(`{"reply":"x","question":${nested},"actions":[]}`)
    s.extractReply()
    expect(s.extractObjectField('question')).toEqual(JSON.parse(nested))
  })

  it('a truncated object stays invisible', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","question":{"prompt":"cut off","options":["a"')
    s.extractReply()
    expect(s.extractObjectField('question')).toBeNull()
  })

  it('tracks different keys independently', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"x","question":{"a":1},"context":{"b":2},"actions":[]}')
    s.extractReply()
    expect(s.extractObjectField('question')).toEqual({ a: 1 })
    expect(s.extractObjectField('context')).toEqual({ b: 2 })
    expect(s.extractObjectField('question')).toBeNull()
  })
})

describe('StreamingEnvelopeScanner — fullText', () => {
  it('accumulates every chunk so the caller can run the whole-envelope parser', () => {
    // The streaming path still runs the proven whole-response parse at the end;
    // fullText() is what it parses.
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"a')
    s.push('b","actions":[]}')
    expect(s.fullText()).toBe('{"reply":"ab","actions":[]}')
  })
})

describe('unescaped quotes inside the reply (the A1 drive defect)', () => {
  // A real drive cut an answer mid-word at `a clearer "why"`: the model forgot
  // the backslashes, the raw quote closed the reply, and the parse failed on
  // everything after. The quote rule: a quote closes the reply ONLY when the
  // envelope genuinely continues after it.
  it('reads through a prose quote and closes at the real terminator', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"Send **fewer messages with a clearer "why"** and a sharper ask.","actions":[]}')
    expect(s.extractReply()).toBe('Send **fewer messages with a clearer "why"** and a sharper ask.')
  })

  it('peekReply streams through the prose quote without cutting mid-word', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"a clearer "wh')
    expect(s.peekReply()).toBe('a clearer "wh')
    s.push('y" matters","actions":[]}')
    expect(s.peekReply()).toBe('a clearer "why" matters')
  })

  it('still closes correctly on properly escaped quotes and finds the actions', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"a clearer \\"why\\" matters","actions":[{"kind":"create-task","title":"t"}]}')
    expect(s.extractReply()).toBe('a clearer "why" matters')
    expect(s.nextItem()).toEqual({ kind: 'create-task', title: 't' })
  })

  it('holds (returns null) when the closing context has not streamed yet', () => {
    const s = new StreamingEnvelopeScanner('actions')
    s.push('{"reply":"done."')
    expect(s.extractReply()).toBeNull()
    s.push(',"actions":[]}')
    expect(s.extractReply()).toBe('done.')
  })
})
