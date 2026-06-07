import { create } from 'zustand'
import type { Widget } from '@shared/types'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import { parseAgent } from './deskAgent'
import { extractWebviewText } from './webviewRegistry'
import { buildTableFromText } from './tableAiBuild'
import { coerceToWidgetContent } from './widgetContentFormat'

// The content that flows OUT of a widget along a wire. For a desk agent that is
// its latest output (not its raw JSON config), so an agent can feed a note via a
// mirror wire or be the source of a transform. Everything else flows its content.
function effectiveContent(w: Widget): string {
  return w.kind === 'agent' ? parseAgent(w.content).lastOutput ?? '' : w.content ?? ''
}

// ── Live wires: the reactive engine ──────────────────────────────────────────
//
// When a widget's CONTENT changes, the engine looks for outgoing reactive wires
// (transform / mirror) leaving that widget and fires them, debounced per wire.
// A 'mirror' wire copies the source content straight into the target. A
// 'transform' wire asks the AI (via IPC, Haiku by default) to run the wire's
// verb over the source and writes the result into the target.
//
// Loop safety: every write the engine makes to a target is recorded in a short
// cooldown. A change whose widget is in cooldown does NOT re-trigger wires, so
// A→B can't bounce back to A and B can't re-fire its own upstream. Combined with
// the per-wire debounce, a burst of edits collapses into one downstream run.
//
// This lives in the renderer because that is where content edits, the links
// store and the widgets store already are. The AI call itself is bounded and
// stateless in main; only the scheduling is here.

const DEBOUNCE_MS = 900
// After the engine writes a target, ignore changes to that widget for this long
// so the write doesn't cascade back through its own wires.
const COOLDOWN_MS = 3500

interface WireRunState {
  // wireId -> true while its transform is inflight (drives the pulse on the wire).
  running: Record<string, boolean>
  // wireId -> a token while a brief delivery pulse is animating. Used for fast
  // events (a mirror write) that complete instantly but should still spark.
  firing: Record<string, number>
  // wireId -> last error message, surfaced on the wire editor.
  errors: Record<string, string>
  // wireId -> timestamp of the last successful run (for a subtle "just ran" tick).
  lastRunAt: Record<string, number>
  setRunning: (wireId: string, on: boolean) => void
  setError: (wireId: string, error: string | null) => void
  markRan: (wireId: string, at: number) => void
  // Flash a wire's electric pulse for `ms` (default ~900ms) — for instant
  // deliveries that have no inflight window of their own.
  pulseWire: (wireId: string, ms?: number) => void
}

let pulseCounter = 0

export const useWireRunStore = create<WireRunState>((set, get) => ({
  running: {},
  firing: {},
  errors: {},
  lastRunAt: {},
  setRunning: (wireId, on) =>
    set((s) => ({ running: { ...s.running, [wireId]: on } })),
  setError: (wireId, error) =>
    set((s) => {
      const errors = { ...s.errors }
      if (error) errors[wireId] = error
      else delete errors[wireId]
      return { errors }
    }),
  markRan: (wireId, at) => set((s) => ({ lastRunAt: { ...s.lastRunAt, [wireId]: at } })),
  pulseWire: (wireId, ms = 900) => {
    const token = ++pulseCounter
    set((s) => ({ firing: { ...s.firing, [wireId]: token } }))
    setTimeout(() => {
      if (get().firing[wireId] !== token) return
      set((s) => {
        const firing = { ...s.firing }
        delete firing[wireId]
        return { firing }
      })
    }, ms)
  }
}))

// Per-wire debounce timers and a "supersede" generation so a newer trigger
// cancels an in-flight transform's write.
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const wireGeneration = new Map<string, number>()
// widgetId -> timestamp it last received an engine write (loop guard).
const writeCooldown = new Map<string, number>()
// wireId -> the last material used to build a table target, so identical source
// content doesn't trigger a redundant (paid) rebuild.
const lastTableMaterial = new Map<string, string>()

function inCooldown(widgetId: string): boolean {
  const t = writeCooldown.get(widgetId)
  if (t === undefined) return false
  if (Date.now() - t > COOLDOWN_MS) {
    writeCooldown.delete(widgetId)
    return false
  }
  return true
}

// Public entry point — called by the widgets store after a content change.
export function notifyWireSource(sourceId: string): void {
  // A change the engine itself caused must not start another cascade.
  if (inCooldown(sourceId)) return
  const links = useLinksStore.getState().links
  // A desk agent's outgoing wires are ALL reactive — attaching a widget to an
  // agent means "deliver your output here", whatever the wire type. For every
  // other source, only transform / mirror wires react (a plain context wire is
  // passive).
  const sourceIsAgent =
    useWidgetStore.getState().widgets.find((w) => w.id === sourceId)?.kind === 'agent'
  const outgoing = links.filter(
    (l) =>
      l.sourceWidgetId === sourceId &&
      l.enabled &&
      (sourceIsAgent || l.type === 'transform' || l.type === 'mirror')
  )
  for (const wire of outgoing) {
    const existing = debounceTimers.get(wire.id)
    if (existing) clearTimeout(existing)
    const gen = (wireGeneration.get(wire.id) ?? 0) + 1
    wireGeneration.set(wire.id, gen)
    debounceTimers.set(
      wire.id,
      setTimeout(() => {
        debounceTimers.delete(wire.id)
        void runWire(wire.id, gen)
      }, DEBOUNCE_MS)
    )
  }
}

