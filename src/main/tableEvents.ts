import { BrowserWindow } from 'electron'

// Row-change fan-out: the main process writes table rows behind the renderer's
// back (PlexiFlows on the 5-minute tick, form submissions, the local REST API,
// template application). The tables store caches rows forever, so those writes
// were invisible until an app restart — the "table missing data" report. Every
// main-side row write announces itself here; the renderer invalidates just the
// affected table's cache. Renderer-initiated writes also pass through, which
// costs one redundant refetch and guarantees convergence.
export function notifyRowsChanged(tableId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('tables:rowsChanged', tableId)
    } catch {
      // window may have closed mid-broadcast — ignore
    }
  }
}
