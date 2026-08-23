// Two-factor (TOTP) management, shown in the Account settings section when
// signed in. Enrol flow: request a secret, add it to an authenticator app,
// confirm a code, then save the one-time recovery codes. Disable requires a
// current code so a hijacked open session cannot quietly strip protection.

import { useEffect, useState } from 'react'
import { useAccountStore } from '../../stores/account'
import {
  twoFactorStatus,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable
} from '../../lib/accountClient'
import Icon from '../Icon'

type Stage = 'idle' | 'setup' | 'recovery' | 'disable'

export default function TwoFactorSettings(): JSX.Element | null {
  const token = useAccountStore((s) => s.sessionToken)
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [secret, setSecret] = useState('')
  const [otpauth, setOtpauth] = useState('')
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!token) return
    void twoFactorStatus(token).then((s) => {
      if (cancelled) return
      setEnabled(s.enabled)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) return null

  function reset(): void {
    setStage('idle')
    setSecret('')
    setOtpauth('')
    setCode('')
    setRecovery([])
    setError(null)
  }

  async function beginSetup(): Promise<void> {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const r = await twoFactorSetup(token)
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setSecret(r.secret)
    setOtpauth(r.otpauthUrl)
    setStage('setup')
  }

  async function confirmEnable(): Promise<void> {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const r = await twoFactorEnable(token, code.trim())
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setRecovery(r.recoveryCodes)
    setCode('')
    setEnabled(true)
    setStage('recovery')
  }

  async function confirmDisable(): Promise<void> {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const r = await twoFactorDisable(token, code.trim())
    setBusy(false)
    if (!r.ok) {
      setError(r.error || 'That code is not valid.')
      return
    }
    setEnabled(false)
    reset()
  }

  if (!loaded) return null

  const inputCls =
    'w-full px-3 py-2 rounded-[var(--radius-field)] text-[13px] text-[var(--ink-100)] bg-[var(--surface-sunken)] focus:border-accent'

  return (
    <div className="pt-3 border-t border-[var(--edge-soft)] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-[var(--ink-100)] flex items-center gap-1.5">
            <Icon name="lock" size={13} />
            Two-factor authentication
          </div>
          <div className="fb-t-caption text-[var(--ink-50)]">
            {enabled ? 'On. A code is required at each new sign-in.' : 'Off. Add a code from an authenticator app.'}
          </div>
        </div>
        {stage === 'idle' && (
          <button
            onClick={() => (enabled ? setStage('disable') : void beginSetup())}
            disabled={busy}
            data-testid="twofa-toggle"
            className="fb-btn-surface shrink-0 px-2.5 py-1.5 rounded-[var(--radius-field)] fb-t-caption text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {busy ? 'Working…' : enabled ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>

      {stage === 'setup' && (
        <div className="space-y-2 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] p-3">
          <p className="fb-t-caption text-[var(--ink-70)] leading-relaxed">
            Add this secret to your authenticator app (Google Authenticator, 1Password, Authy), then enter the
            6-digit code it shows.
          </p>
          <div className="fb-card font-mono text-[12px] tracking-[0.15em] text-[var(--ink-100)] break-all select-all rounded-[var(--radius-chip)] px-2 py-1.5">
            {secret}
          </div>
          <div className="fb-t-caption text-[var(--ink-50)] break-all select-all">{otpauth}</div>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            data-testid="twofa-confirm-code"
            className={`${inputCls} font-mono tracking-[0.3em]`}
          />
          {error && <div className="fb-t-caption text-rose-500">{error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={() => void confirmEnable()} disabled={busy || !code.trim()} className="btn-primary !fb-t-caption disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify and turn on'}
            </button>
            <button onClick={reset} className="fb-t-caption text-[var(--ink-50)] hover:text-[var(--ink-70)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === 'recovery' && (
        <div className="space-y-2 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] p-3">
          <p className="fb-t-caption text-[var(--ink-70)] leading-relaxed">
            Save these recovery codes somewhere safe. Each works once if you lose your authenticator. They are shown
            only now.
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono fb-t-caption text-[var(--ink-100)] select-all">
            {recovery.map((c) => (
              <div key={c} className="fb-card rounded-[var(--radius-chip)] px-2 py-1">
                {c}
              </div>
            ))}
          </div>
          <button onClick={reset} className="btn-primary !fb-t-caption">
            I saved them
          </button>
        </div>
      )}

      {stage === 'disable' && (
        <div className="space-y-2 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] p-3">
          <p className="fb-t-caption text-[var(--ink-70)] leading-relaxed">
            Enter a current code (or a recovery code) to turn two-factor off.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            data-testid="twofa-disable-code"
            className={`${inputCls} font-mono tracking-[0.3em]`}
          />
          {error && <div className="fb-t-caption text-rose-500">{error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={() => void confirmDisable()} disabled={busy || !code.trim()} className="px-2.5 py-1.5 rounded-[var(--radius-field)] fb-t-caption bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 disabled:opacity-50">
              {busy ? 'Working…' : 'Turn off two-factor'}
            </button>
            <button onClick={reset} className="fb-t-caption text-[var(--ink-50)] hover:text-[var(--ink-70)]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
