// The CRDT convergence primitives now live in the shared layer (src/shared/crdt.ts)
// so the renderer's sync engine and the main process share one implementation. This
// module re-exports them unchanged, so existing importers of `src/main/sync/crdt`
// (the conformance test tests/unit/plxSynCrdt.test.ts and the WS01 design doc's
// path reference) keep resolving to the same code.
export * from '../../shared/crdt'
