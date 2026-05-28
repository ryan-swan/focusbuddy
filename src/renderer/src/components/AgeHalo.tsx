import { ageHaloOpacity, useTimeOfDay } from '../lib/timeOfDay'

interface Props {
  createdAt: number
  variant?: 'widget' | 'section'
}

// Soft warm ring around a widget that intensifies the longer it's been on the desk.
// Helps externalize time for the ADHD brain — "this thing has been here a while" felt visually.
export default function AgeHalo({ createdAt, variant = 'widget' }: Props): JSX.Element | null {
  useTimeOfDay() // subscribe to minute ticks so the halo updates as the widget ages
  const o = ageHaloOpacity(createdAt)
  if (o <= 0) return null

  const inset = variant === 'section' ? -1 : -2
  const radius = variant === 'section' ? 10 : 8
  // Section halos are slightly cooler/softer than widgets so they don't compete with the
  // section's own colored border.
  const hue = variant === 'section' ? 30 : 35
  const sat = variant === 'section' ? 45 : 60

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset,
        borderRadius: radius,
        pointerEvents: 'none',
        zIndex: -1,
        boxShadow:
          `0 0 0 1px hsla(${hue}, ${sat}%, 50%, ${(0.32 * o).toFixed(3)}),` +
          `0 0 ${(6 + 14 * o).toFixed(1)}px hsla(${hue}, ${sat + 10}%, 45%, ${(0.22 * o).toFixed(3)})`,
        transition: 'box-shadow 1.2s ease-out'
      }}
    />
  )
}
