import { MENTION_RE } from '../../../lib/mentions'

// Renders a chat message body with @handle mentions highlighted. A mention of
// the viewer gets the strong treatment (accent chip) so a scan of a busy
// conversation finds "where was I named" instantly; other mentions get a
// quieter emphasis. Detection is display-only — a token that happens to start
// with @ but matches nobody renders as plain text, so nothing is invented.

export default function MentionText({
  body,
  myHandle,
  knownHandles
}: {
  body: string
  myHandle: string | null | undefined
  knownHandles: Set<string>
}): JSX.Element {
  const parts: Array<JSX.Element | string> = []
  let last = 0
  let key = 0
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_RE.exec(body)) !== null) {
    const handle = m[1].toLowerCase()
    if (!knownHandles.has(handle)) continue // plain text, not a real member
    if (m.index > last) parts.push(body.slice(last, m.index))
    const isMe = myHandle != null && handle === myHandle.toLowerCase()
    parts.push(
      <span
        key={key++}
        className={
          isMe
            ? 'rounded px-1 bg-accent/20 text-accent font-medium'
            : 'rounded px-0.5 bg-white/15 font-medium'
        }
        data-testid={isMe ? 'mention-me' : 'mention'}
      >
        @{m[1]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (parts.length === 0) return <>{body}</>
  if (last < body.length) parts.push(body.slice(last))
  return <>{parts}</>
}
