import { useState } from 'react'
import Icon from '../Icon'
import { DashboardHeader, StatusPill, PLEXI_CARD } from '../plexi'
import { TEMPLATES, type TemplateCategory, type TemplateMeta, type AppliedItem } from '@shared/templates'

// PlexiMarketplace: a gallery of built-in starter templates. Applying one creates
// real workspace objects through the normal stores, so it is exactly like
// building them by hand, just faster. Community publishing of templates is a
// future addition that needs the shared backend; today the gallery is the
// curated built-in set, and the copy says so rather than implying more.

const CATEGORIES: TemplateCategory[] = ['Tables', 'Reports', 'Automations', 'Knowledge']

export default function PlexiMarketplaceView(): JSX.Element {
  const [applyingKey, setApplyingKey] = useState<string | null>(null)
  const [result, setResult] = useState<{ key: string; created: AppliedItem[] } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)

  async function apply(t: TemplateMeta): Promise<void> {
    setApplyingKey(t.key)
    setError(null)
    setResult(null)
    try {
      const r = await window.api.marketplace.apply(t.key)
      if (r.ok) setResult({ key: t.key, created: r.created })
      else setError({ key: t.key, message: r.error || 'Could not apply the template.' })
    } catch (e) {
      setError({ key: t.key, message: `Could not apply the template: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setApplyingKey(null)
    }
  }

  return (
    <div className="h-full w-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]" data-testid="pleximarketplace-view">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <DashboardHeader title="Marketplace" subtitle="Built-in starter templates you can add to your workspace with one click" />

        <p className="mb-5 text-[12.5px] text-[var(--ink-70)] leading-relaxed max-w-2xl">
          Each template creates real tables, reports, automations or knowledge entries you can edit or delete like
          anything else. Community publishing, where your team shares its own templates, is on the way.
        </p>

        {CATEGORIES.map((cat) => {
          const items = TEMPLATES.filter((t) => t.category === cat)
          if (items.length === 0) return null
          return (
            <div key={cat} className="mb-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-50)] mb-2">{cat}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((t) => (
                  <div
                    key={t.key}
                    data-testid={`template-card-${t.key}`}
                    className={`${PLEXI_CARD} p-4 flex flex-col`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(var(--accent)/0.10)]">
                        <Icon name={t.icon} size={18} className="text-[rgb(var(--accent))]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold text-[var(--ink-100)]">{t.name}</h3>
                        <p className="mt-0.5 text-[12px] text-[var(--ink-70)] leading-snug">{t.description}</p>
                      </div>
                    </div>

                    <ul className="mt-3 space-y-1 flex-1">
                      {t.creates.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-[var(--ink-70)]">
                          <Icon name="add_circle" size={12} className="text-[var(--ink-50)] mt-0.5 shrink-0" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => void apply(t)}
                        disabled={applyingKey === t.key}
                        data-testid={`template-apply-${t.key}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium hover:bg-[rgb(var(--accent-hover))] disabled:opacity-40"
                      >
                        <Icon name="add" size={14} /> {applyingKey === t.key ? 'Adding…' : 'Add to workspace'}
                      </button>
                      {result?.key === t.key && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600 dark:text-emerald-400" data-testid={`template-done-${t.key}`}>
                          <Icon name="check_circle" size={13} filled /> Added {result.created.length} item(s)
                        </span>
                      )}
                    </div>
                    {error?.key === t.key && (
                      <p className="mt-2 flex items-center gap-1.5 text-rose-500 text-[12px]" data-testid={`template-error-${t.key}`}>
                        <Icon name="error_outline" size={14} /> {error.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[var(--ink-50)]">
          <StatusPill tone="stone" label="Community publishing coming" dot={false} />
        </div>
      </div>
    </div>
  )
}
