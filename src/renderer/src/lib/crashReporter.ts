// Renderer crash reporting (WS03 reliability). Forwards uncaught render errors,
// unhandled promise rejections, and error-boundary catches to the main process,
// where they persist in the crash log with the app version. Best-effort and
// self-guarded: a failure in reporting is swallowed so it can never throw back
// into the app or mask the original error.

export interface CrashPayload {
  kind: string
  message: string
  stack?: string | null
  componentStack?: string | null
  // A short locator (e.g. a widget kind/id), never document content.
  context?: string | null
}

interface CrashApi {
  crash?: { report?: (p: CrashPayload) => Promise<unknown> }
}

function crashApi(): CrashApi | undefined {
  return (window as unknown as { api?: CrashApi }).api
}

// Send one crash. Never throws; a missing bridge (e.g. very early boot) is a
// silent no-op rather than an error.
export function reportCrash(payload: CrashPayload): void {
  try {
    const fn = crashApi()?.crash?.report
    if (fn) void fn(payload).catch(() => {})
  } catch {
    // reporting must never itself surface an error
  }
}

let installed = false
// Install the global renderer handlers once. Uncaught errors and unhandled
// rejections are reported (they do not stop the app; error boundaries handle
// render-time failures, and these catch the rest).
export function installCrashReporting(): void {
  if (installed) return
  installed = true
  window.addEventListener('error', (e) => {
    const err = e.error instanceof Error ? e.error : null
    reportCrash({
      kind: 'window-error',
      message: err?.message ?? String(e.message || 'Unknown error'),
      stack: err?.stack ?? null
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason
    const err = reason instanceof Error ? reason : null
    reportCrash({
      kind: 'unhandledrejection',
      message: err?.message ?? String(reason),
      stack: err?.stack ?? null
    })
  })
}
