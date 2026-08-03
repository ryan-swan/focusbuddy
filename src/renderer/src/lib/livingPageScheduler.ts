// Auto-regeneration scheduler for living pages.
//
// Subscribes to the widget store (outside React) and, whenever a source
// widget in the active task changes, schedules a debounced regen for any
// living page in the same task. One pending timer per page, reset on each
// change. Paused living pages are skipped. Pages whose query is unset are
// skipped.
//
// Why outside React: the trigger is a global concern (any source widget
// change anywhere in the canvas, including IPC-driven updates from chat
// proposals, focus-mode edits, drag/drop). Wiring per-component would mean
// every widget kind needing scheduler hooks, which gets brittle fast.
//
// Cost guardrails:
//  - DEBOUNCE_MS sets the minimum quiet window before a regen fires (45s).
//  - MIN_GAP_MS guarantees we don't regen the same page more than once
//    every 90s even if changes keep arriving. Without this a burst-edit on
//    a sticky note could DoS your API budget.
//  - We never auto-regen if the page itself has the most recent update —
//    that would loop after every regen (since the regen IS an update).

import type { Widget } from '@shared/types'
import { useWidgetStore } from '../stores/widgets'

const DEBOUNCE_MS = 45_000
const MIN_GAP_MS = 90_000

// Per-page timers + a per-page lock so two concurrent triggers don't race.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const inFlight = new Set<string>()
const lastRunAt = new Map<string, number>()

// Snapshot of the last seen "source signature" per task — used to decide if
// anything actually changed since the last evaluation. We hash on (id,
// updatedAt) of non-living-page widgets only.
const lastSourceSig = new Map<string, string>()

function isLivingPage(w: Widget): boolean {
  // Both a living Page and the dedicated Living Doc widget auto-regenerate.
  return (
    (w.kind === 'page' || w.kind === 'living-doc') &&
    w.livingQuery !== null &&
    w.livingQuery !== undefined
  )
}

function sourceSignature(widgets: Widget[]): string {
  const parts: string[] = []
  for (const w of widgets) {
    if (w.archived) continue
    if (isLivingPage(w)) continue
    parts.push(`${w.id}:${w.updatedAt}`)
  }
  parts.sort()
  return parts.join('|')
}

async function runRegen(widgetId: string): Promise<void> {
  if (inFlight.has(widgetId)) return
  inFlight.add(widgetId)
  try {
    const resp = await window.api.livingPage.regenerate(widgetId)
    lastRunAt.set(widgetId, Date.now())
    if (resp.ok && resp.content && resp.generatedAt) {
      // Apply via the store's `update` so the optimistic copy and the DB
      // both end up holding the new generation.
      await useWidgetStore.getState().update(widgetId, {
        content: resp.content,
        livingGeneratedAt: resp.generatedAt
      })
    }
  } finally {
    inFlight.delete(widgetId)
  }
}

function scheduleRegen(pageId: string): void {
  const existing = pendingTimers.get(pageId)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => {
    pendingTimers.delete(pageId)
    const last = lastRunAt.get(pageId) ?? 0
    const gap = Date.now() - last
    if (gap < MIN_GAP_MS) {
      // Too soon since the last regen — re-schedule for the remainder of
      // the floor and let the next pass try again.
      const wait = MIN_GAP_MS - gap
      const t2 = setTimeout(() => {
        pendingTimers.delete(pageId)
        void runRegen(pageId)
      }, wait)
      pendingTimers.set(pageId, t2)
      return
    }
    void runRegen(pageId)
  }, DEBOUNCE_MS)
  pendingTimers.set(pageId, t)
}

let installed = false

export function installLivingPageScheduler(): void {
  if (installed) return
  installed = true
  useWidgetStore.subscribe((state) => {
    // Group widgets by taskId so each task has its own "anything changed?"
    // check. In practice only the active task is loaded at a time, but the
    // store doesn't enforce that and this is defensive.
    const byTask = new Map<string, Widget[]>()
    for (const w of state.widgets) {
      const list = byTask.get(w.taskId) ?? []
      list.push(w)
      byTask.set(w.taskId, list)
    }
    for (const [taskId, taskWidgets] of byTask) {
      const sig = sourceSignature(taskWidgets)
      const prev = lastSourceSig.get(taskId)
      if (prev === sig) continue
      lastSourceSig.set(taskId, sig)
      if (prev === undefined) continue // first load — don't trigger immediately
      // Something changed in the source set — schedule regen for every
      // living page in this task that isn't paused or empty.
      for (const w of taskWidgets) {
        if (!isLivingPage(w)) continue
        if (w.livingPaused) continue
        if (!w.livingQuery || !w.livingQuery.trim()) continue
        scheduleRegen(w.id)
      }
    }
  })
}

// Test/manual hook — flush all pending regens immediately. Not exported via
// window.api; available for the renderer to call when a user-driven action
// should bypass the debounce (e.g. "Regenerate now" button does its own
// direct call so doesn't need this).
export function flushPendingRegens(): void {
  for (const t of pendingTimers.values()) clearTimeout(t)
  pendingTimers.clear()
}
