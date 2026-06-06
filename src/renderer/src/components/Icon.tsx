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
  weight,
  filled,
  className = '',
  style
}: Props): JSX.Element {
  // Icons that don't pass an explicit weight/fill inherit the global Theme
  // studio preference via CSS vars (--fb-icon-wght / --fb-icon-fill), which
  // default to the originals (500 / filled). Icons that DO pass a value —
  // usually to signal an active or semantic state — keep their explicit
  // setting, so customisation never changes meaning.
  const wght = weight === undefined ? 'var(--fb-icon-wght, 500)' : weight
  const fill = filled === undefined ? 'var(--fb-icon-fill, 1)' : filled ? 1 : 0
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size,
        lineHeight: 1,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${wght}, 'GRAD' 0, 'opsz' 24`,
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
