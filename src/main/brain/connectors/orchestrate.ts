// The connector orchestrator (plexi-brain I2). PURE: no DB, no I/O, no Electron — the
// connectors do the reads; this only SEQUENCES them and tracks reconcile coverage. Kept
// separate from registry.ts (which statically imports the real DB-backed connectors) so
// this load-bearing policy is unit-testable in isolation with synthetic connectors, the
// same way src/shared/indexReconcile.ts isolates the prune policy from the driver.
//
// This is the exact per-collector coverage discipline that used to live inline in
// indexer.ts's collect() helper (I0b). It is preserved to the letter because it is the
// safety keel of the delete path: a connector that throws must NOT let the reconcile
// pass read its absence as "the user deleted everything".

import type { Connector, CollectResult, SourceDoc } from './types'

// Run every connector under its OWN coverage declaration.
//
// For each connector: stage its emitted docs in a private buffer; if collect() throws,
// DROP the whole staged batch and DO NOT declare coverage for its sourceType (so the
// reconcile pass leaves that type's indexed content strictly alone); only on a clean
// return are the staged docs committed and the sourceType declared covered. A connector
// that legitimately yields ZERO still declares coverage — "yielded nothing" is only safe
// to act on (a total delete → a total prune) because we know we asked.
export function runConnectors(connectors: readonly Connector[]): CollectResult {
  const out: CollectResult = { sources: [], coveredSourceTypes: new Set() }
  for (const connector of connectors) {
    const staged: SourceDoc[] = []
    try {
      connector.collect((doc) => staged.push(doc))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[connectors] '${connector.id}' failed — its sources are skipped this pass and its ` +
          `indexed content is left untouched (no coverage declared for '${connector.sourceType}'):`,
        err
      )
      continue
    }
    out.sources.push(...staged)
    out.coveredSourceTypes.add(connector.sourceType)
  }
  return out
}
