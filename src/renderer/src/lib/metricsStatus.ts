// Pure decision for the dev metrics overlay's status banner. Kept framework-free
// so it can be unit-tested without rendering React (see tests/unit/metricsStatus).
//
// The overlay reads per-process RAM/CPU from window.api.metrics.get(). That
// handler lives in the main process and its `metrics` namespace in the preload,
// and NEITHER hot-reloads. So the common real-world failure is a stale running
// process: the renderer hot-reloaded the overlay in, but window.api has no
// `metrics` namespace yet, so the call is missing or throws and the overlay would
// otherwise render a mute zero. This turns that zero into an explanation.

export interface MetricsProbe {
  // Whether window.api.metrics.get resolved to a callable function this tick.
  hasGetter: boolean
  // The error message if the call threw, else null/undefined.
  threw?: string | null
  // Number of processes the call returned.
  count: number
}

export function metricsStatus(p: MetricsProbe): string | null {
  if (!p.hasGetter) {
    return 'metrics IPC not loaded — fully quit and relaunch the app (a main-process change needs a restart, not a reload).'
  }
  if (p.threw) {
    return `metrics:get failed — ${p.threw}. A full app restart usually fixes this.`
  }
  if (p.count === 0) {
    return 'metrics:get returned no processes.'
  }
  return null
}
