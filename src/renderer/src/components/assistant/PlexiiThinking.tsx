// The Plexii thinking indicator (UI/UX mission P4): the double-i mark itself,
// its two i's breathing in alternation while Plexii retrieves or writes. The
// wait state IS the brand moment — there is no spinner anywhere in the AI.
//
// Geometry and motion constraints are plexidesk-75's spec, recorded in the
// mission PLAN: animate the i GROUPS (stem + dot together), opacity floor
// 0.4, scaleY 0.92-1.0 from the stem base, half-period alternation, never
// spin/bounce/translate, stroke 2.5 round-capped currentColor, minimum 12px.
// When work completes, the mark settles to the static double-i at full
// opacity — a settle, not a disappearance (hosts that unmount the indicator
// on completion simply never render the settled state).
//
// prefers-reduced-motion freezes it fully opaque and static (handled in CSS).

export default function PlexiiThinking({
  size = 16,
  active = true,
  className = ''
}: {
  size?: number
  active?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      data-testid="plexii-thinking"
      className={`${active ? 'fb-ii-breathing' : 'fb-ii-settled'} ${className}`.trim()}
    >
      <g className="ii-l">
        <path d="M9.4 4.9v.01" />
        <path d="M9.4 9.2v10" />
      </g>
      <g className="ii-r">
        <path d="M14.6 4.9v.01" />
        <path d="M14.6 9.2v10" />
      </g>
    </svg>
  )
}
