import { describe, it, expect } from 'vitest'
import { metricsStatus } from '@renderer/lib/metricsStatus'

// The dev metrics overlay shows a status banner instead of a mute zero when the
// metrics IPC can't answer. The most common real cause is a stale running
// process: a main/preload change (the metrics:get handler + its preload
// namespace) needs a full app restart, not a Cmd+R reload.

describe('metricsStatus', () => {
  it('tells the user to relaunch when the getter is missing (stale preload)', () => {
    const msg = metricsStatus({ hasGetter: false, count: 0 })
    expect(msg).toBeTruthy()
    expect(msg).toMatch(/relaunch|restart/i)
    expect(msg).toMatch(/not a reload/i)
  })

  it('surfaces the underlying error message when the call throws', () => {
    const msg = metricsStatus({ hasGetter: true, threw: 'no handler for metrics:get', count: 0 })
    expect(msg).toContain('no handler for metrics:get')
    expect(msg).toMatch(/restart/i)
  })

  it('flags an empty process list as a distinct, non-error condition', () => {
    const msg = metricsStatus({ hasGetter: true, count: 0 })
    expect(msg).toBe('metrics:get returned no processes.')
  })

  it('a thrown error takes priority over the empty-list message', () => {
    const msg = metricsStatus({ hasGetter: true, threw: 'boom', count: 0 })
    expect(msg).toContain('boom')
    expect(msg).not.toContain('returned no processes')
  })

  it('returns null (no banner) once real processes come back', () => {
    expect(metricsStatus({ hasGetter: true, threw: null, count: 7 })).toBeNull()
  })
})
