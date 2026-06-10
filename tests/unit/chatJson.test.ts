import { describe, it, expect } from 'vitest'
import { extractJson, salvageEnvelope } from '../../src/main/ai/chatJson'

describe('extractJson', () => {
  it('returns the object slice for a well-formed envelope', () => {
    const s = '{"reply":"hi","actions":[]}'
    expect(extractJson(s)).toBe(s)
  })

  it('unwraps a markdown json fence', () => {
    const s = '```json\n{"reply":"hi","actions":[]}\n```'
    expect(extractJson(s)).toBe('{"reply":"hi","actions":[]}')
  })

  it('returns null when the closing brace is missing (truncated)', () => {
    // No closing brace at all — the old code path that produced the raw-JSON dump.
    expect(extractJson('{"reply":"hi","actions":[{"kind":"create-todo-list"')).toBeNull()
  })
})

describe('salvageEnvelope', () => {
  it('recovers complete actions from a truncated array and drops the partial tail', () => {
    // Mirrors the real bug: two complete actions, then a third cut off mid-cells.
    const truncated =
      '{"reply":"Here is your workspace.","actions":[' +
      '{"kind":"create-todo-list","title":"Gates","items":["a","b"],"reason":"r1"},' +
      '{"kind":"create-table","id":"tbl-assets","title":"Registry","columns":[{"label":"Asset","type":"text-short"}],"reason":"r2"},' +
      '{"kind":"add-table-row","tableId":"$tbl-assets","cells":{"Asset":"15-slide demo deck","Type":"Deck","Notes":"cut off here'

    const out = salvageEnvelope(truncated)
    expect(out).not.toBeNull()
    expect(out!.reply).toBe('Here is your workspace.')
    // The two complete actions survive; the truncated add-table-row is dropped.
    expect(out!.actions).toHaveLength(2)
    expect((out!.actions[0] as { kind: string }).kind).toBe('create-todo-list')
    expect((out!.actions[1] as { kind: string }).kind).toBe('create-table')
  })

  it('keeps nested braces and brackets balanced when scanning objects', () => {
    const truncated =
      '{"reply":"x","actions":[' +
      '{"kind":"create-table","columns":[{"label":"A","options":["x","y"]}]},' +
      '{"kind":"add-table-row","cells":{"A":{"nested":true}}},' +
      '{"kind":"create-widget","widgetKind":"sticky"' // cut off, unbalanced

    const out = salvageEnvelope(truncated)
    expect(out!.actions).toHaveLength(2)
  })

  it('returns null when there is not a single complete action', () => {
    const justOpened = '{"reply":"x","actions":[{"kind":"create-todo-list","items":["a"'
    expect(salvageEnvelope(justOpened)).toBeNull()
  })

  it('recovers exactly 3 complete actions from the exact bug payload shape: two create-todo-list, one create-table, then add-table-row cut off mid-cells', () => {
    // This is the verbatim payload shape that triggered the original bug.
    // Two complete create-todo-list actions, one complete create-table action,
    // then an add-table-row that was truncated mid-cells array. The salvage
    // must recover exactly 3 complete actions and drop the partial fourth.
    const bugPayload =
      '{"reply":"Here is your podcast launch workspace.","actions":[' +
      '{"kind":"create-todo-list","title":"Pre-launch checklist","items":["Record pilot episode","Buy domain","Submit to Apple Podcasts","Set up newsletter"],"reason":"tracks launch milestones"},' +
      '{"kind":"create-todo-list","title":"Episode backlog","items":["Intro to deep work","Managing interruptions","Listener Q&A 1"],"reason":"episode ideas to record"},' +
      '{"kind":"create-table","id":"tbl-episodes","title":"Episode tracker","columns":[{"label":"Title","type":"text-short"},{"label":"Status","type":"single-select","options":["Draft","Recorded","Live"]},{"label":"Publish date","type":"date"}],"reason":"track each episode"},' +
      '{"kind":"add-table-row","tableId":"$tbl-episodes","cells":{"Title":"Pilot","Status":"Draft","Publish date":"cut off here'
    // The add-table-row is intentionally not closed — it simulates the model
    // running out of tokens mid-JSON.

    const out = salvageEnvelope(bugPayload)
    expect(out).not.toBeNull()
    expect(out!.reply).toBe('Here is your podcast launch workspace.')
    expect(out!.actions).toHaveLength(3)
    expect((out!.actions[0] as { kind: string }).kind).toBe('create-todo-list')
    expect((out!.actions[1] as { kind: string }).kind).toBe('create-todo-list')
    expect((out!.actions[2] as { kind: string }).kind).toBe('create-table')
    // The partial add-table-row must NOT appear.
    const kinds = (out!.actions as Array<{ kind: string }>).map((a) => a.kind)
    expect(kinds).not.toContain('add-table-row')
  })

  it('handles a brace inside a string value without miscounting depth', () => {
    const truncated =
      '{"reply":"y","actions":[' +
      '{"kind":"create-widget","widgetKind":"note","content":"a } b ] c {"},' +
      '{"kind":"create-widget","widgetKind":"sticky","content":"tail' // cut off

    const out = salvageEnvelope(truncated)
    expect(out!.actions).toHaveLength(1)
    expect((out!.actions[0] as { content: string }).content).toBe('a } b ] c {')
  })
})
