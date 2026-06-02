import { useEffect, useState } from 'react'
import { CHANGELOG, hasUnseenChanges } from '../lib/changelog'
import Icon from './Icon'
import WhatsNewPanel from './WhatsNewPanel'
import TermsModal from './TermsModal'
import UpdaterBanner from './UpdaterBanner'
import TrialBadge from './TrialBadge'

export default function Footer(): JSX.Element {
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [unseen, setUnseen] = useState<boolean>(() => hasUnseenChanges())

  useEffect(() => {
    if (!showWhatsNew) setUnseen(hasUnseenChanges())
  }, [showWhatsNew])

  const year = new Date().getFullYear()
  const newestEntry = CHANGELOG[0]
  const buildDate = newestEntry
    ? new Date(newestEntry.date).toISOString().slice(0, 10)
    : ''
  // __APP_VERSION__ is injected at build time from package.json by
  // electron-vite's `define`. Bump package.json on every release; this
  // footer (and any other display) updates automatically.
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

  return (
    <>
      <footer className="h-7 px-3 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 select-none">
        <div className="flex items-center gap-2 truncate">
          <span>© {year} Haptyx</span>
          <span className="text-stone-300 dark:text-stone-700">·</span>
          <button
            type="button"
            onClick={() => { void window.api.update.check() }}
            className="text-stone-400 dark:text-stone-500 font-mono hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            title={`Haptyx ${appVersion} · build ${buildDate} · click to check for updates`}
          >
            v{appVersion}
            {buildDate && ` · ${buildDate}`}
          </button>
          <UpdaterBanner />
          <TrialBadge />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTerms(true)}
            className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
          >
            Terms of Use
          </button>
          <span className="text-stone-300 dark:text-stone-700">·</span>
          <button
            onClick={() => window.open('https://haptyx.app/help', '_blank', 'noopener,noreferrer')}
            className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors flex items-center gap-1"
          >
            <Icon name="help_outline" size={12} />
            Help & support
          </button>
          <span className="text-stone-300 dark:text-stone-700">·</span>
          <button
            onClick={() => setShowWhatsNew(true)}
            className="relative px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors flex items-center gap-1"
          >
            <Icon name="auto_awesome" size={12} className={unseen ? 'text-accent' : ''} />
            <span className={unseen ? 'text-stone-900 dark:text-stone-100 font-medium' : ''}>
              What's new
            </span>
            {unseen && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent shadow-sm animate-pulse"
                aria-label="New updates available"
              />
            )}
          </button>
        </div>
      </footer>
      {showWhatsNew && <WhatsNewPanel onClose={() => setShowWhatsNew(false)} />}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </>
  )
}
