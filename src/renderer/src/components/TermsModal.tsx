import { useEffect } from 'react'
import Icon from './Icon'

interface Props {
  onClose: () => void
}

export default function TermsModal({ onClose }: Props): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-stone-900 w-full max-w-lg mx-4 rounded-lg shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="gavel" size={18} className="text-stone-600 dark:text-stone-300" />
            <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Terms of Use
            </h3>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          <section>
            <h4 className="text-stone-900 dark:text-stone-100 font-semibold mb-1.5">1. Your data is yours</h4>
            <p>
              PlexiDesk stores everything locally on your machine — tasks, widgets, browsing
              history, chat messages, preferences. No data is sent to PlexiDesk servers; there are
              no PlexiDesk servers. Backups, sync, and export are your responsibility.
            </p>
          </section>

          <section>
            <h4 className="text-stone-900 dark:text-stone-100 font-semibold mb-1.5">2. AI features use your own API key</h4>
            <p>
              Open <strong>Settings → AI · API keys</strong> to paste your Anthropic API key.
              It's encrypted with your system keychain and never leaves this Mac except as
              part of an outbound request to Anthropic — the assistant, AI Setup, and resume
              features call Anthropic's API directly from the app. You are responsible for any
              usage charges on that key.
            </p>
          </section>

          <section>
            <h4 className="text-stone-900 dark:text-stone-100 font-semibold mb-1.5">3. AI output is best-effort</h4>
            <p>
              The assistant can be wrong, miss context, or hallucinate. Treat its suggestions as a
              starting point — not as advice or instruction. Verify anything important before
              acting on it.
            </p>
          </section>

          <section>
            <h4 className="text-stone-900 dark:text-stone-100 font-semibold mb-1.5">4. Embedded browsers and third-party sites</h4>
            <p>
              Pages you open in browser widgets are loaded directly from the source. Their terms,
              cookies, and tracking are governed by those sites, not PlexiDesk. Avoid logging in
              to anything you wouldn't want stored in this Electron app's profile.
            </p>
          </section>

          <section>
            <h4 className="text-stone-900 dark:text-stone-100 font-semibold mb-1.5">5. No warranty</h4>
            <p>
              The software is provided "as is," without warranty of any kind. The author is not
              liable for lost work, missed deadlines, or any indirect damages. Keep your own
              backups of work that matters.
            </p>
          </section>

          <section>
            <h4 className="text-stone-900 dark:text-stone-100 font-semibold mb-1.5">6. ADHD-friendly disclaimer</h4>
            <p>
              PlexiDesk is a productivity tool, not a medical or therapeutic device. It is not a
              replacement for medication, therapy, or professional support for ADHD or executive
              dysfunction. If something here helps — great. If it doesn't — your brain isn't
              broken, this tool just isn't the right fit.
            </p>
          </section>

          <section className="text-[11px] text-stone-500 dark:text-stone-400 pt-2 border-t border-stone-200 dark:border-stone-700">
            Last updated 23 May 2026.
          </section>
        </div>

        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 shrink-0 flex justify-end">
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
