import { describe, it, expect, vi } from 'vitest'
import { runConnectors } from '../../src/main/brain/connectors/orchestrate'
import type { Connector, SourceDoc } from '../../src/main/brain/connectors/types'

// I2 — the pure lock on the connector orchestrator's COVERAGE DISCIPLINE.
//
// runConnectors is the delete path's safety keel (I0b): it decides, per connector,
// whether the reconcile pass is allowed to prune that source type. The rule — coverage
// is DECLARED only on a clean enumeration; a connector that throws declares nothing and
// its partial output is discarded — is what stops a flaky connector's absence from being
// read as "the user deleted everything". These tests run against synthetic connectors so
// the policy is verified in isolation from the real DB-backed registry.
//
// Red-then-green teeth (verified by deliberately breaking runConnectors, watching each
// fail, reverting):
//   • declare coverage BEFORE the try/catch (or in a finally) ⇒ the throw test's
//     `coveredSourceTypes.has('bad')` flips to true.
//   • push straight to out.sources instead of staging ⇒ the throw test leaks 'bad-partial'.

function doc(sourceType: string, sourceId: string): SourceDoc {
  return { sourceType, sourceId, title: sourceId, text: sourceId, roomId: null, chunkDate: null, sourceKind: null }
}

function connector(opts: { id?: string; sourceType: string; collect: Connector['collect'] }): Connector {
  return {
    id: opts.id ?? `test:${opts.sourceType}`,
    kind: 'internal',
    sourceType: opts.sourceType,
    label: opts.sourceType,
    collect: opts.collect
  }
}

describe('runConnectors — the connector-registry coverage discipline (I2)', () => {
  it('yields every source in registry order and declares coverage for each clean connector', () => {
    const a = connector({
      sourceType: 'a',
      collect: (emit) => {
        emit(doc('a', 'a1'))
        emit(doc('a', 'a2'))
      }
    })
    const b = connector({ sourceType: 'b', collect: (emit) => emit(doc('b', 'b1')) })

    const res = runConnectors([a, b])

    // Registry order is preserved (determinism); the chunk table is order-independent, but
    // a stable source order keeps logs and any downstream diff readable.
    expect(res.sources.map((s) => s.sourceId)).toEqual(['a1', 'a2', 'b1'])
    expect([...res.coveredSourceTypes].sort()).toEqual(['a', 'b'])
  })

  it('drops a throwing connector’s staged docs, declares NO coverage for it, and runs the rest', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = connector({ sourceType: 'good', collect: (emit) => emit(doc('good', 'g1')) })
    const bad = connector({
      sourceType: 'bad',
      collect: (emit) => {
        emit(doc('bad', 'bad-partial')) // staged, must be discarded on the throw below
        throw new Error('connector boom')
      }
    })
    const after = connector({ sourceType: 'after', collect: (emit) => emit(doc('after', 'af1')) })

    const res = runConnectors([good, bad, after])

    // The partial doc never reaches the committed set (staged buffer, dropped on throw).
    expect(res.sources.map((s) => s.sourceId)).toEqual(['g1', 'af1'])
    // The whole safety argument: a failed connector declares NO coverage, so the reconcile
    // pass may not prune 'bad' — its indexed corpus is left strictly alone.
    expect(res.coveredSourceTypes.has('bad')).toBe(false)
    // A throw does not abort the pass — later connectors still run and declare coverage.
    expect(res.coveredSourceTypes.has('good')).toBe(true)
    expect(res.coveredSourceTypes.has('after')).toBe(true)
    // The failure is surfaced (never silently swallowed).
    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(errSpy.mock.calls[0].join(' ')).toContain('test:bad')
    errSpy.mockRestore()
  })

  it('declares coverage for a connector that legitimately yields ZERO (total delete → total prune)', () => {
    const empty = connector({ sourceType: 'empty', collect: () => {} })

    const res = runConnectors([empty])

    expect(res.sources).toEqual([])
    // "Yielded nothing" is only safe to act on because we know we ASKED — coverage declared.
    expect(res.coveredSourceTypes.has('empty')).toBe(true)
  })

  it('keys coverage by sourceType, not connector id (many connectors can share a type at I5)', () => {
    const c = connector({ id: 'internal:widget', sourceType: 'widget', collect: (emit) => emit(doc('widget', 'w1')) })

    const res = runConnectors([c])

    expect(res.coveredSourceTypes.has('widget')).toBe(true)
    expect(res.coveredSourceTypes.has('internal:widget')).toBe(false)
  })
})
