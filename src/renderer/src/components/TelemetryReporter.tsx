// Reports this machine's usage snapshot to the signal server while signed in,
// so the admin Analytics tab shows real usage. Aggregate counts only (gathered
// by the main process from the local database), never titles or content. Best
// effort: a failed report never disturbs the app. Mounted once.

import { useEffect } from 'react'
import { useAccountStore } from '../stores/account'
import { signalConfig } from '../lib/signalConfig'

const REPORT_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours while open

export default function TelemetryReporter(): null {
  const sessionToken = useAccountStore((s) => s.sessionToken)

  useEffect(() => {
    if (!sessionToken) return
    let cancelled = false

    async function report(): Promise<void> {
      try {
        const snapshot = await window.api.ai.collectTelemetry()
        if (cancelled) return
        await fetch(`${signalConfig.httpUrl}/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify(snapshot)
        })
      } catch {
        // Telemetry is non-critical; never surface an error.
      }
    }

    // Report a few seconds after sign-in settles, then on an interval.
    const first = window.setTimeout(() => void report(), 8000)
    const interval = window.setInterval(() => void report(), REPORT_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [sessionToken])

  return null
}
