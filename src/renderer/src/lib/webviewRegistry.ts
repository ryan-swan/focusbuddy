interface Entry {
  widgetId: string
  el: HTMLElement
}

const byContentsId = new Map<number, Entry>()

export function registerWebview(webContentsId: number, widgetId: string, el: HTMLElement): void {
  byContentsId.set(webContentsId, { widgetId, el })
}

export function unregisterWebviewByContentsId(webContentsId: number): void {
  byContentsId.delete(webContentsId)
}

export function unregisterWebviewByWidgetId(widgetId: string): void {
  for (const [id, entry] of byContentsId) {
    if (entry.widgetId === widgetId) byContentsId.delete(id)
  }
}

export function lookupWebview(webContentsId: number): Entry | null {
  return byContentsId.get(webContentsId) ?? null
}

function elByWidgetId(widgetId: string): HTMLElement | null {
  for (const entry of byContentsId.values()) {
    if (entry.widgetId === widgetId) return entry.el
  }
  return null
}

// Extract the LIVE, rendered, authenticated text of a mounted browser widget by
// running document.body.innerText inside its <webview>. This is what lets a desk
// agent (or a transform wire) actually read a page the user is logged into —
// far better than a blind, unauthenticated server-side fetch of the URL. Returns
// null when the webview isn't mounted / ready, so callers can fall back to the
// fetch path.
export async function extractWebviewText(widgetId: string): Promise<string | null> {
  const el = elByWidgetId(widgetId)
  if (!el) return null
  try {
    const text = await (
      el as unknown as { executeJavaScript: (s: string) => Promise<unknown> }
    ).executeJavaScript('document.body ? document.body.innerText : ""')
    return typeof text === 'string' && text.trim() ? text.slice(0, 12000) : null
  } catch {
    return null
  }
}
