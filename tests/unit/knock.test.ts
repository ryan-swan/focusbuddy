import { vi, describe, it, expect, beforeEach } from 'vitest'

// Capture what the knock store sends and the handler it registers.
const sent: Array<{ to: string; note?: string }> = []
let knockHandler: ((e: { from: { accountId: string; handle: string }; note: string | null }) => void) | null = null

vi.mock('../../src/renderer/src/lib/messagingSocket', () => ({
  sendKnock: (to: string, note?: string) => sent.push({ to, note }),
  setKnockHandler: (cb: typeof knockHandler) => {
    knockHandler = cb
  }
}))

const startDm = vi.fn(async () => ({ ok: true as const, id: 'c1' }))
const openConversation = vi.fn(async () => {})
const goMessages = vi.fn()
const startCall = vi.fn(async () => {})

vi.mock('../../src/renderer/src/stores/messaging', () => ({
  useMessagingStore: { getState: () => ({ startDm, openConversation }) }
}))
vi.mock('../../src/renderer/src/stores/view', () => ({
  useViewStore: { getState: () => ({ goMessages }) }
}))
vi.mock('../../src/renderer/src/stores/call', () => ({
  useCallStore: { getState: () => ({ startCall }) }
}))

import { useKnockStore } from '../../src/renderer/src/stores/knock'

function reset(): void {
  sent.length = 0
  startDm.mockClear()
  openConversation.mockClear()
  goMessages.mockClear()
  startCall.mockClear()
  useKnockStore.setState({ incoming: null, sentTo: null, ready: false })
  useKnockStore.getState().init()
}

describe('knock store', () => {
  beforeEach(reset)

  it('registers a handler and an incoming knock becomes the current notification', () => {
    knockHandler!({ from: { accountId: 'a', handle: 'amy' }, note: 'got a sec?' })
    expect(useKnockStore.getState().incoming?.from.handle).toBe('amy')
    expect(useKnockStore.getState().incoming?.note).toBe('got a sec?')
  })

  it('knock sends to the target and shows a sent confirmation', () => {
    useKnockStore.getState().knock({ accountId: 'b', handle: 'bob' }, 'ping')
    expect(sent).toEqual([{ to: 'b', note: 'ping' }])
    expect(useKnockStore.getState().sentTo).toBe('bob')
  })

  it('dismiss clears the incoming knock', () => {
    knockHandler!({ from: { accountId: 'a', handle: 'amy' }, note: null })
    useKnockStore.getState().dismiss()
    expect(useKnockStore.getState().incoming).toBeNull()
  })

  it('reply opens a DM with the knocker and navigates to messages', async () => {
    knockHandler!({ from: { accountId: 'a', handle: 'amy' }, note: null })
    await useKnockStore.getState().reply()
    expect(startDm).toHaveBeenCalledWith('amy')
    expect(goMessages).toHaveBeenCalled()
    expect(useKnockStore.getState().incoming).toBeNull()
  })

  it('call back starts a call with the knocker and clears the knock', () => {
    knockHandler!({ from: { accountId: 'a', handle: 'amy' }, note: null })
    useKnockStore.getState().callBack()
    expect(startCall).toHaveBeenCalledWith({ accountId: 'a', handle: 'amy' }, 'video')
    expect(useKnockStore.getState().incoming).toBeNull()
  })

  it('a second knock replaces the first rather than stacking', () => {
    knockHandler!({ from: { accountId: 'a', handle: 'amy' }, note: null })
    knockHandler!({ from: { accountId: 'b', handle: 'bob' }, note: null })
    expect(useKnockStore.getState().incoming?.from.handle).toBe('bob')
  })
})
