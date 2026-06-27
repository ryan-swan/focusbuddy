import { describe, it, expect } from 'vitest'
import { describeProposal } from '../../src/renderer/src/lib/actionExecutor'
import type { ActionProposal } from '../../src/shared/types'

// describeProposal drives the approvable proposal card (icon + verb + subject).
// These cover the two ops that let the AI act on existing work rather than only
// creating canvas widgets.

describe('describeProposal: AI-acts-across-suite ops', () => {
  it('summarises a status change on an existing task', () => {
    const p: ActionProposal = {
      id: 'utask-0',
      kind: 'update-task',
      taskId: 'node-abc',
      label: 'Q3 brief',
      status: 'done'
    }
    const d = describeProposal(p)
    expect(d.verb).toBe('Update task')
    expect(d.icon).toBe('edit')
    expect(d.subject).toContain('Q3 brief')
    expect(d.subject).toContain('done')
  })

  it('summarises clearing a due date and a rename together', () => {
    const p: ActionProposal = {
      id: 'utask-1',
      kind: 'update-task',
      taskId: 'node-abc',
      label: 'Launch',
      title: 'Launch v2',
      dueDate: null
    }
    const d = describeProposal(p)
    expect(d.subject).toContain('rename to "Launch v2"')
    expect(d.subject).toContain('clear due date')
  })

  it('shows just the label when nothing specific changes are described', () => {
    const p: ActionProposal = {
      id: 'utask-2',
      kind: 'update-task',
      taskId: 'node-abc',
      label: 'Some task'
    }
    const d = describeProposal(p)
    expect(d.subject).toBe('Some task')
  })

  it('describes a PlexiBrain knowledge entry by its title', () => {
    const p: ActionProposal = {
      id: 'kb-0',
      kind: 'create-knowledge-entry',
      title: 'Brand voice rule',
      body: 'We write in first-person plural.'
    }
    const d = describeProposal(p)
    expect(d.verb).toBe('Add to PlexiBrain')
    expect(d.icon).toBe('psychology')
    expect(d.subject).toBe('Brand voice rule')
  })
})
