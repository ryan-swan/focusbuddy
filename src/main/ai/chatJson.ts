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

// Recover a truncated { "reply": ..., "question": {...}, "actions": [...] }
// envelope. When the model runs out of output tokens mid-array, the whole
// string will not parse, but each value that finished before the cutoff is
// still valid JSON. We read the reply string tolerantly, keep the optional
// question object only if it closed, then walk the actions array keeping every
// element that parses on its own and dropping the half-written tail. Returns
// null when there is neither one complete action nor a complete question.
export function salvageEnvelope(
  text: string
): { reply: string; actions: unknown[]; question?: unknown } | null {
  // reply — read the JSON string that follows "reply":
  let reply = ''
  // Where the reply's string value ended. The question search starts here so a
  // question SPELLED INSIDE the reply prose can never be salvaged as if the
  // model had asked it — same honesty constraint the streaming scanner applies.
  let replyEndIdx = 0
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
        replyEndIdx = i
        try {
          reply = JSON.parse(`"${body}"`) as string
        } catch {
          reply = ''
        }
      }
    }
  }

  // question — the optional object between reply and actions. Kept only when
  // it closed before the cutoff; a half-written question is dropped, the same
  // policy as a half-written action. The raw object is returned unvalidated —
  // the caller pipes it through the same sanitiser as the fully-parsed path.
  let question: unknown | undefined
  const qKey = text.indexOf('"question"', replyEndIdx)
  if (qKey >= 0) {
    const colon = text.indexOf(':', qKey)
    const braceAt = colon >= 0 ? text.indexOf('{', colon) : -1
    if (braceAt >= 0) {
      let depth = 0
      let inStr = false
      let esc = false
      for (let j = braceAt; j < text.length; j++) {
        const ch = text[j]
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
            try {
              question = JSON.parse(text.slice(braceAt, j + 1))
            } catch {
              /* balanced but unreadable — treat as absent */
            }
            break
          }
        }
      }
    }
  }

  // actions — find the array, then collect complete top-level objects. The
  // array can be missing entirely (the cutoff landed inside the key itself);
  // that no longer aborts the salvage, because a complete question above is a
  // recoverable result on its own.
  const actions: unknown[] = []
  const actKey = text.indexOf('"actions"')
  let i = actKey >= 0 ? text.indexOf('[', actKey) : -1
  if (i >= 0) i++ // step past '['
  while (i > 0 && i < text.length) {
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
  // A complete question is worth salvaging even with zero finished actions — a
  // turn that asks carries no actions by design, and dropping it would turn a
  // recoverable ask into an error bubble.
  if (actions.length === 0 && question === undefined) return null
  return question === undefined ? { reply, actions } : { reply, actions, question }
}
