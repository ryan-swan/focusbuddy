import Icon from './Icon'
import Modal from './plexi/Modal'
import { useUpgradePromptStore } from '../stores/upgradePrompt'
import { useStoredTier } from '../stores/capabilities'
import { PRICING_URL } from '../lib/siteUrls'

// Single global modal for capability gates. Driven by useUpgradePromptStore;
// any gated action calls promptUpgrade('<reason>') and this renders. Mounted
// once in App so every gate shares one modal + consistent copy.
//
// Mirrors the TrialBadge TierPickerModal styling. Links out to the brochure
// pricing page (the Stripe checkout flow will replace that link later).
export default function UpgradePromptModal(): JSX.Element | null {
  const reason = useUpgradePromptStore((s) => s.reason)
  const requiredTier = useUpgradePromptStore((s) => s.requiredTier)
  const dismiss = useUpgradePromptStore((s) => s.dismiss)
  const storedTier = useStoredTier()

  if (!reason) return null

  const tierName = requiredTier === 'team' ? 'Team' : 'Pro'
  const openPricing = (): void => {
    window.open(PRICING_URL, '_blank', 'noopener,noreferrer')
    dismiss()
  }

  return (
    <Modal
      onClose={dismiss}
      label={`A ${tierName} feature`}
      z={9999}
      className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 max-w-sm w-full p-6"
      testId="upgrade-prompt-modal"
    >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Icon name="lock" size={16} />
            </span>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              A {tierName} feature
            </h2>
          </div>
          <button
            onClick={dismiss}
            className="h-6 w-6 inline-flex items-center justify-center text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <p className="text-xs text-stone-600 dark:text-stone-400 mb-1 leading-relaxed" data-testid="upgrade-reason">
          {reason}
        </p>
        <p className="text-[11px] text-stone-500 dark:text-stone-500 mb-4 leading-relaxed">
          {storedTier === 'free'
            ? `It's included on ${tierName}. Your 14-day trial unlocks everything if it's still active.`
            : `It's included on ${tierName}.`}
        </p>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
          <button
            onClick={dismiss}
            className="text-xs px-3 py-1.5 rounded-md text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            data-testid="upgrade-later"
          >
            Maybe later
          </button>
          <button
            onClick={openPricing}
            className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
            data-testid="upgrade-see-pricing"
          >
            See {tierName} pricing
          </button>
        </div>
    </Modal>
  )
}
