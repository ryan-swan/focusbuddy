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
 *
 * Since Attention S4 this is a thin client of the notification substrate: the
 * banner behavior is unchanged (focus gate, click-to-focus, live closure), and
 * every call ALSO posts a record-of-record through notifications:post — the
 * durable store that dedupes, rate-caps scheduled deliveries, and feeds the
 * not-escalated digest. `queue` names the substrate queue (default 'activity').
 */
export function notifyExternal(
  title: string,
  body: string,
  opts: { onClick?: () => void; force?: boolean; tag?: string; queue?: string } = {}
): void {
  if (!canNotify()) return
  // Skip when the user is already looking at the app, unless forced.
  const suppressedByFocus = !opts.force && document.hasFocus()
  // Record-of-record (fire-and-forget; a substrate hiccup never blocks a banner).
  try {
    void window.api.notifications
      .post({
        queue: opts.queue ?? 'activity',
        title,
        body,
        dedupeKey: opts.tag ? `live:${opts.queue ?? 'activity'}:${opts.tag}` : null,
        category: 'activity',
        layer: suppressedByFocus ? 'ambient' : 'interruptive',
        trigger: 'renderer-live',
        origin: 'system',
        alreadyDelivered: true
      })
      .catch(() => {})
  } catch {
    /* preload unavailable (tests) — banner path continues */
  }
  if (suppressedByFocus) return
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
