import { useEffect, type RefObject } from 'react'
import { useWidgetStore } from '../stores/widgets'

// Grow a widget to show its whole content.
//
// A widget that clips its own text makes the user resize it before they can
// read it, which is work the canvas should have done. This is the behaviour
// StickyWidget already had, lifted out so every content widget gets it instead
// of one.
//
// Three rules keep it from being annoying, all of them from the sticky's
// original: it only ever GROWS (shrinking as you delete text moves the canvas
// under the reader), it is CAPPED per kind (a runaway paste must not fill the
// desk), and it does nothing for an inline render, where the widget is a
// preview inside something else and does not own its own height.
//
// It also stops once the user has resized past the cap, because at that point
// the size on screen is a decision they made and not a default to improve on.

export interface GrowToFitOptions {
  /** Hard ceiling in canvas pixels. */
  maxHeight: number
  /** Ignore an overflow smaller than this — sub-pixel and border noise. */
  threshold?: number
  /** Skip entirely (an inline/preview render owns no height of its own). */
  disabled?: boolean
}

/**
 * The decision, separated from the effect so it can be tested directly: given
 * what a widget currently is and what its content measures, what height should
 * it become? `null` means leave it alone.
 *
 * Pure and exported because this is where every rule lives — grow-only, capped,
 * threshold, and "not laid out yet" — and a rule nothing can assert is a rule
 * that drifts.
 */
export function growTarget(
  currentHeight: number,
  scrollHeight: number,
  clientHeight: number,
  maxHeight: number,
  threshold = 4
): number | null {
  // clientHeight 0 means it has not been laid out; the overflow would read as
  // the entire content and the widget would jump to its cap.
  if (clientHeight === 0) return null
  const overflow = scrollHeight - clientHeight
  if (overflow <= threshold) return null
  const target = Math.min(maxHeight, currentHeight + overflow)
  return target > currentHeight ? Math.round(target) : null
}

/**
 * Measure `ref`'s scroll overflow and grow the widget by it.
 *
 * `deps` should name whatever changes the rendered height — the text, the
 * editing mode, the row count — so the measurement re-runs when the content
 * actually changes rather than on every render.
 */
export function useGrowToFit(
  widget: { id: string; height: number },
  ref: RefObject<HTMLElement | null>,
  { maxHeight, threshold = 4, disabled = false }: GrowToFitOptions,
  deps: unknown[] = []
): void {
  const update = useWidgetStore((s) => s.update)
  useEffect(() => {
    if (disabled) return
    const el = ref.current
    if (!el) return
    const target = growTarget(widget.height, el.scrollHeight, el.clientHeight, maxHeight, threshold)
    if (target != null) void update(widget.id, { height: target })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, widget.height, disabled, maxHeight, threshold, update, ...deps])
}

// Per-kind ceilings. Roughly "a screenful and a half": tall enough that ordinary
// content is never clipped, short enough that one huge item cannot swallow the
// desk. A user can still resize past these by hand — the cap bounds what the
// canvas does on its own, not what the user is allowed.
export const GROW_MAX_HEIGHT: Record<string, number> = {
  sticky: 640,
  note: 720,
  markdown: 900,
  card: 560,
  'custom-block': 900,
  'living-doc': 900,
  field: 420
}
export const DEFAULT_GROW_MAX = 720
