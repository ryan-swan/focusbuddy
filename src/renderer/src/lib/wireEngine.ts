import { create } from 'zustand'
import type { Widget, WidgetLink } from '@shared/types'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import { parseAgent } from './deskAgent'
import { extractWebviewText } from './webviewRegistry'
import { buildTableFromText } from './tableAiBuild'
import { coerceToWidgetContent, textToTiptap } from './widgetContentFormat'

// The content that flows OUT of a widget along a wire. For a desk agent that is
// its latest output (not its raw JSON config), so an agent can feed a note via a
// mirror wire or be the source of a transform. Everything else flows its content.
function effectiveContent(w: Widget): string {
  if (w.kind === 'agent') return parseAgent(w.content).lastOutput ?? ''
  // An inbound-hook stores { hookId, url, lastPayload } — what flows out of it on a
  // wire is the last received payload, not its config blob.
  if (w.kind === 'inbound-hook') {
    try {
      return (JSON.parse(w.content || '{}').lastPayload as string) ?? ''
    } catch {
      return ''
    }
  }
  return w.content ?? ''
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
  setError: (wireId, error) => {
    set((s) => {
      const errors = { ...s.errors }
      if (error) errors[wireId] = error
      else delete errors[wireId]
      return { errors }
    })
    // Persist a real error durably so it survives a reload and feeds the badge +
    // Automations panel. The null-clear isn't persisted here; markRan clears the
    // durable error on the next completed run, so a success wipes it.
    if (error) void useLinksStore.getState().update(wireId, { lastError: error })
  },
  markRan: (wireId, at) => {
    set((s) => ({ lastRunAt: { ...s.lastRunAt, [wireId]: at } }))
    // Durable: a completed run stamps last_run_at and clears any prior error, so
    // freshness (live / stale / just-ran) survives a reload (widget-link-owner).
    void useLinksStore.getState().update(wireId, { lastRunAt: at, lastError: '' })
  },
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
  const allWidgets = useWidgetStore.getState().widgets
  const sourceIsAgent = allWidgets.find((w) => w.id === sourceId)?.kind === 'agent'
  // A wire INTO a webhook is always reactive (its whole point is to send out on
  // change), whatever its type — same "attaching to it means deliver here" logic
  // as an agent's inputs.
  const targetIsWebhook = (id: string): boolean =>
    allWidgets.find((w) => w.id === id)?.kind === 'webhook'
  const outgoing = links.filter(
    (l) =>
      l.sourceWidgetId === sourceId &&
      l.enabled &&
      (sourceIsAgent || l.type === 'transform' || l.type === 'mirror' || targetIsWebhook(l.targetWidgetId))
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

  // Honest guard: PlexiDesk can't read binary media text yet (no PDF/image/video
  // extractor anywhere in the app — confirmed by files:suggestTags treating binary
  // files as name-only). So a wire from one has nothing real to send; say so on the
  // wire instead of feeding the AI a URL and producing a hollow result.
  if (source.kind === 'pdf' || source.kind === 'image' || source.kind === 'video') {
    const label = source.kind === 'pdf' ? "a PDF's" : `a ${source.kind}'s`
    runStore.setError(
      wire.id,
      `PlexiDesk can't read ${label} text yet, so there's nothing to send. Use a Browser, Note, Page, Document or Table as the source.`
    )
    return
  }

  // Outbound webhook target: POST the source content to the widget's URL instead
  // of writing into it (Lever 3, Phase 0). The wire's run status reports the send.
  if (target.kind === 'webhook') {
    await sendWebhook(wire, source, target)
    return
  }

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
      // The instruction driving the table update is the agent's instruction
      // (so "complete task X" updates that row) or the wire's verb.
      const instruction =
        source.kind === 'agent' ? parseAgent(source.content).instruction : wire.verb
      const dedupKey = `${instruction} ${src}`
      // Checked, nothing new to build — still counts as a run, so freshness
      // clears (else the wire reads "stale forever" against content it already
      // processed).
      if (!src.trim() || lastTableMaterial.get(wire.id) === dedupKey) {
        runStore.markRan(wire.id, Date.now())
        return
      }
      runStore.setError(wire.id, null)
      runStore.setRunning(wire.id, true)
      try {
        const res = await buildTableFromText(target.content, src, instruction)
        if (!res.ok) runStore.setError(wire.id, res.error ?? 'Could not build the table.')
        else {
          lastTableMaterial.set(wire.id, dedupKey)
          runStore.markRan(wire.id, Date.now())
        }
      } catch (e) {
        runStore.setError(wire.id, e instanceof Error ? e.message : String(e))
      } finally {
        runStore.setRunning(wire.id, false)
      }
      return
    }

    // Other targets: office docs write to the doc body; everything else is shaped
    // by coerceToWidgetContent. A kind that can't hold text surfaces an honest
    // error rather than silently doing nothing.
    if (!src.trim()) {
      runStore.markRan(wire.id, Date.now()) // nothing to deliver yet
      return
    }
    await deliverTextToTarget(wire, source, target, src)
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
    // The transform output is shaped for the target kind: a transform into a
    // table builds the table; into a Page/Note/Card it lands as prose; into a
    // Document it writes the doc body; an unsupported target says so honestly.
    if (target.kind === 'table') {
      await buildTableFromText(target.content, res.result, wire.verb)
      runStore.markRan(wire.id, Date.now())
      return
    }
    await deliverTextToTarget(wire, source, target, res.result)
  } catch (e) {
    runStore.setError(wire.id, e instanceof Error ? e.message : String(e))
  } finally {
    runStore.setRunning(wire.id, false)
  }
}

