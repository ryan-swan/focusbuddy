// The notification scheduler (Attention S4, §5) — the electron-bound half of
// the substrate: app-start + 30-second sweep of due undelivered rows. A
// delivery is a native OS banner plus a renderer event; rows are marked
// delivered BEFORE the banner side effect (lose one banner at worst, never
// storm). Also refreshes the calendar block-reminder schedule each sweep, the
// durable replacement for the retired renderer setInterval engine.

import { Notification, BrowserWindow } from 'electron'
import { getDb } from '../db/database'
import { listBlocksInRange } from '../db/timeBlocks'
import { decayLooseThoughts } from '../db/workItems'
import { sweepDeliveries, scheduleBlockReminders, BLOCK_REMINDER_LEAD_MS } from './substrate'

export const SWEEP_INTERVAL_MS = 30 * 1000
// How far ahead each sweep looks for blocks needing a reminder scheduled.
const BLOCK_LOOKAHEAD_MS = 24 * 60 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

function showBanner(title: string, body: string, ref: string | null): void {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send('fb:notification-open', { ref })
      }
    })
    n.show()
  } catch {
    // Banners are best-effort; the row is already recorded + marked.
  }
}

export function runSweepOnce(nowMs = Date.now()): number {
  const db = getDb()
  // Refresh the block-reminder schedule (dedupe makes re-posting a no-op).
  try {
    const blocks = listBlocksInRange(nowMs - BLOCK_REMINDER_LEAD_MS, nowMs + BLOCK_LOOKAHEAD_MS)
    scheduleBlockReminders(
      db,
      blocks.map((b) => ({ id: b.id, title: b.title, startMs: b.startMs, status: b.status })),
      nowMs
    )
  } catch {
    /* calendar unavailable — sweep still delivers what is due */
  }
  // Δ3: the loose-thought decay tier rides the same cadence (cheap query;
  // dismissals carry reason 'decayed' and never notify — decay is quiet).
  try {
    decayLooseThoughts(nowMs)
  } catch {
    /* decay is best-effort */
  }
  const deliveries = sweepDeliveries(db, nowMs)
  for (const d of deliveries) showBanner(d.title, d.body, d.ref)
  if (deliveries.length) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('fb:notifications-delivered', {
        count: deliveries.reduce((n, d) => n + d.count, 0)
      })
    }
  }
  return deliveries.length
}

export function startNotificationScheduler(): void {
  if (timer) return
  runSweepOnce()
  timer = setInterval(() => runSweepOnce(), SWEEP_INTERVAL_MS)
}

export function stopNotificationScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
