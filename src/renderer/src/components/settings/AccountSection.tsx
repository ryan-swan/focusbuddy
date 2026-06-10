// Account section of the Settings panel. This is the persistent home for
// signing in and out, which previously only existed as the boot modal with no
// way back to it and no sign-out at all. Signed in, it shows who you are, your
// plan, and a Sign out button. Signed out, it explains the benefit and opens
// the same sign-in modal on demand.

import { useState } from 'react'
import { useAccountStore } from '../../stores/account'
import { useSignInPrompt } from '../../stores/signInPrompt'
import { useCapabilityStore } from '../../stores/capabilities'
import Icon from '../Icon'

export default function AccountSection(): JSX.Element {
  const account = useAccountStore((s) => s.account)
  const signOut = useAccountStore((s) => s.signOut)
  const requestSignIn = useSignInPrompt((s) => s.requestOpen)
  const effectiveTier = useCapabilityStore((s) => s.effectiveTier)
  const refreshCaps = useCapabilityStore((s) => s.refresh)
  const [busy, setBusy] = useState(false)

  async function handleSignOut(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await signOut()
      // Drop back to the free capability map immediately.
      await refreshCaps()
    } finally {
      setBusy(false)
    }
  }

  const planLabel =
    effectiveTier === 'team' ? 'Team' : effectiveTier === 'pro' ? 'Pro' : 'Free'

  return (
    <div className="px-3 py-3 border-t border-stone-200 dark:border-stone-700 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium">
        Account
      </div>

      {account ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[13px] font-semibold bg-accent/15 text-accent shrink-0">
              {(account.handle || account.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] font-medium text-stone-900 dark:text-stone-100 truncate"
                data-testid="account-identity"
              >
                {account.handle || account.email}
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                {account.email}
                <span className="mx-1.5 text-stone-400 dark:text-stone-600">·</span>
                <span data-testid="account-plan">{planLabel} plan</span>
              </div>
            </div>
            <button
              onClick={() => void handleSignOut()}
              disabled={busy}
              data-testid="account-signout"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
            >
              <Icon name="logout" size={13} />
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
          <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
            Your local data stays on this device. Signing out keeps it; it only
            disconnects shared-item sync and your plan until you sign back in.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
            You are using FocusBuddy locally without an account. Sign in to sync
            shared folders and tasks across devices and to apply your plan.
          </p>
          <button
            onClick={requestSignIn}
            data-testid="account-signin"
            className="btn-primary !text-[12px]"
          >
            Sign in or create account
          </button>
        </div>
      )}
    </div>
  )
}
