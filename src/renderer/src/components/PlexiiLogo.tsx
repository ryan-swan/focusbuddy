import navyWordmark from '../assets/brand/plexii-wordmark-navy.png'
import whiteWordmark from '../assets/brand/plexii-wordmark-white.png'

// The Plexii brand wordmark. The artwork is fixed-colour (navy ink + blue
// accent), so it can't sit on both a light and a dark surface as one image.
// We ship two variants and, by default, swap them the same way the rest of the
// app handles theme — Tailwind's `dark:` class utility — so the navy mark shows
// on light themes and the white mark shows on every dark theme (.dark /
// .futuristic / .atelier all carry the `dark` class). The blue accent is
// identical in both. Force `variant` for surfaces whose background is fixed
// regardless of the app theme (e.g. an always-dark modal in a portal).
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
  const wrapper = `inline-flex items-center select-none ${className}`

  if (variant === 'navy' || variant === 'white') {
    return (
      <span className={wrapper} role="img" aria-label="Plexii">
        <img
          src={variant === 'navy' ? navyWordmark : whiteWordmark}
          alt=""
          draggable={false}
          className="block w-auto"
          style={{ height }}
        />
      </span>
    )
  }

  return (
    <span className={wrapper} role="img" aria-label="Plexii">
      <img
        src={navyWordmark}
        alt=""
        draggable={false}
        className="block dark:hidden w-auto"
        style={{ height }}
      />
      <img
        src={whiteWordmark}
        alt=""
        draggable={false}
        className="hidden dark:block w-auto"
        style={{ height }}
      />
    </span>
  )
}
