// Small "shared by <handle>" avatar shown next to a node that was accepted from
// someone else's share. The product has no uploaded profile images yet, so the
// avatar is a deterministic initial-in-a-coloured-circle derived from the
// sharer's handle (the adjective-animal identity the share carries). When real
// profile images land, swap the inner content for an <img> keyed on the handle.

const PALETTE = [
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#a855f7' // purple
]

function colorFor(handle: string): string {
  let h = 0
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]
}

export default function SharedBadge({
  handle,
  // Override the tooltip. Recipient side defaults to "Shared by <handle>";
  // the owner side passes "Shared with others" for a folder they shared OUT.
  label,
  testid = 'shared-badge'
}: {
  handle: string
  label?: string
  testid?: string
}): JSX.Element {
  const initial = (handle.trim()[0] || '?').toUpperCase()
  const tip = label ?? `Shared by ${handle}`
  return (
    <span
      className="inline-flex items-center justify-center h-4 w-4 rounded-full text-[8px] font-semibold text-white shrink-0 ring-1 ring-white/30"
      style={{ backgroundColor: colorFor(handle) }}
      title={tip}
      aria-label={tip}
      data-testid={testid}
    >
      {initial}
    </span>
  )
}
