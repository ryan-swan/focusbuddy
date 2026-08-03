import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TrackChanges, InsertionMark, DeletionMark } from '../../src/renderer/src/components/documents/editor/TrackChanges'
import type { PmNode } from '../../src/renderer/src/lib/trackChanges'

// Drives the real Track Changes extension inside a headless Tiptap editor to prove
// the live capture works end to end: typed/inserted text is marked as an
// insertion, and accept/reject commands resolve the suggestions. Uses a minimal
// extension set (StarterKit + the track-changes marks) so the test stays free of
// the React NodeView extensions that need JSX transform.

function makeEditor(content: string): Editor {
  return new Editor({ extensions: [StarterKit, InsertionMark, DeletionMark, TrackChanges], content })
}

function marksInDoc(json: PmNode, name: string): number {
  let n = 0
  const walk = (node: PmNode): void => {
    if (node.type === 'text' && node.marks?.some((m) => m.type === name)) n++
    node.content?.forEach(walk)
  }
  walk(json)
  return n
}

function text(json: PmNode): string {
  if (json.type === 'text') return json.text ?? ''
  return (json.content ?? []).map(text).join('')
}

describe('TrackChanges extension (live capture)', () => {
  it('does not mark edits when suggesting is off', () => {
    const ed = makeEditor('<p>Hello</p>')
    ed.commands.insertContentAt(6, 'X') // after "Hello"
    expect(marksInDoc(ed.getJSON() as PmNode, 'insertion')).toBe(0)
    ed.destroy()
  })

  it('marks inserted text as an insertion when suggesting is on', () => {
    const ed = makeEditor('<p>Hello</p>')
    ed.commands.setTrackUser({ author: 'ana', color: '#16a34a' })
    ed.commands.setSuggesting(true)
    ed.commands.insertContentAt(6, ' there')
    const json = ed.getJSON() as PmNode
    expect(text(json)).toContain('Hello there')
    expect(marksInDoc(json, 'insertion')).toBeGreaterThan(0)
    ed.destroy()
  })

  it('acceptAllChanges keeps inserted text but drops the tracking mark', () => {
    const ed = makeEditor('<p>Hello</p>')
    ed.commands.setSuggesting(true)
    ed.commands.insertContentAt(6, ' world')
    expect(marksInDoc(ed.getJSON() as PmNode, 'insertion')).toBeGreaterThan(0)
    ed.commands.acceptAllChanges()
    const json = ed.getJSON() as PmNode
    expect(text(json)).toContain('Hello world')
    expect(marksInDoc(json, 'insertion')).toBe(0)
    ed.destroy()
  })

  it('rejectAllChanges removes the inserted (suggested) text', () => {
    const ed = makeEditor('<p>Hello</p>')
    ed.commands.setSuggesting(true)
    ed.commands.insertContentAt(6, ' world')
    ed.commands.rejectAllChanges()
    const json = ed.getJSON() as PmNode
    expect(text(json).replace(/\s+$/, '')).toBe('Hello')
    expect(marksInDoc(json, 'insertion')).toBe(0)
    ed.destroy()
  })

  it('tombstones a text deletion via the Backspace handler instead of removing it', () => {
    const ed = makeEditor('<p>Hello</p>')
    ed.commands.setSuggesting(true)
    // Put the cursor at the end and fire the extension's Backspace shortcut.
    ed.commands.setTextSelection(6)
    const handled = ed.view.someProp('handleKeyDown', (fn) =>
      fn!(ed.view, new KeyboardEvent('keydown', { key: 'Backspace' }))
    )
    expect(handled).toBe(true)
    const json = ed.getJSON() as PmNode
    // The character is struck (deletion mark), not gone.
    expect(text(json)).toBe('Hello')
    expect(marksInDoc(json, 'deletion')).toBeGreaterThan(0)
    // Accepting the deletion realises it: the last char is removed.
    ed.commands.acceptAllChanges()
    expect(text(ed.getJSON() as PmNode)).toBe('Hell')
    ed.destroy()
  })
})
