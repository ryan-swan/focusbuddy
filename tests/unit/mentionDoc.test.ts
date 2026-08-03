import { describe, it, expect } from 'vitest'
import { docToInput, mentionToken, splitMentionText } from '../../src/renderer/src/lib/mentionDoc'
import type { MentionRef } from '../../src/renderer/src/lib/assistantMentions'

// Phase 4.3 serialisation, both directions. This is where plan P1's "two
// renderings of one set" is actually enforced:
//   docToInput      — the composer's document becomes the text that is sent
//   splitMentionText — a sent message re-grows its chips where they were typed
//
// The rule under test in the second direction: a chip appears ONLY where the
// reference's own token genuinely is. A transcript never grows a chip to match
// a reference whose words the user edited away before sending.

const ref = (p: Partial<MentionRef> = {}): MentionRef => ({
  kind: 'document',
  id: 'd1',
  title: 'Q3 brief',
  icon: 'description',
  taskId: null,
  conversationKey: 'c1',
  ...p
})

const mentionNode = (r: MentionRef): Record<string, unknown> => ({
  type: 'mention',
  attrs: {
    kind: r.kind,
    id: r.id,
    title: r.title,
    icon: r.icon,
    taskId: r.taskId ?? null,
    conversationKey: r.conversationKey
  }
})

const para = (...content: unknown[]): Record<string, unknown> => ({ type: 'paragraph', content })
const text = (t: string): Record<string, unknown> => ({ type: 'text', text: t })

describe('docToInput — the document becomes plain text plus the references in it', () => {
  it('writes a chip as a readable @Title inside the sentence', () => {
    const doc = { type: 'doc', content: [para(text('compare '), mentionNode(ref()), text(' with this'))] }
    const { text: out, refs } = docToInput(doc)
    expect(out).toBe('compare @Q3 brief with this')
    expect(refs).toHaveLength(1)
    expect(refs[0].id).toBe('d1')
  })

  it('keeps references in the order they appear', () => {
    const doc = {
      type: 'doc',
      content: [
        para(
          mentionNode(ref({ id: 'b', title: 'Beta' })),
          text(' then '),
          mentionNode(ref({ id: 'a', title: 'Alpha' }))
        )
      ]
    }
    expect(docToInput(doc).refs.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('collapses the same reference used twice into one entry, keeping both tokens in the text', () => {
    const doc = {
      type: 'doc',
      content: [para(mentionNode(ref()), text(' vs '), mentionNode(ref()))]
    }
    const { text: out, refs } = docToInput(doc)
    expect(refs).toHaveLength(1)
    expect(out).toBe('@Q3 brief vs @Q3 brief')
  })

  it('joins paragraphs with newlines, so ⇧↵ survives the round trip', () => {
    const doc = { type: 'doc', content: [para(text('first')), para(text('second'))] }
    expect(docToInput(doc).text).toBe('first\nsecond')
  })

  it('drops a malformed chip entirely rather than emitting a token with nothing behind it', () => {
    // A node with no id would read to the user (and the model) like a genuine
    // reference while carrying none — the exact shape of claim this whole
    // feature exists to prevent.
    const broken = { type: 'mention', attrs: { title: 'Ghost', kind: 'document' } }
    const doc = { type: 'doc', content: [para(text('see '), broken, text(' now'))] }
    const { text: out, refs } = docToInput(doc)
    expect(refs).toHaveLength(0)
    expect(out).toBe('see  now')
    expect(out).not.toContain('Ghost')
  })

  it('handles an empty or absent document without inventing content', () => {
    expect(docToInput({ type: 'doc', content: [] })).toEqual({ text: '', refs: [] })
    expect(docToInput(null)).toEqual({ text: '', refs: [] })
    expect(docToInput(undefined)).toEqual({ text: '', refs: [] })
  })

  it('does not leave a trailing newline from the final paragraph', () => {
    expect(docToInput({ type: 'doc', content: [para(text('hello'))] }).text).toBe('hello')
  })
})

describe('splitMentionText — a past turn re-grows its chips exactly where they were typed', () => {
  it('splits text around a reference token', () => {
    const segs = splitMentionText('compare @Q3 brief with this', [ref()])
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({ kind: 'text', text: 'compare ' })
    expect(segs[1].kind).toBe('mention')
    expect(segs[2]).toEqual({ kind: 'text', text: ' with this' })
  })

  it('does NOT chip a reference whose words are not in the message', () => {
    // The user removed the words before sending. The transcript shows what was
    // actually sent; it must not sprout a chip to match the reference list.
    const segs = splitMentionText('just answer normally', [ref()])
    expect(segs).toEqual([{ kind: 'text', text: 'just answer normally' }])
  })

  it('gives overlapping titles one claim each, longest first', () => {
    const short = ref({ id: 's', title: 'Q3' })
    const long = ref({ id: 'l', title: 'Q3 brief' })
    const segs = splitMentionText('read @Q3 brief and @Q3 too', [short, long])
    const chipped = segs.filter((s) => s.kind === 'mention')
    expect(chipped).toHaveLength(2)
    // The longer title claims the longer token, not the prefix inside it.
    expect((chipped[0] as { ref: MentionRef }).ref.id).toBe('l')
    expect((chipped[1] as { ref: MentionRef }).ref.id).toBe('s')
  })

  it('claims one occurrence per reference, leaving a repeated token as plain text', () => {
    const segs = splitMentionText('@Q3 brief and @Q3 brief', [ref()])
    expect(segs.filter((s) => s.kind === 'mention')).toHaveLength(1)
    const tail = segs[segs.length - 1]
    expect(tail.kind).toBe('text')
    expect((tail as { text: string }).text).toContain('@Q3 brief')
  })

  it('handles a message that is nothing but the reference', () => {
    const segs = splitMentionText('@Q3 brief', [ref()])
    expect(segs).toEqual([{ kind: 'mention', ref: ref() }])
  })

  it('returns the plain text unchanged when there are no references', () => {
    expect(splitMentionText('hello', [])).toEqual([{ kind: 'text', text: 'hello' }])
    expect(splitMentionText('', [ref()])).toEqual([])
  })

  it('ignores a reference with an empty title rather than matching a bare @', () => {
    // A bare "@" would otherwise claim the first at-sign in any sentence.
    const segs = splitMentionText('email me @ work', [ref({ title: '' })])
    expect(segs).toEqual([{ kind: 'text', text: 'email me @ work' }])
  })

  it('agrees with docToInput — what is written is what is read back', () => {
    const a = ref({ id: 'a', title: 'Alpha' })
    const b = ref({ id: 'b', title: 'Beta', kind: 'widget' })
    const doc = {
      type: 'doc',
      content: [para(text('compare '), mentionNode(a), text(' and '), mentionNode(b), text(' now'))]
    }
    const { text: out, refs } = docToInput(doc)
    const chipped = splitMentionText(out, refs).filter((s) => s.kind === 'mention')
    expect(chipped.map((s) => (s as { ref: MentionRef }).ref.id)).toEqual(['a', 'b'])
  })
})

describe('mentionToken — the on-the-wire spelling of a chip', () => {
  it('is the title behind an @, which is what the user typed and meant', () => {
    expect(mentionToken('Q3 brief')).toBe('@Q3 brief')
  })
})
