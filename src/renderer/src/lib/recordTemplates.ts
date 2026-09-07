// M2c (SPEC-003 §3.5) — the Brief's templates. Four ship, each defining the
// section headings the Enhance pass writes under. The COMMITMENTS rendering
// is deliberately not templated — its shape is the product. Per the spec's
// own instruction this is a section-list registry, not a second template
// MECHANISM: the desk-template system stays the only layout engine, and
// these become desk-template fields when the Record widget lands on the
// meeting desk.

export interface RecordTemplate {
  id: string
  name: string
  sections: string[]
}

export const RECORD_TEMPLATES: RecordTemplate[] = [
  { id: 'decisions', name: 'Decisions & Actions', sections: ['What happened', 'Decisions', 'Open questions'] },
  { id: 'client', name: 'Client Call', sections: ['Context', 'What they need', 'Commitments', 'Risks'] },
  { id: 'one-on-one', name: '1:1', sections: ['How things are going', 'Wins', 'Concerns', 'Agreed next steps'] },
  { id: 'interview', name: 'Interview', sections: ['Background', 'Signals', 'Concerns', 'Where this leans'] }
]

export const DEFAULT_RECORD_TEMPLATE = RECORD_TEMPLATES[0]
