import { useState } from 'react'
import { cloudDocsEnabled, setCloudDocsEnabled } from '@office'
import { useAccountStore } from '@runtime'

// Settings toggle for cloud-document sync (PlexiOffice split, Phase 0). When on
// and signed in, documents sync to the account so they're available in PlexiDesk,
// the standalone PlexiOffice app, and later the web. Off by default; with it off
// documents are local-only, exactly as before.
export default function DocumentsSyncSection(): JSX.Element {
  const [on, setOn] = useState(() => cloudDocsEnabled())
  const signedIn = !!useAccountStore((s) => s.sessionToken)

  function toggle(next: boolean): void {
    setCloudDocsEnabled(next)
    setOn(next)
  }

  return (
    <div className="px-3 py-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-stone-400">Documents sync</div>
      <label className="flex items-center justify-between py-1 cursor-pointer">
        <span className="text-xs text-stone-700 dark:text-stone-300">
          Sync documents to your account <span className="text-stone-400">(beta)</span>
        </span>
        <input
          type="checkbox"
          data-testid="settings-clouddocs-toggle"
          checked={on}
          onChange={(e) => toggle(e.target.checked)}
          className="h-3.5 w-3.5 accent-violet-600 cursor-pointer"
        />
      </label>
      <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
        {on
          ? signedIn
            ? 'Your documents sync across PlexiDesk and PlexiOffice. Local copies stay on this device too.'
            : 'Sign in above to start syncing — until then documents stay on this device.'
          : 'Documents are stored only on this device. Turn on to make them available in PlexiOffice and on your other devices.'}
      </p>
    </div>
  )
}