// Record a durable before/after of a reactive-wire write, so the user can see
// what an automation did and revert it (the trust layer). Best-effort: history
// must never break the write itself, so failures are swallowed. Skips no-ops.
function recordWireWrite(
  wire: WidgetLink,
  source: Widget,
  target: Widget,
  prev: string,
  next: string
): void {
  if (prev === next) return
  try {
    void window.api.wireRuns.record({
      wireId: wire.id,
      taskId: wire.taskId,
      sourceWidgetId: source.id,
      targetWidgetId: target.id,
      sourceLabel: source.title?.trim() || source.kind,
      wireType: wire.type,
      verb: wire.verb ?? '',
      at: Date.now(),
      prevContent: prev ?? '',
      nextContent: next ?? ''
    })
  } catch {
    // Non-fatal — the write already happened; the history entry is best-effort.
  }
}

// POST a source's content to an outbound webhook widget's configured URL. Honest
// status only — a failed send surfaces as the wire's error, never a fake success.
async function sendWebhook(wire: WidgetLink, source: Widget, target: Widget): Promise<void> {
  const runStore = useWireRunStore.getState()
  const src = effectiveContent(source)
  let url = ''
  try {
    url = (JSON.parse(target.content || '{}').url as string) || ''
  } catch {
    url = ''
  }
  if (!url.trim()) {
    runStore.setError(wire.id, 'Add a URL to this webhook before sending.')
    return
  }
  runStore.setError(wire.id, null)
  runStore.setRunning(wire.id, true)
  try {
    const res = await window.api.webhooks.send({ url, body: src })
    if (!res.ok) runStore.setError(wire.id, res.error ?? 'Send failed.')
    else runStore.markRan(wire.id, Date.now())
  } catch (e) {
    runStore.setError(wire.id, e instanceof Error ? e.message : String(e))
  } finally {
    runStore.setRunning(wire.id, false)
  }
}

const FRIENDLY_KIND: Partial<Record<Widget['kind'], string>> = {
  agent: 'desk agent',
  timer: 'timer',
  color: 'colour picker',
  calculator: 'calculator',
  webview: 'browser',
  section: 'section',
  portal: 'portal',
  streamdeck: 'SpeedDeck',
  minimap: 'minimap',
  chart: 'chart',
  diagram: 'diagram',
  scratchpad: 'scratchpad',
  'task-link': 'task link',
  'local-app-launcher': 'app launcher'
}

// Write an office Document (Word/Sheet/Slides) target. Its widget.content is a
// document id, so we write into the document BODY, not the widget. Only Word docs
// take free text today (their body is Tiptap, same as a Page); sheets/decks say so
// honestly rather than silently doing nothing.
async function writeToOfficeDoc(
  wire: WidgetLink,
  target: Widget,
  text: string
): Promise<void> {
  const runStore = useWireRunStore.getState()
  if (target.kind !== 'doc') {
    runStore.setError(
      wire.id,
      `A ${target.kind === 'sheet' ? 'spreadsheet' : 'slide deck'} can't receive wired text yet — point this at a Page, Note, Table or Document.`
    )
    return
  }
  const docId = (target.content ?? '').trim()
  if (!docId) {
    runStore.setError(wire.id, "This Document isn't saved yet, so there's nowhere to write.")
    return
  }
  try {
    const doc = await window.api.documents.get(docId)
    if (!doc) {
      runStore.setError(wire.id, 'The linked Document no longer exists.')
      return
    }
    const tiptap = JSON.parse(textToTiptap(text)) as Record<string, unknown>
    const prevBody = doc.body as Record<string, unknown> | null
    // Preserve brand heading styles if the body carries them; otherwise the body
    // IS the Tiptap doc.
    const body =
      prevBody && typeof prevBody === 'object' && 'headingStyles' in prevBody
        ? ({ ...prevBody, doc: tiptap } as never)
        : (tiptap as never)
    runStore.pulseWire(wire.id)
    await window.api.documents.update(docId, { body }, 'Updated by a wire')
    runStore.markRan(wire.id, Date.now())
  } catch (e) {
    runStore.setError(wire.id, e instanceof Error ? e.message : 'Could not write to the Document.')
  }
}

// Deliver text into a NON-table target: office docs write to the doc body; every
// other kind is shaped by coerceToWidgetContent. A kind that can't hold text now
// surfaces an honest, visible reason on the wire instead of silently doing nothing
// (the old behaviour that made wires feel dead).
async function deliverTextToTarget(
  wire: WidgetLink,
  source: Widget,
  target: Widget,
  text: string
): Promise<void> {
  const runStore = useWireRunStore.getState()
  const widgets = useWidgetStore.getState()
  if (target.kind === 'doc' || target.kind === 'sheet' || target.kind === 'slides') {
    await writeToOfficeDoc(wire, target, text)
    return
  }
  const next = coerceToWidgetContent(target, text)
  if (next === null) {
    runStore.setError(
      wire.id,
      `A ${FRIENDLY_KIND[target.kind] ?? target.kind} can't receive text from a wire. Point it at a Page, Note, Card, Sticky, Table or Document.`
    )
    return
  }
  if (next === target.content) {
    runStore.markRan(wire.id, Date.now()) // ran, nothing new to write
    return
  }
  runStore.pulseWire(wire.id)
  writeCooldown.set(target.id, Date.now())
  const prev = target.content
  await widgets.update(target.id, { content: next })
  recordWireWrite(wire, source, target, prev, next)
  runStore.markRan(wire.id, Date.now())
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
