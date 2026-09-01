// M1 (SPEC-003 §3.8, S3-DEC-024) — meeting recording consent, the pure half.
//
// The rules this encodes, verbatim from the ruling:
//   - Recording is OFF until a person starts it. No calendar rule, no saved
//     preference, no rejoin ever starts a recording.
//   - Starting PROMPTS every participant: accept / accept-without-transcript /
//     decline. Until someone answers they are 'pending' and their audio is
//     not captured.
//   - A decline is honoured by CONSTRUCTION: that participant's stream is
//     never tapped — retention settings govern what we keep, never what we
//     may capture.
//   - The header names the state in words, continuously, for everyone.
//
// This module is deliberately free of sockets, streams and stores so the
// whole decision table is unit-testable. The store applies it; the recorder
// obeys `mayCapture`; the header renders `consentSummary`.

export type ConsentChoice = 'accepted' | 'no-transcript' | 'declined'
export type ConsentEntry = ConsentChoice | 'pending'

/** accountId → state. The initiator is 'accepted' by their own act of
 *  starting; everyone else begins 'pending'. */
export type ConsentMap = Record<string, ConsentEntry>

/** May this participant's audio be captured at all? Only an explicit yes —
 *  pending is a no (capture starts when they answer, not before), declined
 *  is a no forever. 'no-transcript' audio IS captured (they allowed the
 *  recording) but is excluded from transcription downstream (M2). */
export function mayCapture(entry: ConsentEntry | undefined): boolean {
  return entry === 'accepted' || entry === 'no-transcript'
}

/** Build the starting map when recording begins: initiator consented by
 *  starting; every other present participant owes an answer. */
export function initialConsent(initiatorId: string, participantIds: string[]): ConsentMap {
  const m: ConsentMap = { [initiatorId]: 'accepted' }
  for (const id of participantIds) if (id !== initiatorId) m[id] = 'pending'
  return m
}

/** The header sentence — state named in words (§3.8), never an icon alone.
 *  `names` resolves accountIds for the pending/declined clauses. */
export function consentSummary(
  recording: boolean,
  consent: ConsentMap,
  names: (accountId: string) => string
): string {
  if (!recording) return 'Not recording'
  const entries = Object.entries(consent)
  const total = entries.length
  const pending = entries.filter(([, v]) => v === 'pending').map(([id]) => names(id))
  const declined = entries.filter(([, v]) => v === 'declined').map(([id]) => names(id))
  const consented = entries.filter(([, v]) => mayCapture(v)).length
  const parts: string[] = []
  if (pending.length === 0 && declined.length === 0) {
    parts.push(total === 1 ? 'Recording · only you' : `Recording · all ${total} consented`)
  } else {
    parts.push(`Recording · ${consented} of ${total} consented`)
    if (pending.length)
      parts.push(
        `${listNames(pending)} ${pending.length === 1 ? 'has' : 'have'} not responded`
      )
  }
  if (declined.length) parts.push(`${listNames(declined)} declined (not recorded)`)
  return parts.join(' — ')
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

// ── The wire envelope (rides the existing meetingSignal relay) ──────────────
// Sent point-to-point to every roster member; no server changes. The kinds
// are namespaced so they can never collide with SDP/ICE/screen envelopes.

export type ConsentWire =
  | { kind: 'consent-request'; by: string; byName: string }
  | { kind: 'consent-response'; choice: ConsentChoice }
  | { kind: 'consent-state'; by: string; consent: ConsentMap }
  | { kind: 'recording-stopped' }

export function isConsentWire(data: { kind?: string }): data is ConsentWire {
  return (
    data.kind === 'consent-request' ||
    data.kind === 'consent-response' ||
    data.kind === 'consent-state' ||
    data.kind === 'recording-stopped'
  )
}
