// Email body sanitiser — reduces a raw message body to just the user's own
// authored prose, with personal contact details redacted, before any of it is
// sent to the model for style learning or reply drafting. Kept dependency-free
// (no IMAP, no Anthropic, no electron) so it can be unit-tested in isolation.

// Markers that begin the quoted previous message in a reply/forward. Everything
// from the first match downward is someone else's text, not the user's voice.
const QUOTE_MARKERS = [
  /^>/, // standard quote prefix
  /^On .+wrote:\s*$/i, // Gmail/Apple attribution
  /^-----\s*Original Message\s*-----/i, // Outlook
  /^________+/, // Outlook horizontal divider
  /^From:\s.+@/i, // forwarded header block
  /^-{2,}\s*Forwarded message\s*-{2,}/i
]

// Lines that are signature delimiters or boilerplate footers — cut from here.
const SIGNATURE_MARKERS = [
  /^--\s*$/, // RFC sig delimiter
  /^—\s*$/,
  /^Sent from my /i,
  /^Sent via /i,
  /^Get Outlook for /i
]

// Whole lines to drop wherever they appear (legal footers, meeting boilerplate).
const DENYLIST = [
  /confidentiality notice/i,
  /this email and any attachments/i,
  /intended solely for/i,
  /join zoom meeting/i,
  /https?:\/\/[^\s]*zoom\.us/i,
  /unsubscribe/i
]

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const PHONE_IN_TEXT = /\+?\d[\d\s().-]{7,}\d/g

/**
 * Reduce an email body to just the user's own authored prose, with personal
 * contact details redacted. Safe to send to the model.
 */
export function sanitizeBody(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (QUOTE_MARKERS.some((re) => re.test(trimmed))) break
    if (SIGNATURE_MARKERS.some((re) => re.test(trimmed))) break
    if (DENYLIST.some((re) => re.test(trimmed))) continue
    kept.push(line)
  }
  return kept
    .join('\n')
    .replace(EMAIL_IN_TEXT, '[contact]')
    .replace(PHONE_IN_TEXT, '[contact]')
    .trim()
}
