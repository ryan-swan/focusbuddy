import type { ReactNode } from 'react'

// DEC-136 / DEC-137 — a section title inside the meeting Record wears a
// filled block: the pane's own in-card fill, the sunken surface the segmented
// track and the fields already sit on — the way the meeting header wears its
// card (DEC-135). Operator: "Now do the same for the Overview and Analytics
// tabs", then "…for the Action items tab". Just the title field: the
// section's content stays on the pane beneath it. Shared here because the
// Action items tab's "Carried from last time" lives in
// MeetingCommitmentsCard, and the Record's transcript toggle is the same band
// as a button (it takes the class constant).
export const RECORD_SECTION_BAND = 'rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3 py-1.5 mb-2'

export default function RecordSectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className={RECORD_SECTION_BAND} data-record-section-title>
      <h2 className="text-[13.5px] font-semibold tracking-tight text-[var(--ink-100)]">{children}</h2>
    </div>
  )
}
