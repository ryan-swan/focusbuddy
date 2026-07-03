import { useState } from 'react'
import Icon from './Icon'
import Modal from './plexi/Modal'
import { PRICING_URL } from '../lib/siteUrls'
import {
  useStoredTier,
  useTrial,
  useCapabilityStore
} from '../stores/capabilities'
import { useAccountStore } from '../stores/account'

// Footer trial affordance. Three states the user can be in:
//
//   1. Active trial (1+ day left): small green pill "Trial · 7d left",
//      click → upgrade picker modal.
//   2. Trial lapsed AND stored tier is Free: amber pill "Trial ended ·
//      Upgrade", click → upgrade picker modal. Renders as a one-shot
//      "Trial ended" modal automatically the first time the user opens
//      the app after lapse (until they dismiss it).
//   3. No trial, stored tier is Pro/Team: nothing in the footer. User
//      already paid — don't pester them.
//
// We deliberately don't show the badge for signed-out users; the empty
// state is enough indication that they need to sign in.
export default function TrialBadge(): JSX.Element | null {
  const trial = useTrial()
  const storedTier = useStoredTier()
  const accountId = useAccountStore((s) => s.account?.id ?? null)
  const loadedAt = useCapabilityStore((s) => s.loadedAt)
  const [modalOpen, setModalOpen] = useState(false)

  // Don't render until we've actually heard from the server once.
  // Otherwise we'd flash "Trial ended" on every cold boot before the
  // first /account/capabilities call resolves.
  if (loadedAt === null || !accountId) return null

  if (trial.active && trial.daysLeft > 0) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors inline-flex items-center gap-1"
          title={`Open trial — ${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} of full Top-tier access left. Click to upgrade.`}
          data-testid="trial-badge-active"
        >
          <Icon name="bolt" size={10} />
          Trial · {trial.daysLeft}d
        </button>
        {modalOpen && <TierPickerModal onClose={() => setModalOpen(false)} />}
      </>
    )
  }

  // Trial expired (or never existed) AND user is on the post-trial
  // restricted-free tier. Nudge them to upgrade.
  if (storedTier === 'free') {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition-colors inline-flex items-center gap-1"
          title="Your trial has ended. Upgrade to keep premium features, or stay on the restricted free plan."
          data-testid="trial-badge-lapsed"
        >
          <Icon name="lock_clock" size={10} />
          Free · Upgrade
        </button>
        {modalOpen && <TierPickerModal onClose={() => setModalOpen(false)} />}
      </>
    )
  }

  // Pro / Team — user has paid. No nag.
  return null
}

// Lightweight upgrade picker. Three tiers, headline pricing, "stay on
// free" exit. Real Stripe checkout flow is the NEXT phase (Hooper-meeting
// gate). For tonight this modal just records the user's intent in
// localStorage so we don't show it again on every boot, and links out to
// the brochure pricing page so the user can read the pricing.
//
// When the Stripe phase lands, the per-tier "Choose" buttons here will
// open the Stripe Checkout session for that tier instead of opening the
// brochure.
function TierPickerModal({ onClose }: { onClose: () => void }): JSX.Element {
  const stayOnFree = (): void => {
    try {
      localStorage.setItem('fb.tier-picker-acknowledged', '1')
    } catch {
      // ignore — modal still closes
    }
    onClose()
  }
  const openPricing = (): void => {
    window.open(PRICING_URL, '_blank', 'noopener,noreferrer')
    stayOnFree() // record acknowledgment so we don't immediately re-pop
  }
  return (
    <Modal
      onClose={onClose}
      label="Pick a plan"
      z={9999}
      className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 max-w-md w-full p-6"
      testId="tier-picker-modal"
    >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Pick a plan
          </h2>
          <button
            onClick={onClose}
            className="h-6 w-6 inline-flex items-center justify-center text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <p className="text-xs text-stone-600 dark:text-stone-400 mb-4 leading-relaxed">
          Your 14-day open trial is the full Top-tier experience.
          When it ends, you can stay on the restricted Free plan, or
          upgrade to keep AI features, multi-device sync, and the rest
          of the toolkit.
        </p>
        <div className="space-y-2 mb-4">
          <TierRow
            name="Free"
            blurb="Core canvas + SpeedDeck + 1 device. No AI features."
          />
          <TierRow
            name="Pro"
            blurb="AI assistant, body double, 3 devices, table widget, focus mode."
            highlight
          />
          <TierRow
            name="Team"
            blurb="Everything in Pro + per-seat admin, shared decks, audit log."
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
          <button
            onClick={stayOnFree}
            className="text-xs px-3 py-1.5 rounded-md text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            data-testid="stay-on-free"
          >
            Stay on Free
          </button>
          <button
            onClick={openPricing}
            className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
            data-testid="see-pricing"
          >
            See pricing
          </button>
        </div>
    </Modal>
  )
}

function TierRow({
  name,
  blurb,
  highlight
}: {
  name: string
  blurb: string
  highlight?: boolean
}): JSX.Element {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight
          ? 'border-accent/40 bg-accent/5'
          : 'border-stone-200 dark:border-stone-800'
      }`}
    >
      <div className="text-[11px] font-semibold text-stone-900 dark:text-stone-100">
        {name}
        {highlight && (
          <span className="ml-2 text-[9px] uppercase tracking-wider text-accent">
            Recommended
          </span>
        )}
      </div>
      <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug mt-0.5">
        {blurb}
      </div>
    </div>
  )
}
