// Desktop notifications for things that happen while you are not looking at the
// app: a new message, an incoming call, a knock. Deliberately quiet — a
// notification only fires when the app window does not have focus, so you never
// get a banner for a message in the conversation you are already reading.
// Clicking the banner brings the window forward and runs an optional action.

let supported: boolean | null = null

function canNotify(): boolean {
  if (supported === null) {
    supported = typeof Notification !== 'undefined'
  }
  return supported === true
}

/**
 * Fire a desktop notification, but only when the app is in the background. Pass
 * `force: true` for things that should alert even with the app focused (an
 * incoming call). The optional onClick runs after the window is brought forward.
 */
export function notifyExternal(
  title: string,
  body: string,
  opts: { onClick?: () => void; force?: boolean; tag?: string } = {}
): void {
  if (!canNotify()) return
  // Skip when the user is already looking at the app, unless forced.
  if (!opts.force && document.hasFocus()) return
  try {
    const n = new Notification(title, { body, tag: opts.tag, silent: false })
    n.onclick = () => {
      void window.api.app.focusWindow()
      opts.onClick?.()
      n.close()
    }
  } catch {
    // Notifications can be unavailable or denied; never let that break the flow.
  }
}
