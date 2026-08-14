import type { DocType, FbNode, NodeDraft, NodePatch, Widget, WidgetDraft } from '@shared/types'

// The demo engine drives the REAL app — real nodes, real widgets, real stores.
// Nothing here is a mock: a demo run creates the same rows a user would, which
// is why every run is tracked for cleanup (see useDemo's exit()).
//
// Ported from the 3.3.5-era `Ryan-structural-changes` branch onto 4.0.1 and
// extended with the two capabilities a screen-recorded demo needs that the
// original lacked: camera moves, and the ability to open the assistant on cue.

export type DemoContext = {
  createNode: (draft: NodeDraft) => Promise<FbNode>
  updateNode: (id: string, patch: NodePatch) => Promise<void>
  createWidget: (draft: WidgetDraft) => Promise<Widget>
  updateWidgetContent: (id: string, content: string) => Promise<void>
  setActiveTask: (id: string) => void
  navigate: (deskId: string) => void
  typeInto: (setter: (text: string) => void, text: string, speedMs?: number) => Promise<void>
  delay: (ms: number) => Promise<void>

  /** Glide the canvas camera. Omitted fields hold their current value. */
  camera: (opts: { x?: number; y?: number; zoom?: number; ms?: number }) => Promise<void>
  /** Open or close the global assistant panel, optionally on a given tab. */
  assistant: (open: boolean, tab?: 'today' | 'chat' | 'agent' | 'tasks' | 'activity' | 'work') => void
  /**
   * Put an assistant reply into the AI Chat for the current desk.
   *
   * Deliberately scripted rather than a live model call: a recording cannot
   * afford a slow response, a missing key, or a different answer on take four.
   * To use the real model instead, swap this for chat's `send()` — same store.
   */
  chatSay: (content: string) => void

  /** Enter Focus (Stage Manager) on a widget, or pass null to return to canvas. */
  focus: (widgetId: string | null) => void
  /** Put a second widget beside the focused one — the side-by-side split view. */
  splitWith: (widgetId: string) => void
  /** Collapse the split back to a single pane. */
  unsplit: () => void

  /**
   * Run the canvas Tidy — the same auto-arrange the Tidy menu performs.
   * 'square' packs everything into a roughly square grid, which is the mode
   * that reads best on video.
   */
  tidy: (mode?: 'square' | 'vertical' | 'horizontal') => Promise<void>

  /**
   * Create a NATIVE Plexii document (doc / sheet / slides / map / design) and
   * place it on the desk as a widget. Returns both ids — the widget for layout
   * and focus, the document for writing into.
   */
  createDocWidget: (
    docType: DocType,
    title: string,
    box: { x: number; y: number; width: number; height: number }
  ) => Promise<{ widgetId: string; docId: string }>
  /** Write paragraphs into a native document, replacing its body. */
  writeDoc: (docId: string, paragraphs: string[]) => Promise<void>

  deskId: string | null
  setDeskId: (id: string) => void
  isCancelled: () => boolean
}

export type DemoStep = {
  /** The line shown in the caption pill. This is the script — edit freely. */
  caption: string
  /** Optional act label ("Monday"), shown as an eyebrow above the caption. */
  act?: string
  /**
   * Who is doing the typing in this step. On video there is no cursor and no
   * hands, so without this the viewer cannot tell a person writing a note from
   * the model drafting one. Renders as a chip on the caption.
   */
  actor?: 'you' | 'ai'
  /** How long to hold after the action resolves, before auto-advancing. */
  durationMs: number
  action: (ctx: DemoContext) => Promise<void>
}

export type DemoScenario = {
  id: number
  title: string
  subtitle?: string
  steps: DemoStep[]
}

/**
 * Ease a numeric triple over `ms` using requestAnimationFrame. Used for camera
 * moves so pans read as deliberate motion on video rather than a hard cut.
 */
export function tween(
  from: { x: number; y: number; zoom: number },
  to: { x: number; y: number; zoom: number },
  ms: number,
  apply: (v: { x: number; y: number; zoom: number }) => void
): Promise<void> {
  if (ms <= 0) {
    apply(to)
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    const start = performance.now()
    // easeInOutCubic — settles rather than stopping dead, which matters when
    // the viewer is watching the motion itself.
    const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    const frame = (now: number): void => {
      const t = Math.min(1, (now - start) / ms)
      const e = ease(t)
      apply({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e
      })
      if (t < 1) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })
}
