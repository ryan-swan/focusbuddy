import { motion } from 'framer-motion'
import Icon from '../Icon'

interface Props {
  // Is the pointer over THIS well right now?
  hovered: boolean
  // Show a small glyph on hover (only when the shape offers a real cell choice —
  // 2→3 / 3→4). The single 1→2 well stays label-free per the redesign spec.
  showGlyph?: boolean
  // Replace affordance (hovering an already-occupied pane at ≥2 panes). v1 routes
  // to the next empty cell instead of replacing, so this stays visual-only.
  replace?: boolean
}

// The translucent EMPTY drop-well (redesign — docs/FOCUS-SPLIT-REDESIGN-SPEC.md).
// A real grid child occupying the freed cell, NOT an overlay drawn on content —
// which is why overlap is structurally impossible. It reads as a calm sunken
// recess to drop into (empty, no dashes / no "DROP HERE" / no divider), warming
// to accent only under the cursor.
//
// The fill + recess shadow live in a CSS class (.fb-dropwell in globals.css) keyed
// on data-hovered — NOT inline style. framer-motion reconciles the `style` prop
// against `animate`, dropping static visual props; and it can't interpolate the
// token's `rgb(var(--accent) / a)` colour form. The class sidesteps both: motion
// only animates opacity/scale (the fade-in + magnetic nudge); CSS owns the look.
export default function DropWell({ hovered, showGlyph, replace }: Props): JSX.Element {
  return (
    <motion.div
      data-testid="focus-dropwell"
      data-hovered={hovered ? 'true' : 'false'}
      className="fb-dropwell relative h-full w-full rounded-lg overflow-hidden"
      aria-hidden
      initial={{ opacity: 0, scale: 0.995 }}
      // Room opens first; the well fades in ~60ms behind the reflow; magnetic nudge on hover.
      animate={{ opacity: 1, scale: hovered ? 1.012 : 1 }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.24, ease: [0.34, 1.56, 0.64, 1], delay: 0.06 },
        scale: { duration: 0.16, ease: [0.32, 0.72, 0, 1] }
      }}
    >
      {/* Contents: nothing at rest. Only on a genuine cell CHOICE (or a replace
          target) does a single quiet glyph fade in under the cursor. */}
      {hovered && showGlyph && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon
            name={replace ? 'swap_horiz' : 'add'}
            size={20}
            className="text-[rgb(var(--accent)/0.6)]"
          />
        </div>
      )}
    </motion.div>
  )
}
