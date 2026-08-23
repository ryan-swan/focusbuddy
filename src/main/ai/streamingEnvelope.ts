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

// The envelope keys that may legitimately follow the reply string. Voice uses
// "proposals", chat uses "actions"; "question" and "blocks" sit between.
const AFTER_REPLY_KEYS = ['"actions"', '"proposals"', '"question"', '"blocks"']

// Decode a JSON string fragment that may carry the model's UNESCAPED quotes
// (AI-31). `JSON.parse('"…"')` throws on a bare quote, and the old fallback
// returned the raw slice — so the moment the model quoted something in its
// prose, the whole answer on screen flipped from decoded text to literal
// `\n` and `###` junk, every construct collapsed into one heading, and the
// renderer remounted the lot (Caleb: "formatted horribly… the screen flash
// with all of the population of text"). This walk is total: every escape
// decodes, a bare quote is kept as a quote, a torn or unknown escape stays
// literal. Shared by the live peek, the final extract, and chatJson's salvage
// so all three agree on what the reply says.
export function decodeReplyFragment(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c !== '\\') {
      out += c
      continue
    }
    const n = raw[i + 1]
    switch (n) {
      case 'n': out += '\n'; i++; break
      case 't': out += '\t'; i++; break
      case 'r': out += '\r'; i++; break
      case 'b': out += '\b'; i++; break
      case 'f': out += '\f'; i++; break
      case '"': out += '"'; i++; break
      case '\\': out += '\\'; i++; break
      case '/': out += '/'; i++; break
      case 'u': {
        const hex = raw.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 5
        } else {
          out += c
        }
        break
      }
      default:
        out += c
    }
  }
  return out
}

// What does an UNESCAPED quote inside the reply string mean? 'close' when the
// envelope genuinely continues after it (`,"actions":`, `,"question":`, or the
// closing brace), 'content' when it is prose the model forgot to escape, and
// 'unknown' when the buffer ends before the answer is knowable.
//
// This rule exists because long prose quotes things constantly and models drop
// the backslash: a real drive was cut mid-word at `a clearer "why"` — the raw
// quote closed the reply, the trace claimed the answer was written, and the
// final parse failed on the rest. Exported so chatJson's salvage applies the
// SAME rule and the live scanner and final parser can never disagree about
// where a reply ends. `atEnd` marks a finished text (no more input is coming):
// every ambiguity then resolves to 'close', because a stream that died at a
// quote leaves the identical body either way.
export function replyQuoteRole(
  buf: string,
  quoteAt: number,
  atEnd = false
): 'close' | 'content' | 'unknown' {
  const unknown = atEnd ? 'close' : 'unknown'
  let k = quoteAt + 1
  while (k < buf.length && /\s/.test(buf[k])) k++
  if (k >= buf.length) return unknown
  const c = buf[k]
  if (c === '}') {
    // The envelope's end — unless more content follows the brace, which makes
    // it a quote-then-brace inside the prose.
    let j = k + 1
    while (j < buf.length && /\s/.test(buf[j])) j++
    return j >= buf.length ? 'close' : 'content'
  }
  if (c !== ',') return 'content'
  let j = k + 1
  while (j < buf.length && /\s/.test(buf[j])) j++
  const rest = buf.slice(j)
  for (const key of AFTER_REPLY_KEYS) {
    if (rest.startsWith(key)) {
      const after = rest.slice(key.length).replace(/^\s*/, '')
      if (after === '') return unknown
      return after[0] === ':' ? 'close' : 'content'
    }
    // The key itself may still be streaming in ("," then `"act`).
    if (key.startsWith(rest)) return unknown
  }
  return 'content'
}

export class StreamingEnvelopeScanner {
  private buf = ''
  private replyEnd: number | null = null // index where the reply field's closing " sits
  private replyStart: number | null = null // index just past the reply field's opening "
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

  // The reply text as decoded SO FAR — growing while the string is still
  // streaming, complete once it has closed, null before the field opens.
  // Non-consuming and safe to call on every push: extractReply() remains the
  // one-shot "the reply landed" signal; this is the live view that makes
  // token-by-token prose possible.
  peekReply(): string | null {
    if (this.replyStart === null) {
      const m = this.buf.match(/"reply"\s*:\s*"/)
      if (!m || m.index === undefined) return null
      this.replyStart = m.index + m[0].length
    }
    const start = this.replyStart
    // Walk forward respecting escapes, stopping at the closing quote or the
    // buffer's end. `cut` is the last index that does NOT split an escape
    // sequence: a chunk boundary can land mid-`\uXXXX`, and decoding a torn
    // escape would either throw or show the user literal backslash junk.
    let i = start
    let cut = start
    while (i < this.buf.length) {
      const c = this.buf[i]
      if (c === '\\') {
        // \uXXXX is 6 chars, every other escape is 2. Only advance `cut`
        // past the sequence once the whole thing has arrived.
        const len = this.buf[i + 1] === 'u' ? 6 : 2
        if (i + len > this.buf.length) break
        i += len
        cut = i
        continue
      }
      if (c === '"') {
        const role = replyQuoteRole(this.buf, i)
        // 'close' ends the walk; 'unknown' holds the cut short of the quote
        // until more input decides. Either way, stop here for now.
        if (role !== 'content') break
        // Prose quote the model forgot to escape — it IS the reply.
        i += 1
        cut = i
        continue
      }
      i += 1
      cut = i
    }
    return decodeReplyFragment(this.buf.slice(start, cut))
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
        const role = replyQuoteRole(this.buf, i)
        // Not knowable yet — wait for the next push rather than closing the
        // reply mid-word on a quote the model forgot to escape.
        if (role === 'unknown') return null
        if (role === 'content') {
          i += 1
          continue
        }
        this.replyEnd = i
        return decodeReplyFragment(this.buf.slice(start, i))
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
