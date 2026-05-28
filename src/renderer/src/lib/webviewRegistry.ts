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
