import type { FbNode } from '@shared/types'

export interface VelocityStats {
  sampleCount: number
  /** Total estimate (including extensions) averaged across completed tasks. */
  avgEstimateMin: number
  /** Total actual elapsed time averaged across completed tasks. */
  avgActualMin: number
  /** Median actual minutes across completed tasks. More robust than mean. */
  medianActualMin: number
  /** actualMin / estimateMin (with extensions). 1.0 = on target, 2.0 = takes 2x as long. */
  ratio: number
}

/**
 * Compute the user's historical estimation accuracy from all completed tasks
 * that have estimates and timing data. Used by NewNodeDialog to suggest a
 * realistic estimate based on past performance.
 */
export function computeVelocity(nodes: FbNode[]): VelocityStats | null {
  const completed = nodes.filter(
    (n) =>
      n.kind === 'task' &&
      n.status === 'done' &&
      n.startedAt !== null &&
      n.completedAt !== null &&
      typeof n.estimateMinutes === 'number' &&
      n.estimateMinutes > 0
  )
  if (completed.length === 0) return null

  let totalEstimate = 0
  let totalActual = 0
  const actuals: number[] = []
  for (const t of completed) {
    const est = (t.estimateMinutes ?? 0) + (t.extensionsMinutes ?? 0)
    if (est <= 0) continue
    const actualMin = ((t.completedAt ?? 0) - (t.startedAt ?? 0)) / 60000
    if (actualMin <= 0) continue
    totalEstimate += est
    totalActual += actualMin
    actuals.push(actualMin)
  }
  if (actuals.length === 0) return null
  actuals.sort((a, b) => a - b)
  const median = actuals[Math.floor(actuals.length / 2)]
  return {
    sampleCount: actuals.length,
    avgEstimateMin: totalEstimate / actuals.length,
    avgActualMin: totalActual / actuals.length,
    medianActualMin: median,
    ratio: totalActual / totalEstimate
  }
}

export function predictForEstimate(stats: VelocityStats, userEstimateMin: number): number {
  return Math.max(1, Math.round(userEstimateMin * stats.ratio))
}
