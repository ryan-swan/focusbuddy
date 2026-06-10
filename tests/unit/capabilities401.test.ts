// Unit tests for the capabilities store 401-hardening (Change 4).
//
// The fix: when GET /account/capabilities returns 401, the store must:
//   1. Resolve capabilities to the free map.
//   2. Set error to 'session-expired'.
//   3. Call accountStore.signOut() to clear the dead session.
//
// Mocking strategy: the capabilities store imports useAccountStore (a zustand
// store that calls IPC) and signalConfig (reads Vite env). Both are mocked so
// the test runs under vitest without Electron or a network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted runs before vi.mock factory closures, so shared mock functions
// declared here are safely accessible inside the factory.
const { mockSignOut, mockGetState, mockSubscribe } = vi.hoisted(() => {
  const mockSignOut = vi.fn().mockResolvedValue(undefined)
  const mockGetState = vi.fn(() => ({
    sessionToken: 'stale-token-abc',
    signOut: mockSignOut
  }))
  const mockSubscribe = vi.fn(() => () => {})
  return { mockSignOut, mockGetState, mockSubscribe }
})

// ── Mock: signalConfig ───────────────────────────────────────────────────────
vi.mock('@renderer/lib/signalConfig', () => ({
  signalConfig: {
    httpUrl: 'http://localhost:19999',
    wsUrl: 'ws://localhost:19999/ws',
    useRemote: true
  }
}))

// ── Mock: account store ──────────────────────────────────────────────────────
vi.mock('@renderer/stores/account', () => ({
  useAccountStore: Object.assign(
    (_selector: unknown) => undefined,
    {
      getState: mockGetState,
      subscribe: mockSubscribe
    }
  )
}))

// ── Import after mocks ───────────────────────────────────────────────────────
import { useCapabilityStore } from '@renderer/stores/capabilities'
import { CAPABILITY_DEFAULTS } from '@renderer/lib/capabilityDefaults'

// Build the expected free map from the actual defaults so the test stays in
// sync with the capability matrix automatically.
function buildFreeMap(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, perTier] of Object.entries(CAPABILITY_DEFAULTS)) {
    out[key] = perTier['free']
  }
  return out
}

describe('useCapabilityStore — 401 hardening', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    // Reset store to a "signed-in / pro" state before each test so we
    // can verify the transition to the free map on a 401.
    useCapabilityStore.setState({
      tier: 'pro',
      effectiveTier: 'pro',
      storedTier: 'pro',
      trial: { active: false, daysLeft: 0, startedAt: null, expiresAt: null },
      capabilities: {
        widget_table: true,
        ai_task_setup: true
      } as Record<string, unknown>,
      loadedAt: Date.now(),
      error: null
    })
    mockSignOut.mockClear()
    mockGetState.mockReturnValue({ sessionToken: 'stale-token-abc', signOut: mockSignOut })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('on 401: resolves capabilities to the free map', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({})
    }) as unknown as typeof fetch

    await useCapabilityStore.getState().refresh()

    const state = useCapabilityStore.getState()
    const freeMap = buildFreeMap()
    // Spot-check capabilities that differ between free and pro.
    expect(state.capabilities['widget_table']).toBe(freeMap['widget_table'])
    expect(state.capabilities['ai_task_setup']).toBe(freeMap['ai_task_setup'])
    expect(state.tier).toBe('free')
    expect(state.effectiveTier).toBe('free')
    expect(state.storedTier).toBe('free')
  })

  it('on 401: sets error to "session-expired"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({})
    }) as unknown as typeof fetch

    await useCapabilityStore.getState().refresh()

    expect(useCapabilityStore.getState().error).toBe('session-expired')
  })

  it('on 401: calls accountStore.signOut() to clear the dead session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({})
    }) as unknown as typeof fetch

    await useCapabilityStore.getState().refresh()

    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('when sessionToken is already null (already signed out): does NOT call signOut and sets no error', async () => {
    // If signOut already ran and cleared the token before refresh fires,
    // the store should take the early-exit signed-out path and not hit
    // the network at all, let alone call signOut again.
    mockGetState.mockReturnValue({ sessionToken: null, signOut: mockSignOut })

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({})
    }) as unknown as typeof fetch

    await useCapabilityStore.getState().refresh()

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(useCapabilityStore.getState().tier).toBe('free')
    expect(useCapabilityStore.getState().error).toBeNull()
  })

  it('happy path (200): resolves tier + capabilities, does NOT call signOut', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        tier: 'pro',
        storedTier: 'pro',
        effectiveTier: 'pro',
        trial: { active: false, daysLeft: 0, startedAt: null, expiresAt: null },
        capabilities: {
          widget_table: true,
          ai_task_setup: true,
          multiple_desks: 'Unlimited'
        }
      })
    }) as unknown as typeof fetch

    await useCapabilityStore.getState().refresh()

    const state = useCapabilityStore.getState()
    expect(state.tier).toBe('pro')
    expect(state.effectiveTier).toBe('pro')
    expect(state.error).toBeNull()
    expect(state.capabilities['widget_table']).toBe(true)
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})
