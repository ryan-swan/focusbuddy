import { describe, it, expect, beforeEach } from 'vitest'
import {
  linkTargetForApplied,
  TURN_INTO_DESK_MESSAGE,
  PUSH_TO_DESK_MESSAGE
} from '../../src/renderer/src/lib/conversationDesks'
import { useChatStore } from '../../src/renderer/src/stores/chat'
import type { AiChatConversationMeta, AppliedProposal } from '../../src/shared/types'

// Conversation↔desk linking (Plexii P5): only desks the conversation PRODUCES
// link; element 0 is the primary; linking is idempotent and make-primary
// reorders without duplicating.

function applied(target: AppliedProposal['target']): AppliedProposal {
  return { message: 'ok', target, appliedAt: 1 }
}

describe('linkTargetForApplied', () => {
  it('links the desk a create-task produced', () => {
    expect(
      linkTargetForApplied('create-task', applied({ kind: 'task', id: 'desk-1', label: 'Plan' }))
    ).toBe('desk-1')
  })

  it('links nothing for updates, navigation, widgets, or targetless applies', () => {
    expect(linkTargetForApplied('update-task', applied({ kind: 'task', id: 'desk-1' }))).toBe(null)
    expect(linkTargetForApplied('navigate-to', applied({ kind: 'task', id: 'desk-1' }))).toBe(null)
    expect(linkTargetForApplied('create-widget', applied({ kind: 'widget', id: 'w1' }))).toBe(null)
    expect(linkTargetForApplied('create-task', applied(null))).toBe(null)
    expect(linkTargetForApplied(undefined, applied({ kind: 'task', id: 'desk-1' }))).toBe(null)
  })
})

describe('chat store linkDesk (in-memory path)', () => {
  const meta = (linkedDesks: string[]): AiChatConversationMeta => ({
    id: 'conv-1',
    taskId: null,
    title: 'T',
    createdAt: 1,
    updatedAt: 1,
    linkedDesks
  })

  beforeEach(() => {
    useChatStore.setState({ conversations: [meta([])] })
  })

  it('appends new desks in order, first one primary', async () => {
    await useChatStore.getState().linkDesk('conv-1', 'a')
    await useChatStore.getState().linkDesk('conv-1', 'b')
    expect(useChatStore.getState().conversations[0].linkedDesks).toEqual(['a', 'b'])
  })

  it('is idempotent for an already-linked desk', async () => {
    await useChatStore.getState().linkDesk('conv-1', 'a')
    await useChatStore.getState().linkDesk('conv-1', 'a')
    expect(useChatStore.getState().conversations[0].linkedDesks).toEqual(['a'])
  })

  it('makePrimary moves an existing desk to the front without duplicating', async () => {
    await useChatStore.getState().linkDesk('conv-1', 'a')
    await useChatStore.getState().linkDesk('conv-1', 'b')
    await useChatStore.getState().linkDesk('conv-1', 'b', true)
    expect(useChatStore.getState().conversations[0].linkedDesks).toEqual(['b', 'a'])
  })

  it('leaves other conversations untouched', async () => {
    useChatStore.setState({ conversations: [meta([]), { ...meta([]), id: 'conv-2' }] })
    await useChatStore.getState().linkDesk('conv-1', 'a')
    expect(useChatStore.getState().conversations[1].linkedDesks).toEqual([])
  })
})

describe('the canned push prompts', () => {
  it('both ride the proposal pipeline in words, not silent writes', () => {
    expect(TURN_INTO_DESK_MESSAGE).toMatch(/propose/i)
    expect(PUSH_TO_DESK_MESSAGE).toMatch(/propose/i)
  })
})
