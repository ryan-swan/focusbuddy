import { signalConfig } from './signalConfig'

// The side-by-side preview build must never sync against the PRODUCTION
// backend: a tester signing in with a real account would otherwise pull and
// push that account's synced workspace. Sync layers consult this flag; it is
// true only when BOTH the binary is the preview build AND the configured
// signal host is the production one. Pointing the preview at a local server
// (VITE_SIGNAL_HTTP_URL=http://localhost:8787 at build time) re-enables sync
// for test accounts, which is exactly the intended workflow.

const PROD_HOSTS = ['focusbuddy-signal.fly.dev']

let blocked = false
let resolved = false

export function initPreviewGuard(): void {
  if (resolved) return
  resolved = true
  void window.api?.app
    ?.isPreviewBuild?.()
    .then((preview) => {
      const prod = PROD_HOSTS.some((h) => signalConfig.httpUrl.includes(h))
      blocked = !!preview && prod
      if (blocked) {
        console.info('[previewGuard] preview build + production backend: workspace/cloud sync disabled')
      }
    })
    .catch(() => {})
}

export function previewSyncBlocked(): boolean {
  return blocked
}
