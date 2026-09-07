// C5 round — the moment anchor as a URL.
//
// DEC-091 gave work items a source_url deep link, and DEC-102 left the
// meeting version as a named sliver: a filed commitment knows its MEETING
// (sourceRef, the DEC-079 chip) but not its MOMENT. This closes it: an
// internal plexii:// URL that names the meeting AND the segment, so the
// Attention chip lands the Thread scrolled to the exact quoted line —
// fb:open-meeting has carried an optional segmentId since M4.
//
// The scheme is app-internal by design. The chip PARSES before it opens:
// an internal URL routes inside Plexii; anything else still goes to the
// system browser exactly as before (DEC-091's web marks are untouched).

const PREFIX = 'plexii://meeting/'

export function buildMeetingMomentUrl(meetingId: string, segmentId?: string | null): string {
  const base = `${PREFIX}${encodeURIComponent(meetingId)}`
  return segmentId ? `${base}?seg=${encodeURIComponent(segmentId)}` : base
}

export function parseMeetingMomentUrl(
  url: string | null | undefined
): { meetingId: string; segmentId: string | null } | null {
  if (!url || !url.startsWith(PREFIX)) return null
  const rest = url.slice(PREFIX.length)
  const q = rest.indexOf('?')
  const meetingId = decodeURIComponent(q === -1 ? rest : rest.slice(0, q))
  if (!meetingId) return null
  let segmentId: string | null = null
  if (q !== -1) {
    const m = /(?:^|&)seg=([^&]+)/.exec(rest.slice(q + 1))
    if (m) segmentId = decodeURIComponent(m[1])
  }
  return { meetingId, segmentId }
}

// ── The brief wire (Q14 — briefs for other attendees) ───────────────────────
// A brief travels as a PlexiChat DM: readable prose for the human, plus one
// trailing plexii://brief URL the recipient's client parses to offer the
// per-series follow. An old client simply shows a normal, useful message —
// the machine layer degrades to prose, never to noise.

const BRIEF_PREFIX = 'plexii://brief/'

export function buildBriefUrl(seriesId: string, meetingId: string): string {
  return `${BRIEF_PREFIX}${encodeURIComponent(seriesId)}?meeting=${encodeURIComponent(meetingId)}`
}

export function parseBriefUrl(
  url: string | null | undefined
): { seriesId: string; meetingId: string | null } | null {
  if (!url || !url.startsWith(BRIEF_PREFIX)) return null
  const rest = url.slice(BRIEF_PREFIX.length)
  const q = rest.indexOf('?')
  const seriesId = decodeURIComponent(q === -1 ? rest : rest.slice(0, q))
  if (!seriesId) return null
  let meetingId: string | null = null
  if (q !== -1) {
    const m = /(?:^|&)meeting=([^&]+)/.exec(rest.slice(q + 1))
    if (m) meetingId = decodeURIComponent(m[1])
  }
  return { seriesId, meetingId }
}

/** Compose the DM body. The marker URL is the LAST line by contract. */
export function buildBriefMessage(input: {
  title: string
  summary: string
  seriesId: string
  meetingId: string
}): string {
  return `📋 Meeting brief — ${input.title}

${input.summary.trim()}

${buildBriefUrl(input.seriesId, input.meetingId)}`
}

/** Parse a DM body back into a brief, or null when it is not one. */
export function parseBriefMessage(
  body: string | null | undefined
): { title: string; summary: string; seriesId: string; meetingId: string | null } | null {
  if (!body) return null
  const lines = body.split('\n')
  const wire = parseBriefUrl(lines[lines.length - 1]?.trim())
  if (!wire) return null
  const head = lines[0] ?? ''
  const m = /^📋 Meeting brief — (.+)$/.exec(head.trim())
  if (!m) return null
  const summary = lines.slice(1, -1).join('\n').trim()
  return { title: m[1], summary, seriesId: wire.seriesId, meetingId: wire.meetingId }
}
