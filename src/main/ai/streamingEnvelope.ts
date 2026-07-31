// Incremental scanner for the model's { "reply": …, "<items>": [ … ] } envelope.
//
// Both AI surfaces that stream ask Claude for the same shape — a reply string
// plus an array of objects — but they disagree on the array's key: the voice
// command uses "proposals", chat uses "actions". This is that scanner, lifted
// out of voiceCommand.ts and parameterised on the key so one implementation
// serves both. It is what makes "watch the tools being prepared" possible:
// each object is carved out and handed over the moment its closing brace
// lands, rather than after the whole response arrives.
//
// Deliberately dependency-free (no Electron, no DB, no SDK) so it unit-tests in
// isolation — the same reason chatJson.ts is its own module.
//
// The scanner does NOT validate. It returns raw parsed objects; the caller
// pipes them through its own sanitiser before doing anything with them.

// Escape a key for safe interpolation into the locator regexes. Keys are
// literals in our own source today, but a scanner that silently mis-locates its
// array on a key containing regex syntax is a trap worth closing at the door.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class StreamingEnvelopeScanner {
  private buf = ''
  private replyEnd: number | null = null // index where the reply field's closing " sits
  private itemsArrayStart: number | null = null
  // Position the next-extract scan starts at (cursor advances as we emit each
  // completed object).
  private scanFrom = 0
  // One-shot extraction state per named top-level object field ("question").
  // searchFrom advances past false matches so a key spelled inside a later
  // string can't permanently jam the real field's discovery.
  private objectFields = new Map<string, { searchFrom: number; emitted: boolean }>()
  private readonly arrayPattern: RegExp

  // `arrayKey` is the envelope's array field — "proposals" for voice commands,
  // "actions" for chat. Kept as a compiled pattern rather than a retained field:
  // nothing downstream needs the raw key back.
  constructor(arrayKey: string) {
    this.arrayPattern = new RegExp(`"${escapeRegExp(arrayKey)}"\\s*:\\s*\\[`)
  }

  push(chunk: string): void {
    this.buf += chunk
  }

  fullText(): string {
    return this.buf
  }

  extractReply(): string | null {
    if (this.replyEnd !== null) {
      // Already emitted — caller shouldn't call us again, but guard.
      return null
    }
    // Look for `"reply"\s*:\s*"` then walk forward respecting escapes
    // until the closing quote.
    const m = this.buf.match(/"reply"\s*:\s*"/)
    if (!m || m.index === undefined) return null
    const start = m.index + m[0].length
    let i = start
    while (i < this.buf.length) {
      const c = this.buf[i]
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === '"') {
        this.replyEnd = i
        // Decode the JSON string fragment by reparsing it within a tiny envelope.
        try {
          const json = `"${this.buf.slice(start, i)}"`
          return JSON.parse(json) as string
        } catch {
          return this.buf.slice(start, i)
        }
      }
      i += 1
    }
    return null
  }

  // Carve out a complete `"<key>": { … }` top-level object field the moment its
  // closing brace lands. One-shot per key: after the object has been returned
  // once, further calls return null.
  //
  // Scanning deliberately starts only AFTER the reply string has closed. The
  // reply is prose and can quote the key's spelling (…say `"question": {…}` in
  // your config…) — a match inside that string would emit a question the model
  // never asked, which is exactly the class of invention this surface exists to
  // avoid. The envelope's mandated key order (reply, question, actions) makes
  // post-reply the earliest honest place to look.
  extractObjectField(key: string): unknown | null {
    if (this.replyEnd === null) return null
    let st = this.objectFields.get(key)
    if (!st) {
      st = { searchFrom: this.replyEnd, emitted: false }
      this.objectFields.set(key, st)
    }
    if (st.emitted) return null
    const m = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*\\{`).exec(this.buf.slice(st.searchFrom))
    if (!m) return null
    // Walk from the opening brace maintaining depth + string state, same
    // discipline as nextItem().
    const braceAt = st.searchFrom + m.index + m[0].length - 1
    let depth = 0
    let inString = false
    let escape = false
    for (let j = braceAt; j < this.buf.length; j++) {
      const c = this.buf[j]
      if (escape) {
        escape = false
        continue
      }
      if (inString) {
        if (c === '\\') escape = true
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') {
        inString = true
      } else if (c === '{' || c === '[') {
        depth += 1
      } else if (c === '}' || c === ']') {
        depth -= 1
        if (depth === 0) {
          try {
            const parsed: unknown = JSON.parse(this.buf.slice(braceAt, j + 1))
            st.emitted = true
            return parsed
          } catch {
            // Balanced but unparseable — a false match (the key's spelling
            // inside some later string). Skip past it and keep looking.
            st.searchFrom = braceAt + 1
            return null
          }
        }
      }
    }
    // Object not complete yet — leave searchFrom alone so the next push
    // finds the same opening brace with more of the object behind it.
    return null
  }

  // Carve out the next complete object inside the envelope's array. Returns
  // null when there isn't one yet (or the array has ended) — the caller drains
  // in a loop until null, then waits for the next chunk.
  nextItem(): unknown | null {
    // Locate the array if we haven't already.
    if (this.itemsArrayStart === null) {
      const m = this.buf.match(this.arrayPattern)
      if (!m || m.index === undefined) return null
      this.itemsArrayStart = m.index + m[0].length
      this.scanFrom = this.itemsArrayStart
    }
    // Scan from scanFrom looking for a complete top-level object.
    // Skip whitespace / commas between objects.
    let i = this.scanFrom
    while (i < this.buf.length && /[\s,]/.test(this.buf[i])) i += 1
    if (i >= this.buf.length) {
      this.scanFrom = i
      return null
    }
    if (this.buf[i] === ']') {
      // End of the array — nothing more to find.
      this.scanFrom = i
      return null
    }
    if (this.buf[i] !== '{') {
      // Junk before the next object — skip a char and try again next push.
      this.scanFrom = i + 1
      return null
    }
    // We're at the start of an object. Walk forward maintaining brace +
    // bracket depth + string-literal state until depth returns to 0.
    let depth = 0
    let inString = false
    let escape = false
    let j = i
    while (j < this.buf.length) {
      const c = this.buf[j]
      if (escape) {
        escape = false
        j += 1
        continue
      }
      if (inString) {
        if (c === '\\') escape = true
        else if (c === '"') inString = false
        j += 1
        continue
      }
      if (c === '"') {
        inString = true
      } else if (c === '{' || c === '[') {
        depth += 1
      } else if (c === '}' || c === ']') {
        depth -= 1
        if (depth === 0) {
          // Completed object spans i..j inclusive.
          const slice = this.buf.slice(i, j + 1)
          this.scanFrom = j + 1
          try {
            return JSON.parse(slice)
          } catch {
            return null
          }
        }
      }
      j += 1
    }
    // Object not yet complete — don't advance scanFrom past i so the
    // next push() finds it again.
    this.scanFrom = i
    return null
  }
}
