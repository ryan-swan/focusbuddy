import { shell } from 'electron'

// Every hand-off to the operating system goes through here.
//
// shell.openExternal passes the string straight to the OS, which will act on
// whatever scheme it finds. A value that reaches it from user configuration or a
// server response can therefore carry more than a web link: `file:` opens local
// content, `smb:` reaches a network share (and on Windows leaks NTLM credentials
// to whoever owns it), and any registered scheme launches the application behind
// it. Only http and https are ever wanted here.
//
// Returns whether the URL was opened, so a caller can tell the user it refused
// rather than failing silently.
export async function openExternalSafe(rawUrl: unknown): Promise<boolean> {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return false

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    console.warn('[openExternal] refused a value that is not a URL')
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    console.warn(`[openExternal] refused non-web scheme: ${parsed.protocol}`)
    return false
  }

  await shell.openExternal(parsed.toString())
  return true
}