// Run a single wire by id. `gen` lets a newer trigger supersede this one: if the
// generation moved on while we were awaiting the model, we drop the stale write.
async function runWire(wireId: string, gen: number): Promise<void> {
  const wire = useLinksStore.getState().links.find((l) => l.id === wireId)
  if (!wire || !wire.enabled) return
  const widgets = useWidgetStore.getState()
  const source = widgets.widgets.find((w) => w.id === wire.sourceWidgetId)
  const target = widgets.widgets.find((w) => w.id === wire.targetWidgetId)
  if (!source || !target) return

  const runStore = useWireRunStore.getState()

  // Deliver-as-is when it's a mirror wire, OR any non-transform wire leaving an
  // agent (so attaching a widget to an agent feeds it the agent's output).
  const deliverDirect =
    wire.type === 'mirror' || (source.kind === 'agent' && wire.type !== 'transform')
  if (deliverDirect) {
    const src = effectiveContent(source)

    // Table target: build it via the table AI (typed columns + rows), exactly
    // as if the user used the in-table assistant — never write text into a
    // table's id. Guarded so the same material isn't rebuilt repeatedly.
    if (target.kind === 'table') {
      if (!src.trim() || lastTableMaterial.get(wire.id) === src) return
      runStore.setError(wire.id, null)
      runStore.setRunning(wire.id, true)
      try {
        const res = await buildTableFromText(target.content, src, wire.verb)
        if (!res.ok) runStore.setError(wire.id, res.error ?? 'Could not build the table.')
        else {
          lastTableMaterial.set(wire.id, src)
          runStore.markRan(wire.id, Date.now())
        }
      } catch (e) {
        runStore.setError(wire.id, e instanceof Error ? e.message : String(e))
      } finally {
        runStore.setRunning(wire.id, false)
      }
      return
    }

    // Other targets: shape the text into the form that kind stores (a card's
    // title/body, a page's document, a field's value, plain text otherwise) so
    // the linked widget updates cleanly.
    const next = coerceToWidgetContent(target, src)
    if (next === target.content) return
    runStore.pulseWire(wire.id) // electric spark for the (instant) delivery
    writeCooldown.set(target.id, Date.now())
    await widgets.update(target.id, { content: next })
    runStore.markRan(wire.id, Date.now())
    return
  }

  // transform
  if (!wire.verb.trim()) {
    runStore.setError(wire.id, 'Add an instruction to this transform wire.')
    return
  }
  runStore.setError(wire.id, null)
  runStore.setRunning(wire.id, true)
  try {
    // If the source is a browser, hand main its LIVE rendered text so a
    // transform can read a logged-in page rather than a blind URL fetch.
    const liveText = source.kind === 'webview' ? (await extractWebviewText(source.id)) ?? undefined : undefined
    const res = await window.api.wires.runTransform(source.id, target.id, wire.verb, liveText)
    // Superseded by a newer edit while we were waiting — drop this result.
    if ((wireGeneration.get(wire.id) ?? gen) !== gen) return
    if (!res.ok) {
      runStore.setError(wire.id, res.error ?? 'Transform failed.')
      return
    }
    if (res.skipped || res.result === undefined) {
      // Model had nothing to add — a no-op, not a blank write.
      runStore.markRan(wire.id, Date.now())
      return
    }
    // The transform output is shaped for the target kind too: a transform into a
    // table builds the table; into a card/page it lands as title/body or a doc.
    if (target.kind === 'table') {
      await buildTableFromText(target.content, res.result)
      runStore.markRan(wire.id, Date.now())
      return
    }
    writeCooldown.set(target.id, Date.now())
    await widgets.update(target.id, { content: coerceToWidgetContent(target, res.result) })
    runStore.markRan(wire.id, Date.now())
  } catch (e) {
    runStore.setError(wire.id, e instanceof Error ? e.message : String(e))
  } finally {
    runStore.setRunning(wire.id, false)
  }
}

// Manual "Run now" from the wire editor — bypasses the debounce but keeps the
// supersede + cooldown guards.
export function runWireNow(wireId: string): void {
  const existing = debounceTimers.get(wireId)
  if (existing) {
    clearTimeout(existing)
    debounceTimers.delete(wireId)
  }
  const gen = (wireGeneration.get(wireId) ?? 0) + 1
  wireGeneration.set(wireId, gen)
  void runWire(wireId, gen)
}
