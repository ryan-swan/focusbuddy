// The Plexii brand wordmark (Brand Motion mission, 2026-08-23). Formerly two
// fixed-colour PNGs; now the kit's vector wordmark via PlexiiMark, so it takes
// theme colour (ii = accent, letters = ink), blinks once on mount, and winks
// on hover — never looping at rest. The old `variant` API survives for the
// fixed-background surfaces: 'navy' pins the master light-surface colours,
// 'white' pins the dark-surface colours (brand blues per the kit's contrast
// table); 'auto' follows the theme tokens.
import PlexiiMark from './brand/PlexiiMark'

const FIXED = {
  navy: { letterColor: '#08214F', color: '#0B64E8' },
  white: { letterColor: '#FFFFFF', color: '#1477FF' }
} as const

export default function PlexiiLogo({
  height = 20,
  className = '',
  variant = 'auto'
}: {
  // Rendered height in px; width scales to the wordmark's aspect ratio.
  height?: number
  className?: string
  variant?: 'auto' | 'navy' | 'white'
}): JSX.Element {
  const fixed = variant === 'auto' ? undefined : FIXED[variant]
  return (
    <PlexiiMark
      wordmark
      height={height}
      className={className}
      motion="once+hover"
      {...(fixed ?? {})}
    />
  )
}
