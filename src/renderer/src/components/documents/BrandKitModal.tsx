import { useState } from 'react'
import { useBrandStore } from '../../stores/brand'
import { brandContrastWarnings, type OrgBrandKit } from '@shared/brandKit'
import Icon from '../Icon'

// The Brand Kit editor — set the organization's logo, colors and fonts once and
// every surface that reads the brand store presents consistently. Contrast is
// checked live so a brand can't quietly produce unreadable text.

const FONTS: { label: string; value: string }[] = [
  { label: 'Inter (sans)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Helvetica / Arial', value: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", ui-monospace, monospace' }
]

export default function BrandKitModal({ onClose }: { onClose: () => void }): JSX.Element {
  const kit = useBrandStore((s) => s.kit)
  const save = useBrandStore((s) => s.save)
  const [draft, setDraft] = useState<OrgBrandKit>(kit)
  const [saving, setSaving] = useState(false)
  const warnings = brandContrastWarnings(draft)

  function set<K extends keyof OrgBrandKit>(key: K, value: OrgBrandKit[K]): void {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function pickLogo(): Promise<void> {
    const res = await window.api.office.pickImage()
    if (res.ok && res.dataUrl) set('logoUrl', res.dataUrl)
  }

  async function onSave(): Promise<void> {
    setSaving(true)
    try {
      await save(draft)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[460px] max-h-[88vh] overflow-auto rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
        data-testid="brand-kit-modal"
      >
        <div className="flex items-center gap-2 mb-3">
          <Icon name="palette" size={18} className="text-accent" />
          <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-100">Brand kit</h2>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-600">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-4">
          Set your logo, colors and fonts once. PlexiDesign and other surfaces use them so everything looks like you.
        </p>

        {/* Logo */}
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-1.5">Logo</div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center overflow-hidden bg-stone-50 dark:bg-stone-800">
              {draft.logoUrl ? (
                <img src={draft.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" data-testid="brand-logo-preview" />
              ) : (
                <Icon name="image" size={20} className="text-stone-300" />
              )}
            </div>
            <button onClick={() => void pickLogo()} data-testid="brand-pick-logo" className="text-[12px] px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 hover:border-accent">
              {draft.logoUrl ? 'Replace' : 'Upload'}
            </button>
            {draft.logoUrl && (
              <button onClick={() => set('logoUrl', undefined)} className="text-[12px] px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <ColorField label="Primary color" value={draft.colorPrimary} onChange={(c) => set('colorPrimary', c)} testid="brand-primary" />
          <ColorField label="Secondary color" value={draft.colorSecondary ?? '#0d9488'} onChange={(c) => set('colorSecondary', c)} testid="brand-secondary" />
        </div>

        {/* Fonts */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <FontField label="Heading font" value={draft.fontHeading} onChange={(f) => set('fontHeading', f)} testid="brand-font-heading" />
          <FontField label="Body font" value={draft.fontBody} onChange={(f) => set('fontBody', f)} testid="brand-font-body" />
        </div>

        {warnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2.5" data-testid="brand-warnings">
            {warnings.map((w, i) => (
              <div key={i} className="text-[11.5px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[13px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800">
            Cancel
          </button>
          <button onClick={() => void onSave()} disabled={saving} data-testid="brand-save" className="btn-primary text-[13px] px-4 py-1.5 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save brand'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange, testid }: { label: string; value: string; onChange: (c: string) => void; testid: string }): JSX.Element {
  return (
    <label className="block">
      <span className="text-[11px] text-stone-500">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input type="color" value={value.startsWith('#') ? value : '#000000'} data-testid={testid} onChange={(e) => onChange(e.target.value)} className="w-9 h-8 rounded border border-stone-300 dark:border-stone-600 cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 rounded border border-stone-300 dark:border-stone-600 bg-transparent px-2 py-1 text-[12px] fb-tabular" />
      </div>
    </label>
  )
}

function FontField({ label, value, onChange, testid }: { label: string; value: string; onChange: (f: string) => void; testid: string }): JSX.Element {
  return (
    <label className="block">
      <span className="text-[11px] text-stone-500">{label}</span>
      <select value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-stone-300 dark:border-stone-600 bg-transparent px-2 py-1.5 text-[12px]" style={{ fontFamily: value }}>
        {FONTS.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
        {!FONTS.some((f) => f.value === value) && <option value={value}>{value}</option>}
      </select>
    </label>
  )
}
