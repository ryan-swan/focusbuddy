import type { CSSProperties } from 'react'

interface Props {
  name: string
  size?: number
  weight?: number
  filled?: boolean
  className?: string
  style?: CSSProperties
}

export default function Icon({
  name,
  size = 18,
  weight = 500,
  filled = true,
  className = '',
  style
}: Props): JSX.Element {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size,
        lineHeight: 1,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
        userSelect: 'none',
        flexShrink: 0,
        ...style
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
