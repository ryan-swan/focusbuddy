import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { getDb } from './database'

// Local crash log (WS03 reliability). The app already isolates a failing widget
// (WidgetErrorBoundary) and catches a fatal render error (ErrorBoundary), but the
// error itself only ever reached the dev console and was lost. This persists it:
// uncaught errors + unhandled rejections from the main process, plus render
// errors forwarded from the renderer, land here with a stack and the app version,
// so a failure is inspectable after the fact instead of gone.
//
// Technical data only (message, stack, component stack, a short context label),
// never document content. Bounded: only the most recent CAP rows are kept.

const CAP = 200

export interface CrashInput {
  // Which side failed. 'renderer' events arrive over IPC; 'main' are recorded
  // directly by the process handlers below.
  source: 'main' | 'renderer'
  // A short classifier, e.g. 'uncaughtException', 'unhandledRejection',
  // 'render-error', 'widget-error'.
  kind: string
  message: string
  stack?: string | null
  // React component stack, when the source is an error boundary.
  componentStack?: string | null
  // A short free-text locator (e.g. a widget kind/id), never content.
  context?: string | null
}

export interface CrashEvent extends CrashInput {
  id: string
  ts: number
  appVersion: string
}

interface CrashRow {
  id: string
  ts: number
  source: string
  kind: string
  message: string
  stack: string | null
  component_stack: string | null
  app_version: string | null
  context: string | null
}

function rowTo(r: CrashRow): CrashEvent {
  return {
    id: r.id,
    ts: r.ts,
    source: r.source as 'main' | 'renderer',
    kind: r.kind,
    message: r.message,
    stack: r.stack,
    componentStack: r.component_stack,
    appVersion: r.app_version ?? '',
    context: r.context
  }
}

function appVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return ''
  }
}

// Trim a value so one enormous stack can't bloat the row. Stacks are the useful
// part, so they get a generous ceiling; messages/contexts are short by nature.
function clip(v: string | null | undefined, max: number): string | null {
  if (v == null) return null
  return v.length > max ? v.slice(0, max) : v
}

// Record a crash. Never throws — a failure in the crash logger must not itself
// crash the app or mask the original error.
export function recordCrash(input: CrashInput): CrashEvent | null {
  try {
    const event: CrashEvent = {
      id: randomUUID(),
      ts: Date.now(),
      appVersion: appVersion(),
      source: input.source,
      kind: (input.kind || 'error').slice(0, 60),
      message: clip(input.message, 2000) ?? '(no message)',
      stack: clip(input.stack, 16000),
      componentStack: clip(input.componentStack, 8000),
      context: clip(input.context, 500)
    }
    const db = getDb()
    db.prepare(
      `INSERT INTO crash_events
         (id, ts, source, kind, message, stack, component_stack, app_version, context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id,
      event.ts,
      event.source,
      event.kind,
      event.message,
      event.stack,
      event.componentStack,
      event.appVersion,
      event.context
    )
    // Keep only the most recent CAP rows. rowid breaks ts ties so two events in
    // the same millisecond order by insertion, and it always keeps the newest
    // (highest rowid) — the trim only ever drops the oldest, so max(rowid) never
    // shrinks and SQLite never reuses a rowid.
    db.prepare(
      `DELETE FROM crash_events WHERE rowid NOT IN
         (SELECT rowid FROM crash_events ORDER BY ts DESC, rowid DESC LIMIT ?)`
    ).run(CAP)
    return event
  } catch {
    return null
  }
}

// Most-recent crashes first. Never throws; returns [] if the store is unavailable.
export function listCrashes(limit = 50): CrashEvent[] {
  try {
    const rows = getDb()
      .prepare('SELECT * FROM crash_events ORDER BY ts DESC, rowid DESC LIMIT ?')
      .all(Math.max(1, Math.min(limit, CAP))) as CrashRow[]
    return rows.map(rowTo)
  } catch {
    return []
  }
}

// Crashes not yet forwarded to the signal server, oldest-first so the flush
// preserves chronological order over the wire. Never throws.
export function listUnforwarded(limit = 50): CrashEvent[] {
  try {
    const rows = getDb()
      .prepare('SELECT * FROM crash_events WHERE forwarded = 0 ORDER BY ts ASC, rowid ASC LIMIT ?')
      .all(Math.max(1, Math.min(limit, CAP))) as CrashRow[]
    return rows.map(rowTo)
  } catch {
    return []
  }
}

// Mark the given crashes as forwarded once the server has accepted them, so the
// next flush doesn't resend. Never throws.
export function markForwarded(ids: string[]): void {
  if (ids.length === 0) return
  try {
    const db = getDb()
    const stmt = db.prepare('UPDATE crash_events SET forwarded = 1 WHERE id = ?')
    db.transaction((list: string[]) => {
      for (const id of list) stmt.run(id)
    })(ids)
  } catch {
    // best-effort
  }
}

// Install the main-process global handlers. Idempotent per process. An uncaught
// error is recorded and logged but NOT rethrown, so a single stray rejection no
// longer takes the app down silently.
let installed = false
export function installMainCrashHandlers(): void {
  if (installed) return
  installed = true
  process.on('uncaughtException', (err) => {
    recordCrash({ source: 'main', kind: 'uncaughtException', message: err?.message ?? String(err), stack: err?.stack })
    // eslint-disable-next-line no-console
    console.error('[crash] uncaughtException', err)
  })
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    recordCrash({ source: 'main', kind: 'unhandledRejection', message: err.message, stack: err.stack })
    // eslint-disable-next-line no-console
    console.error('[crash] unhandledRejection', reason)
  })
}
