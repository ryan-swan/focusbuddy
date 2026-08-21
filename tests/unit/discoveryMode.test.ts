import { describe, it, expect, beforeEach } from 'vitest'
import { discoverySection } from '../../src/main/ai/discoveryMode'
import { toChatMode } from '../../src/main/db/aiChat'
import { useChatStore } from '../../src/renderer/src/stores/chat'
import { HOME_WIDGET_DEFS, widgetDef } from '../../src/renderer/src/components/views/homeWidgetDefs'
import type { AiChatConversationMeta } from '../../src/shared/types'

// Guided discovery (Plexii P6): a MODE of the one assistant. These lock the
// three things that make it a mode rather than a second engine — the prompt
// layer only appears when asked for, the mode is per-conversation state that
// survives, and the Home entry is a distinct verb at the icon tier.

describe('discoverySection', () => {
  it('is empty unless discovery is on — normal chat is untouched', () => {
    expect(discoverySection(false)).toBe('')
    expect(discoverySection(undefined)).toBe('')
  })

  it('teaches posture, not a new output shape', () => {
    const s = discoverySection(true)
    expect(s).toMatch(/DISCOVERY MODE/)
    // It leans on the P4 blocks and the existing action protocol...
    expect(s).toContain('"blocks"')
    expect(s).toContain('create-task')
    // ...and keeps the honesty rule that only actions build.
    expect(s).toMatch(/only "actions" build/i)
  })
})

describe('toChatMode', () => {
  it('reads discovery, and treats everything else as normal chat', () => {
    expect(toChatMode('discovery')).toBe('discovery')
    expect(toChatMode('chat')).toBe('chat')
    expect(toChatMode(null)).toBe('chat')
    expect(toChatMode('hologram')).toBe('chat')
  })
})

describe('conversation mode in the chat store', () => {
  const meta = (id: string, mode: 'chat' | 'discovery'): AiChatConversationMeta => ({
    id,
    taskId: null,
    title: 'T',
    createdAt: 1,
    updatedAt: 1,
    linkedDesks: [],
    mode
  })

  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: null,
      conversations: [],
      pendingMode: 'chat'
    })
  })

  it('an unsaved chat carries the pending mode', () => {
    expect(useChatStore.getState().activeMode()).toBe('chat')
    useChatStore.getState().setMode('discovery')
    expect(useChatStore.getState().pendingMode).toBe('discovery')
    expect(useChatStore.getState().activeMode()).toBe('discovery')
  })

  it('a saved conversation carries its own mode, not the pending one', () => {
    useChatStore.setState({
      activeConversationId: 'c1',
      conversations: [meta('c1', 'discovery')],
      pendingMode: 'chat'
    })
    expect(useChatStore.getState().activeMode()).toBe('discovery')
  })

  it('toggling a saved conversation updates only that conversation', () => {
    useChatStore.setState({
      activeConversationId: 'c1',
      conversations: [meta('c1', 'chat'), meta('c2', 'discovery')]
    })
    useChatStore.getState().setMode('discovery')
    const list = useChatStore.getState().conversations
    expect(list.find((c) => c.id === 'c1')?.mode).toBe('discovery')
    expect(list.find((c) => c.id === 'c2')?.mode).toBe('discovery')
    useChatStore.getState().setMode('chat')
    expect(useChatStore.getState().conversations.find((c) => c.id === 'c1')?.mode).toBe('chat')
    // c2 was never active, so it is untouched by the toggle.
    expect(useChatStore.getState().conversations.find((c) => c.id === 'c2')?.mode).toBe('discovery')
  })

  it('a new conversation resets to normal chat', () => {
    useChatStore.getState().setMode('discovery')
    useChatStore.getState().newConversation()
    expect(useChatStore.getState().pendingMode).toBe('chat')
  })
})

describe('the Discover home widget', () => {
  it('is an icon-tier verb using the minted compass mark', () => {
    const def = widgetDef('discover')
    expect(def.sizes).toEqual(['icon'])
    expect(def.defaultSize).toBe('icon')
    expect(def.icon).toBe('plexii:discover')
  })

  it('takes a colour no other icon-tier widget uses', () => {
    // The four surfaces already claimed by icon widgets are rose (meeting),
    // violet (transcribe), emerald (focus) and teal (new desk); Discover takes
    // indigo. Asserted against the other icon defs rather than as a global
    // uniqueness rule, because focus-timer and transcribe have long shared a
    // violet GALLERY tint while their icon surfaces differ — pre-existing and
    // not this phase's to change.
    const discover = widgetDef('discover')
    const otherIconTints = HOME_WIDGET_DEFS.filter(
      (d) => d.id !== 'discover' && d.sizes.includes('icon')
    ).map((d) => d.tint)
    expect(otherIconTints).not.toContain(discover.tint)
  })
})
