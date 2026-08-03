import { describe, it, expect } from 'vitest'
import { describeAction, recipientName } from '../../src/main/ai/actionLabel'

// These labels are the only thing the trace says about an action, and they are
// read off the RAW model output before sanitisation. Two properties matter:
// a label never claims a detail the object doesn't carry, and junk never
// produces a line at all.

describe('describeAction — the shapes the trace shows', () => {
  it('names an email by who it is going to', () => {
    expect(
      describeAction({ kind: 'compose-mail', to: ['ryan@acme.com'], subject: 'Release update' })
    ).toEqual({ kind: 'compose-mail', label: 'Email draft → Ryan' })
  })

  it('counts the extra recipients rather than listing them', () => {
    expect(
      describeAction({ kind: 'compose-mail', to: ['ryan@acme.com', 'dana@acme.com', 'sam@acme.com'] })
        ?.label
    ).toBe('Email draft → Ryan +2')
  })

  it('falls back to the subject when an email has no recipient yet', () => {
    // Mid-stream the model may have written the subject but not the to[] array.
    expect(describeAction({ kind: 'compose-mail', subject: 'Release update' })?.label).toBe(
      'Email draft → Release update'
    )
  })

  it('names a document, table or task by its title', () => {
    expect(describeAction({ kind: 'create-page', title: 'Release update' })?.label).toBe(
      'Page — Release update'
    )
    expect(describeAction({ kind: 'create-table', title: 'Prospects' })?.label).toBe(
      'Table — Prospects'
    )
    expect(describeAction({ kind: 'create-task', title: 'Ship the updater' })?.label).toBe(
      'Task — Ship the updater'
    )
  })

  it('names a calendar event by its title', () => {
    expect(
      describeAction({ kind: 'schedule-event', title: 'Standup', startMs: 1, durationMinutes: 15 })
        ?.label
    ).toBe('Calendar event — Standup')
  })

  it('names a wire by both ends', () => {
    expect(
      describeAction({
        kind: 'link-widgets',
        sourceLabel: 'Prospects',
        targetLabel: 'Research agent'
      })?.label
    ).toBe('Wire — Prospects → Research agent')
  })

  it('names a chat post by its conversation label, not its raw id', () => {
    expect(
      describeAction({ kind: 'post-chat', conversationId: 'c-8812', conversationLabel: '#launch' })
        ?.label
    ).toBe('Message → #launch')
  })

  it('strips the $ from a table-row reference so it reads as a name', () => {
    expect(describeAction({ kind: 'add-table-row', tableId: '$tbl-prospects' })?.label).toBe(
      'Table row — tbl-prospects'
    )
  })

  it('falls back to the bare kind title when there is nothing to name', () => {
    // Honest under-description: no title yet means the trace says only what it knows.
    expect(describeAction({ kind: 'create-todo-list' })?.label).toBe('To-do list')
    expect(describeAction({ kind: 'start-focus-session' })?.label).toBe('Focus session')
  })

  it('humanises a kind it has no title for instead of going silent', () => {
    expect(describeAction({ kind: 'summon-dragon', title: 'Smaug' })).toEqual({
      kind: 'summon-dragon',
      label: 'Summon dragon — Smaug'
    })
  })

  it('truncates a runaway label so one action cannot take over the trace', () => {
    const long = describeAction({ kind: 'create-page', title: 'x'.repeat(500) })
    expect(long).not.toBeNull()
    expect(long!.label.length).toBeLessThanOrEqual(90)
    expect(long!.label.endsWith('…')).toBe(true)
  })
})

describe('describeAction — what must not produce a line', () => {
  it('returns null for anything that is not an object with a kind', () => {
    expect(describeAction(null)).toBeNull()
    expect(describeAction(undefined)).toBeNull()
    expect(describeAction('compose-mail')).toBeNull()
    expect(describeAction(42)).toBeNull()
    expect(describeAction([{ kind: 'create-task' }])).toBeNull()
    expect(describeAction({})).toBeNull()
    expect(describeAction({ kind: '' })).toBeNull()
    expect(describeAction({ kind: '   ' })).toBeNull()
    expect(describeAction({ kind: 123 })).toBeNull()
  })

  it('ignores non-string entries in an email recipient list', () => {
    // The model occasionally emits a half-written array; a null in it must not
    // become "Email draft → null".
    const out = describeAction({ kind: 'compose-mail', to: [null, 5, 'ryan@acme.com'] })
    expect(out?.label).toBe('Email draft → Ryan')
  })
})

describe('recipientName', () => {
  it('prefers a display name over the address', () => {
    expect(recipientName('Ryan Chen <ryan@acme.com>')).toBe('Ryan Chen')
    expect(recipientName('"Ryan Chen" <ryan@acme.com>')).toBe('Ryan Chen')
  })

  it('takes the first name out of a structured local part', () => {
    expect(recipientName('ryan@acme.com')).toBe('Ryan')
    expect(recipientName('ryan.chen@acme.com')).toBe('Ryan')
    expect(recipientName('ryan_chen@acme.com')).toBe('Ryan')
    expect(recipientName('ryan-chen@acme.com')).toBe('Ryan')
  })

  it('hands back what it was given when there is nothing to shorten', () => {
    expect(recipientName('team')).toBe('Team')
    expect(recipientName('  ')).toBe('')
  })
})
