// The identity a retrieved source wears in the trace (facelift F2).
//
// Caleb's ruling, from the Claude-research reference: the trace is a
// credibility surface. Each source row carries a kind glyph coloured by the
// AREA it lives in — the same colour language the sidebar speaks, consumed
// from the canonical lib/areaTones mapping (never forked) — plus a
// right-aligned provenance slot naming that place, the way a web result names
// its domain. Colour answers WHERE, the glyph answers WHAT.

import { areaTone } from './areaTones'

export interface SourceIdentity {
  // Icon name — routed through the plexii interception like all chrome icons.
  icon: string
  // Text colour class from the canonical area mapping.
  tone: string
  // The provenance slot: where this source lives.
  location: string
}

const IDENTITIES: Record<string, SourceIdentity> = {
  knowledge: { icon: 'neurology', tone: areaTone('brain'), location: 'PlexiBrain' },
  doc: { icon: 'description', tone: areaTone('office'), location: 'Documents' },
  slides: { icon: 'slideshow', tone: areaTone('office'), location: 'Documents' },
  sheet: { icon: 'table_chart', tone: areaTone('office'), location: 'Documents' },
  map: { icon: 'description', tone: areaTone('office'), location: 'Documents' },
  design: { icon: 'gesture', tone: areaTone('office'), location: 'Documents' },
  task: { icon: 'desk', tone: areaTone('desks'), location: 'Desks' },
  table: { icon: 'table_chart', tone: areaTone('desks'), location: 'Tables' },
  note: { icon: 'edit_note', tone: areaTone('desks'), location: 'Desk notes' }
}

export function sourceIdentity(docType: string | undefined): SourceIdentity | null {
  if (!docType) return null
  return IDENTITIES[docType.trim().toLowerCase()] ?? null
}
