// A synchronous read of the work-items capability for call sites that cannot
// await (context-menu builders run during a click). Probed once at load and
// refreshed on the Settings toggle — the same pattern the mention picker uses.

let enabled = false

function probe(): void {
  window.api?.workItems
    ?.enabled?.()
    .then((v: boolean) => {
      enabled = v
    })
    .catch(() => {})
}

probe()
window.addEventListener('fb:workitems-toggled', probe)

export function workItemsEnabled(): boolean {
  return enabled
}
