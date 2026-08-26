import { useEffect, useState } from 'react'
import { useWorkItemStore } from '../../stores/workItems'

// V2 (DEC-023): the Attention layer's real switch. `workItems.enabled` was a
// file-edit-only flag; anyone besides the operator needs a visible control
// with honest copy. Toggling applies live: prompt vocabulary reads the pref
// per call, and the surfaces that probed it at boot (⌘K capture entry, the
// top-bar badge) re-probe on the fb:workitems-toggled event.

export default function AttentionSection(): JSX.Element {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.workItems
      .enabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
  }, [])

  async function toggle(next: boolean): Promise<void> {
    setBusy(true)
    try {
      const now = await window.api.workItems.setEnabled(next)
      setEnabled(now)
      window.dispatchEvent(new CustomEvent('fb:workitems-toggled', { detail: { enabled: now } }))
      await useWorkItemStore.getState().refresh()
      window.dispatchEvent(new CustomEvent('fb:workitems-changed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-3 py-3 border-t border-[var(--edge-soft)]">
      <div className="fb-t-caption uppercase tracking-[0.12em] font-medium mb-1">Attention</div>
      <label className="flex items-start justify-between gap-3 py-1.5 cursor-pointer">
        <div className="min-w-0">
          <div className="text-xs text-[var(--ink-70)]">Attention layer</div>
          <div className="fb-t-caption text-[var(--ink-50)] leading-snug">
            The capture console (@attention in ⌘K), AI routing of reminders, reviews and
            loose thoughts, the Attention page and its notifications. Off = none of it
            runs and the AI never files work items; anything already captured stays and
            shows again when you turn it back on.
          </div>
        </div>
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null || busy}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-accent cursor-pointer shrink-0"
        />
      </label>
    </div>
  )
}
