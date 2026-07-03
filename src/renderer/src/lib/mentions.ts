// Pure @mention parsing shared by the chat renderer (highlighting) and the
// messaging store (mention-aware notifications). Lives in a .ts module so
// non-JSX callers (stores, unit tests) never import a .tsx file.

export const MENTION_RE = /@([a-z0-9._-]{2,32})/gi

export function bodyMentionsHandle(body: string, handle: string | null | undefined): boolean {
  if (!handle) return false
  const lower = handle.toLowerCase()
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (m[1].toLowerCase() === lower) return true
  }
  return false
}
