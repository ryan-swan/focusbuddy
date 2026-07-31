// The connector REGISTRY (plexi-brain I2). The single place that says "these are the
// sources the brain ingests." Replaces collectSources()'s hardcoded 4-way switch (defect
// D8) with a list — the inversion that makes new sources additive: an external connector
// (I5) appends here and inherits the entire pipeline.
//
// collectSources() is the one entry point the indexer calls; it runs the registry under
// the pure coverage orchestrator (orchestrate.ts). The registry order is fixed for
// determinism but does NOT affect the chunk table, which is keyed by chunk id and hashed
// ORDER BY id — the byte-identical property the I2 commit-1 gate asserts.

import type { CollectResult } from './types'
import { runConnectors } from './orchestrate'
import { knowledgeConnector } from './knowledge'
import { documentConnector } from './document'
import { taskConnector } from './task'
import { widgetConnector } from './widget'

// Connectors #1–4 — the four internal surfaces. External connectors join this list at I5.
export const INTERNAL_CONNECTORS = [
  knowledgeConnector,
  documentConnector,
  taskConnector,
  widgetConnector
] as const

// Gather every indexable source in the active org, via the internal connector registry,
// each under its own reconcile-coverage declaration. Drop-in replacement for the old
// collectSources() — same CollectResult shape, same coverage semantics.
export function collectSources(): CollectResult {
  return runConnectors(INTERNAL_CONNECTORS)
}
