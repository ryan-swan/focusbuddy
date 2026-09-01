// DEC-073 — the New Desk flow's default title. A desk created from the header
// button pre-fills with the moment it was made ("Aug 30, 12:45 PM") so a bare
// Enter files something findable and chronological; the field arrives focused
// and fully selected, so overwriting costs one keystroke, not a select-all.
export function defaultDeskTitle(now: Date = new Date()): string {
  return now.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
