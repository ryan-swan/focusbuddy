// Native application contracts (spec §76, §77, REQ-APP). Meeting capture obtains and
// records consent from all participants (APP-030) and AI-extracted decisions/actions
// are provisional pending human confirmation (APP-031). The Relationship Explorer
// traverses under permission filtering (APP-040, via GPH-010) and displays, for every
// edge, its evidence, confidence, discovery method and lifecycle state (APP-041).

import type { AppendInput } from '../db/eventStore'

// ── Meeting capture consent (APP-030) ────────────────────────────────────────
export interface Participant {
  id: string
  consented: boolean
}
// Recording/transcription may proceed only when every participant has consented,
// and the consent set is recorded (APP-030).
export function assertMeetingConsent(participants: Participant[]): void {
  const missing = participants.filter((p) => !p.consented).map((p) => p.id)
  if (missing.length > 0) throw new Error(`All participants MUST consent before recording: ${missing.join(', ')} (PLX-APP-030).`)
}
export function meetingConsentEvent(organisationId: string, actor: string, meetingId: string, participants: Participant[]): AppendInput {
  assertMeetingConsent(participants)
  return {
    eventType: 'MeetingConsentRecorded',
    category: 'user',
    actor,
    organisationId,
    objectId: meetingId,
    currentState: { meetingId, consentedParticipants: participants.map((p) => p.id) },
    changeSummary: `Consent recorded for ${participants.length} participant(s)`
  }
}

// ── Meeting AI extraction (APP-031) ──────────────────────────────────────────
export interface ExtractedItem {
  kind: 'decision' | 'action'
  text: string
  state: 'provisional'
  requiresConfirmation: true
}
// A decision or action extracted from a meeting by AI is created provisional and
// requires human confirmation before it becomes authoritative (APP-031).
export function extractMeetingItem(kind: 'decision' | 'action', text: string): ExtractedItem {
  return { kind, text, state: 'provisional', requiresConfirmation: true }
}

// ── Relationship Explorer edge display (APP-041) ─────────────────────────────
export interface EdgeDisplay {
  evidence: unknown[]
  confidence: number
  discoveryMethod: string
  state: string
}
// Every edge shown in the Explorer displays its evidence, confidence, discovery
// method and state, so a user can judge a provisional inference (APP-041).
export function edgeDisplay(rel: { evidence: unknown[]; confidence: number; discoveryMethod: string; state: string }): EdgeDisplay {
  if (!rel.evidence || rel.evidence.length === 0) throw new Error('An Explorer edge MUST display its evidence (PLX-APP-041).')
  return { evidence: rel.evidence, confidence: rel.confidence, discoveryMethod: rel.discoveryMethod, state: rel.state }
}
