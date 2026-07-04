import { describe, it, expect, beforeEach } from 'vitest'
import { useSyncStatus } from '../../src/renderer/src/stores/syncStatus'

// Coverage for stores/syncStatus.ts — the single source of truth SyncIndicator
// reads so a user can tell synced / syncing / retrying-offline / error apart
// (audit findings M1/M2: sync failures were previously invisible).

describe('syncStatus store', () => {
  beforeEach(() => {
    useSyncStatus.setState({ state: 'disabled', lastOkAt: 0, lastError: null, consecutiveErrors: 0 })
  })

  it('boots disabled (no account signed in)', () => {
    expect(useSyncStatus.getState().state).toBe('disabled')
  })

  it('setSyncing moves disabled/idle/offline/error into syncing', () => {
    useSyncStatus.getState().setSyncing()
    expect(useSyncStatus.getState().state).toBe('syncing')
  })

  it('setSyncing does NOT flap an already-ok state back to syncing (no blinking green)', () => {
    useSyncStatus.getState().setOk()
    expect(useSyncStatus.getState().state).toBe('ok')
    useSyncStatus.getState().setSyncing()
    expect(useSyncStatus.getState().state).toBe('ok')
  })

  it('setOk records lastOkAt, clears lastError, and resets the error streak', () => {
    useSyncStatus.setState({ consecutiveErrors: 2, lastError: 'boom' })
    const before = Date.now()
    useSyncStatus.getState().setOk()
    const s = useSyncStatus.getState()
    expect(s.state).toBe('ok')
    expect(s.lastOkAt).toBeGreaterThanOrEqual(before)
    expect(s.lastError).toBeNull()
    expect(s.consecutiveErrors).toBe(0)
  })

  it('setOffline is transient and does not count as an error', () => {
    useSyncStatus.getState().setOffline()
    const s = useSyncStatus.getState()
    expect(s.state).toBe('offline')
    expect(s.consecutiveErrors).toBe(0)
  })

  it('setOffline never overrides a genuine error state into looking merely offline', () => {
    useSyncStatus.setState({ state: 'error' })
    useSyncStatus.getState().setOffline()
    expect(useSyncStatus.getState().state).toBe('error')
  })

  it('setError below the threshold reads as offline-ish (transient), not a hard error', () => {
    useSyncStatus.getState().setError('rejected once')
    let s = useSyncStatus.getState()
    expect(s.consecutiveErrors).toBe(1)
    expect(s.state).toBe('offline')

    useSyncStatus.getState().setError('rejected twice')
    s = useSyncStatus.getState()
    expect(s.consecutiveErrors).toBe(2)
    expect(s.state).toBe('offline')
  })

  it('setError at/over the threshold (3 consecutive) escalates to a real, surfaced error', () => {
    useSyncStatus.getState().setError('one')
    useSyncStatus.getState().setError('two')
    useSyncStatus.getState().setError('three')
    const s = useSyncStatus.getState()
    expect(s.consecutiveErrors).toBe(3)
    expect(s.state).toBe('error')
    expect(s.lastError).toBe('three')
  })

  it('a later setOk after an escalated error clears everything back to healthy', () => {
    useSyncStatus.getState().setError('one')
    useSyncStatus.getState().setError('two')
    useSyncStatus.getState().setError('three')
    expect(useSyncStatus.getState().state).toBe('error')

    useSyncStatus.getState().setOk()
    const s = useSyncStatus.getState()
    expect(s.state).toBe('ok')
    expect(s.consecutiveErrors).toBe(0)
    expect(s.lastError).toBeNull()
  })

  it('setDisabled resets error tracking and lastError (sign-out / preview guard)', () => {
    useSyncStatus.getState().setError('one')
    useSyncStatus.getState().setError('two')
    useSyncStatus.getState().setDisabled()
    const s = useSyncStatus.getState()
    expect(s.state).toBe('disabled')
    expect(s.lastError).toBeNull()
    expect(s.consecutiveErrors).toBe(0)
  })
})
