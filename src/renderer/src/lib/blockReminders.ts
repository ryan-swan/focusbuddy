import { notifyExternal } from './notify'
import { useViewStore } from '../stores/view'

// Calendar reminders — a desktop notification shortly before each planned time
// block starts. Polls the local calendar once a minute (side-effect module,
// imported by App.tsx like timeOfDay). Each block notifies once per app run;
// the fired set also round-trips sessionStorage so a quick reload inside the
// same minute does not re-alert. Blocks already started, done blocks, and
// meeting blocks the user is already in are left alone.

const LEAD_MS = 5 * 60 * 1000
const TICK_MS = 60 * 1000
const FIRED_KEY = 'fb.blockreminders.fired'

function loadFired(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* fresh set */
  }
  return new Set()
}

const fired = loadFired()

function persistFired(): void {
  try {
    // Keep the persisted set small; old ids are useless after their start time.
    sessionStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(fired).slice(-200)))
  } catch {
    /* best-effort */
  }
}

function minutesUntil(ms: number): number {
  return Math.max(1, Math.round((ms - Date.now()) / 60000))
}

async function tick(): Promise<void> {
  const now = Date.now()
  let blocks
  try {
    blocks = await window.api.timeBlocks.list(now, now + LEAD_MS + TICK_MS)
  } catch {
    return // db busy or window closing; next tick retries
  }
  for (const b of blocks) {
    if (b.status !== 'planned') continue
    if (b.startMs <= now || b.startMs > now + LEAD_MS) continue
    if (fired.has(b.id)) continue
    fired.add(b.id)
    const what = b.title || (b.meeting ? 'Meeting' : 'Focus time')
    notifyExternal(`Starting in ${minutesUntil(b.startMs)} min`, what, {
      force: true, // a scheduled commitment should alert even with the app focused
      tag: `block-${b.id}`,
      onClick: () => useViewStore.getState().goCalendar()
    })
  }
  persistFired()
}

// First check shortly after boot (give the db a moment), then every minute.
setTimeout(() => void tick(), 5000)
setInterval(() => void tick(), TICK_MS)
