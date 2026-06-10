// Pure string helpers for reading the model's { "reply": ..., "actions": [...] }
// chat envelope. Kept free of any DB or Electron imports so the truncation
// recovery logic can be unit tested in isolation (anthropic.ts pulls in the
// SQLite layer and can't load under vitest).

export function extractJson(text: string): string | null {
  // Allow Claude to wrap in markdown ```json ... ``` or just return raw JSON.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence) return fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return null
}

// Recover a truncated { "reply": ..., "actions": [...] } envelope. When the
// model runs out of output tokens mid-array, the whole string will not parse,
// but each action object that finished before the cutoff is still valid JSON.
// We read the reply string tolerantly, then walk the actions array keeping
// every element that parses on its own and dropping the half-written tail.
// Returns null when there is not even one complete action to salvage.
export function salvageEnvelope(text: string): { reply: string; actions: unknown[] } | null {
  // reply — read the JSON string that follows "reply":
  let reply = ''
  const replyKey = text.indexOf('"reply"')
  if (replyKey >= 0) {
    let i = text.indexOf(':', replyKey)
    if (i >= 0) {
      i++
      while (i < text.length && text[i] !== '"') i++
      if (text[i] === '"') {
        i++
        let body = ''
        let esc = false
        for (; i < text.length; i++) {
          const ch = text[i]
          if (esc) {
            body += ch
            esc = false
            continue
          }
          if (ch === '\\') {
            body += ch
            esc = true
            continue
          }
          if (ch === '"') break
          body += ch
        }
        try {
          reply = JSON.parse(`"${body}"`) as string
        } catch {
          reply = ''
        }
      }
    }
  }

  // actions — find the array, then collect complete top-level objects.
  const actKey = text.indexOf('"actions"')
  if (actKey < 0) return null
  let i = text.indexOf('[', actKey)
  if (i < 0) return null
  i++ // step past '['
  const actions: unknown[] = []
  while (i < text.length) {
    while (i < text.length && ' \n\r\t,'.includes(text[i])) i++
    if (i >= text.length || text[i] === ']') break
    if (text[i] !== '{') break
    const objStart = i
    let depth = 0
    let inStr = false
    let esc = false
    let closed = false
    for (; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0) {
          i++
          closed = true
          break
        }
      }
    }
    if (!closed) break // truncated object — stop here
    try {
      actions.push(JSON.parse(text.slice(objStart, i)))
    } catch {
      // a malformed complete-looking object — skip it but keep going
    }
  }
  if (actions.length === 0) return null
  return { reply, actions }
}
