import Icon from '../Icon'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import {
  PLEXI_GROUPS,
  PLEXI_DESK,
  productsInGroup,
  STATUS_LABEL,
  type PlexiProduct
} from '@shared/plexiSuite'
import UpvoteButton from './UpvoteButton'
import { PLEXI_CARD } from '../plexi'

// PlexiSuite home: the launcher for the whole suite. Every product reads from the
// shared catalog, so what is live, what is coming, and what is planned stay
// honest in one place. Live products open their own home page; coming-soon and
// planned ones render in lighter grey with a badge and an upvote that records who
// asked, so we can tell them when it is ready to test.

// Map a ready product's launch hint to the right destination. Anything we do not
// route directly simply opens the product's home page.
export function launchProduct(product: PlexiProduct): void {
  const v = useViewStore.getState()
  switch (product.launch) {
    case 'documents':
      return v.goDocuments()
    case 'tasks':
      return v.goAllTasks()
    case 'calendar':
      return v.goCalendar()
    case 'messages':
      return v.goMessages()
    case 'mail':
      return v.goMail()
    case 'files':
      return v.goFiles()
    case 'vault':
      return v.goVault()
    case 'knowledge':
      return v.goKnowledge()
    case 'meetings':
      return v.goMeetings()
    case 'apps':
      return v.goApps()
    case 'forms':
      return v.goForms()
    case 'sign':
      return v.goSign()
    case 'search':
      return v.goSearch()
    case 'projects':
      return v.goProjects()
    case 'reports':
      return v.goReports()
    case 'flows':
      return v.goFlows()
    case 'api':
      return v.goApi()
    case 'marketplace':
      return v.goMarketplace()
    case 'canvas':
      return v.goHome()
    default:
      return v.goProduct(product.key)
  }
}

function greeting(): string {
  // Stable across a render without Date.now in shared code; this is renderer-only
  // so the clock is fine here.
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function ProductTile({ product }: { product: PlexiProduct }): JSX.Element {
  const goProduct = useViewStore((s) => s.goProduct)
  const ready = product.status === 'ready'

  return (
    <button
      onClick={() => goProduct(product.key)}
      data-testid={`product-tile-${product.key}`}
      className={`group relative text-left rounded-xl border p-3 transition-all ${
        ready
          ? `${PLEXI_CARD} fb-lift`
          : 'border-[var(--edge-soft)]/50 bg-[var(--surface-sunken)]/60'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg ${ready ? '' : 'opacity-50 grayscale'}`}
          style={{ backgroundColor: `${product.accent}1f`, color: product.accent }}
        >
          <Icon name={product.icon} size={18} filled />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[13px] font-semibold truncate ${
                ready ? 'text-[var(--ink-100)]' : 'text-[var(--ink-50)]'
              }`}
            >
              {product.name}
            </span>
            {!ready && (
              <span
                className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                  product.status === 'soon'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-[var(--ink-50)]/15 text-[var(--ink-50)]'
                }`}
              >
                {STATUS_LABEL[product.status]}
              </span>
            )}
          </div>
          <p
            className={`mt-0.5 text-[11px] leading-snug line-clamp-2 ${
              ready ? 'text-[var(--ink-70)]' : 'text-[var(--ink-50)]/70'
            }`}
          >
            {product.tagline}
          </p>
        </div>
      </div>
      {!ready && (
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[10px] text-[var(--ink-50)]">Upvote to prioritise</span>
          <UpvoteButton featureKey={product.key} />
        </div>
      )}
    </button>
  )
}

function GroupSection({ groupKey }: { groupKey: string }): JSX.Element | null {
  const group = PLEXI_GROUPS.find((g) => g.key === groupKey)
  if (!group) return null
  const products = productsInGroup(groupKey)
  if (products.length === 0) return null

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-bold tracking-tight" style={{ color: group.accent }}>
          {group.name}
        </h2>
        <span className="text-[12px] text-[var(--ink-70)]">{group.tagline}</span>
      </div>
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((p) => (
          <ProductTile key={p.key} product={p} />
        ))}
      </div>
    </section>
  )
}

export default function PlexiSuiteHome(): JSX.Element {
  const account = useAccountStore((s) => s.account)
  const goProduct = useViewStore((s) => s.goProduct)
  const name = (account?.handle || account?.email || '').split('@')[0]

  return (
    <div
      className="h-full w-full overflow-auto"
      style={{ background: 'var(--surface-base)' }}
      data-testid="plexisuite-home"
    >
      <div className="mx-auto max-w-[1280px] px-6 py-7">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-tight text-[var(--ink-100)] fb-display-hero">PlexiSuite</h1>
            {name && <span className="text-[15px] text-[var(--ink-70)]">· {greeting()}, {name}</span>}
          </div>
          <p className="mt-1 text-[14px] text-[var(--ink-70)]">
            Everything your team needs to create, run, and grow. One connected workspace, built to leave Microsoft and
            Google behind.
          </p>
        </div>

        {/* PlexiDesk hero */}
        <button
          onClick={() => goProduct(PLEXI_DESK.key)}
          data-testid="hero-plexidesk"
          className="group relative w-full text-left rounded-2xl border border-indigo-300/30 dark:border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/[0.06] to-transparent p-5 mb-7 overflow-hidden hover:border-indigo-400/40 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span
              className="shrink-0 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${PLEXI_DESK.accent}24`, color: PLEXI_DESK.accent }}
            >
              <Icon name={PLEXI_DESK.icon} size={28} filled />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[19px] font-bold text-[var(--ink-100)]">PlexiDesk</h2>
                <span className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">{PLEXI_DESK.tagline}</span>
              </div>
              <p className="mt-1 text-[13px] text-[var(--ink-90)] max-w-2xl leading-relaxed">
                {PLEXI_DESK.about}
              </p>
            </div>
            <span className="shrink-0 hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-indigo-600 dark:text-indigo-300">
              Explore <Icon name="arrow_forward" size={16} />
            </span>
          </div>
        </button>

        {/* Product groups */}
        <div className="space-y-7">
          {PLEXI_GROUPS.map((g) => (
            <GroupSection key={g.key} groupKey={g.key} />
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-[var(--ink-50)]">
          Greyed products are on the way. Upvote the ones you want first, and we will tell you the moment they are ready
          to test.
        </p>
      </div>
    </div>
  )
}
