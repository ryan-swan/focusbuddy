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
