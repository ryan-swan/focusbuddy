// Account section of the Settings panel. This is the persistent home for
// signing in and out, which previously only existed as the boot modal with no
// way back to it and no sign-out at all. Signed in, it shows who you are, your
// plan, and a Sign out button. Signed out, it explains the benefit and opens
// the same sign-in modal on demand.

import { useEffect, useState } from 'react'
import { useAccountStore } from '../../stores/account'
import { useSignInPrompt } from '../../stores/signInPrompt'
import { useCapabilityStore } from '../../stores/capabilities'
import { personDisplayName, personInitials } from '../../lib/personName'
import Icon from '../Icon'
import TwoFactorSettings from './TwoFactorSettings'

export default function AccountSection(): JSX.Element {
  const account = useAccountStore((s) => s.account)
  const signOut = useAccountStore((s) => s.signOut)
  const updateName = useAccountStore((s) => s.updateName)
  const requestSignIn = useSignInPrompt((s) => s.requestOpen)
  const effectiveTier = useCapabilityStore((s) => s.effectiveTier)
  const refreshCaps = useCapabilityStore((s) => s.refresh)
  const [busy, setBusy] = useState(false)

  // Name editor. Seeded from the account and kept in sync when it changes
  // (e.g. after login). Save posts to the server and updates the store.
  const [firstName, setFirstName] = useState(account?.firstName ?? '')
  const [lastName, setLastName] = useState(account?.lastName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  useEffect(() => {
    setFirstName(account?.firstName ?? '')
    setLastName(account?.lastName ?? '')
  }, [account?.firstName, account?.lastName])

  const nameDirty =
    firstName.trim() !== (account?.firstName ?? '').trim() ||
    lastName.trim() !== (account?.lastName ?? '').trim()

  async function handleSaveName(): Promise<void> {
    if (savingName || !nameDirty) return
    setSavingName(true)
    setNameSaved(false)
    try {
      const ok = await updateName({ firstName: firstName.trim() || null, lastName: lastName.trim() || null })
      if (ok) {
        setNameSaved(true)
        setTimeout(() => setNameSaved(false), 1600)
      }
    } finally {
      setSavingName(false)
    }
  }

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
    <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
        Account
      </div>

      {account ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[13px] font-semibold bg-accent/15 text-accent shrink-0">
              {personInitials(account)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] font-medium text-[var(--ink-100)] truncate"
                data-testid="account-identity"
              >
                {personDisplayName(account)}
              </div>
              <div className="text-[11px] text-[var(--ink-50)] truncate">
                {account.email}
                <span className="mx-1.5 text-[var(--ink-40)]">·</span>
                <span data-testid="account-plan">{planLabel} plan</span>
              </div>
            </div>
            <button
              onClick={() => void handleSignOut()}
              disabled={busy}
              data-testid="account-signout"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
            >
              <Icon name="logout" size={13} />
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>

          {/* Name editor — this is the identity shown across the product. */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] font-medium">
              Your name
            </div>
            <div className="flex items-center gap-2">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={40}
                data-testid="account-first-name"
                className="flex-1 min-w-0 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2 py-1.5 text-[12px]"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={40}
                data-testid="account-last-name"
                className="flex-1 min-w-0 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2 py-1.5 text-[12px]"
              />
              <button
                onClick={() => void handleSaveName()}
                disabled={savingName || !nameDirty}
                data-testid="account-save-name"
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40"
              >
                {savingName ? 'Saving…' : nameSaved ? 'Saved' : 'Save'}
              </button>
            </div>
            <p className="text-[10.5px] text-[var(--ink-50)] leading-snug">
              This is how you appear in mentions, chat, meeting invites and to your team.
            </p>
          </div>
          <p className="text-[11px] text-[var(--ink-50)] leading-relaxed">
            Your local data stays on this device. Signing out keeps it; it only
            disconnects shared-item sync and your plan until you sign back in.
          </p>
          <TwoFactorSettings />
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[11px] text-[var(--ink-70)] leading-relaxed">
            You are using PlexiDesk locally without an account. Sign in to sync
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
