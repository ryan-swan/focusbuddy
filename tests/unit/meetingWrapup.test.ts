import { describe, it, expect } from 'vitest'
import { transcriptToDocBody } from '../../src/renderer/src/lib/meetingWrapup'

// The transcript is saved as a real document, so its plain text must become a
// valid ProseMirror/Tiptap doc body: one paragraph per line, blanks preserved.
describe('transcriptToDocBody', () => {
  it('wraps each non-empty line in a paragraph with a text node', () => {
    const body = transcriptToDocBody('Hello there\nSecond line')
    expect(body.type).toBe('doc')
    expect(body.content).toHaveLength(2)
    expect(body.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] })
  })

  it('preserves blank lines as empty paragraphs', () => {
    const body = transcriptToDocBody('a\n\nb')
    expect(body.content).toHaveLength(3)
    expect(body.content[1]).toEqual({ type: 'paragraph' })
  })

  it('never produces an empty doc (empty input yields one empty paragraph)', () => {
    const body = transcriptToDocBody('')
    expect(body.content).toHaveLength(1)
    expect(body.content[0]).toEqual({ type: 'paragraph' })
  })
})
