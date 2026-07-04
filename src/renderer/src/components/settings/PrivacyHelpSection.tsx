import { useState } from 'react'
import Icon from '../Icon'
import { telemetryEnabled, setTelemetryEnabled } from '../../lib/telemetryPrefs'
import { HELP_BASE, PRICING_URL } from '../../lib/siteUrls'

// Privacy + Help. The usage-sharing toggle is the real control behind the
// telemetry the app sends, so turning it off genuinely stops it (it used to do
// nothing). Help surfaces the guides + pricing that previously had no in-app entry,
// answering the "where do I get help / what does it cost" gap plainly and honestly.

export default function PrivacyHelpSection(): JSX.Element {
  const [shareUsage, setShareUsage] = useState(telemetryEnabled())

  return (
    <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-2">
          Privacy
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={shareUsage}
            onChange={(e) => {
              setShareUsage(e.target.checked)
              setTelemetryEnabled(e.target.checked)
            }}
            data-testid="privacy-usage-toggle"
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span className="text-[12px] text-[var(--ink-70)] leading-relaxed">
            Share anonymous usage data. This sends aggregate counts (how often features are used), never the contents of
            your documents, messages, or files, and no third-party trackers. Turning this off stops it immediately.
          </span>
        </label>
        <p className="mt-2 text-[11px] text-[var(--ink-50)] leading-relaxed">
          Your work stays on this device. Only items you explicitly share, and your email address, are sent to our
          server. AI features send the text you ask them to act on to the AI provider when you use them.
        </p>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-2">
          Help &amp; support
        </div>
        <div className="space-y-1.5">
          <button
            onClick={() => void window.api.files.openExternal(HELP_BASE)}
            data-testid="help-guides"
            className="w-full inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors"
          >
            <Icon name="help" size={14} /> Help &amp; guides
          </button>
          <button
            onClick={() => void window.api.files.openExternal(PRICING_URL)}
            data-testid="help-pricing"
            className="w-full inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors"
          >
            <Icon name="sell" size={14} /> Plans &amp; pricing
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-50)] leading-relaxed">
          Stuck on something? The guides cover the common questions.
        </p>
      </div>
    </div>
  )
}
