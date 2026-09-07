import { PLEXII_ICONS } from '../icons/plexiiIcons'

// The bell (DEC-076/077) — one path source, two renderings. The brand
// 'notifications' icon is a line SVG on currentColor; Icon's `filled` prop
// deliberately does not apply to brand icons, so the active state fills the
// SAME brand path solid. Shared by the desk widget frame and (DEC-125) the
// message row, so a bell means the same thing everywhere it appears.
export default function BellIcon({ size, active }: { size: number; active: boolean }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PLEXII_ICONS['notifications'] }}
    />
  )
}
