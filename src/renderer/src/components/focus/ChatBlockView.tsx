import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AppliedProposal, ChatBlock } from '@shared/types'
import ProposalCards from '../ProposalCards'
import remarkCitations from '../../lib/remarkCitations'
import Icon from '../Icon'

// The block-renderer registry for the agentic chat's typed-block thread.
//
// A message renders as an ordered ChatBlock[]; each block dispatches here to its
// renderer. This registry IS the open extension point: a new block kind = one
// new case (and its union member in shared/types). Today 'text' and 'action'
// (and connector-branded actions) carry real data; the remaining kinds render a
// tasteful, labelled placeholder so the frame is visibly ready for the session
// that wires their live data.
//
// Connector affordances are intentionally data-driven (icon/label resolved from
// the connector string), so adding Slack / Notion / Drive / etc. needs no change
// to this component beyond the lookup table.

interface Props {
  block: ChatBlock
  activeTaskId: string | null
  // Applied-card state + the mark-applied callback, threaded from the host
  // surface's store so approved cards persist (green + "Go to").
  appliedProposals: Record<string, AppliedProposal>
  onApplied: (proposalId: string, applied: AppliedProposal) => void
  onConsumeProposal: (proposalId: string) => void
  // Jump to a real workspace item (widget/document) when a block links to one.
  onOpenWidget?: (widgetId: string) => void
}

// Connector display metadata. Free-string keyed so unknown connectors still get
// a sane default rather than breaking — open-ended by construction.
const CONNECTOR_META: Record<string, { icon: string; label: string }> = {
  gmail: { icon: 'mail', label: 'Email' },
  calendar: { icon: 'calendar_month', label: 'Calendar' },
  chat: { icon: 'chat', label: 'Message' }
}
function connectorMeta(connector: string): { icon: string; label: string } {
  return CONNECTOR_META[connector] ?? { icon: 'bolt', label: connector }
}

export default function ChatBlockView({
  block,
  activeTaskId,
  appliedProposals,
  onApplied,
  onConsumeProposal,
  onOpenWidget
}: Props): JSX.Element | null {
  switch (block.kind) {
    // ── Live blocks ──────────────────────────────────────────────────────────
    case 'text':
      // Assistant prose is deliberately UNBUBBLED — it sits on the panel rather
      // than inside a bordered box. Boxing both sides is the generic-chat tell,
      // and it forces long answers, tables and code to fight a 10px radius. The
      // speaker is carried by the turn's identity row, not by a container.
      return (
        <div className="text-[13px] leading-[1.62] text-[var(--ink-90)] md-rendered">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkCitations]}
            components={{
              a: ({ href, children, ...rest }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                  {children}
                </a>
              ),
              // Inline [n] citation markers, rewritten by remarkCitations into a
              // span carrying data-citation. Any other span passes through
              // untouched, so this override costs nothing when there are no
              // citations. Rendered as a small accent chip so a claim and its
              // grounding read as one thing.
              span: ({ node, children, ...rest }) => {
                const n = node?.properties?.dataCitation
                if (n === undefined || n === null || n === '') {
                  return <span {...rest}>{children}</span>
                }
                return (
                  <span
                    data-testid="chat-citation"
                    title={`Source ${String(n)}`}
                    className="inline-grid place-items-center align-[1.5px] mx-[1px] min-w-[14px] h-[14px] px-[3px] rounded-[4px] bg-accent/15 text-accent text-[9px] font-mono font-semibold"
                  >
                    {String(n)}
                  </span>
                )
              }
            }}
          >
            {block.markdown}
          </ReactMarkdown>
        </div>
      )

    case 'sources':
      // What the answer stands on. The numbers match the inline markers above.
      return (
        <div className="flex flex-wrap gap-1" data-testid="chat-sources">
          {block.sources.map((s) => (
            <span
              key={`${s.n}-${s.docId}`}
              title={s.snippet || s.title}
              className="inline-flex items-center gap-1.5 max-w-full rounded-full border border-[var(--edge-soft)] bg-[var(--surface-sunken)] pl-1.5 pr-2 py-0.5 text-[10px] text-[var(--ink-70)]"
            >
              <b className="font-mono text-[8.5px] font-bold text-accent">{s.n}</b>
              <span className="truncate">{s.title}</span>
            </span>
          ))}
        </div>
      )

    case 'action':
      // Reuse the shared apply pipeline (dependency resolution, batched undo,
      // per-card toasts). One proposal per action block.
      return (
        <ProposalCards
          proposals={[block.proposal]}
          activeTaskId={activeTaskId}
          appliedProposals={appliedProposals}
          onApplied={onApplied}
          onConsume={onConsumeProposal}
        />
      )

    case 'connector-action': {
      const meta = connectorMeta(block.connector)
      // Connector actions flow through the SAME apply pipeline as any action —
      // they're just branded with the connector's icon/label. The card body is
      // ProposalCards; the connector chip above it names the integration.
      return (
        <div className="max-w-[92%] flex flex-col gap-1">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-[var(--surface-sunken)] border border-[var(--edge-soft)] px-2 py-0.5">
            <Icon name={meta.icon} size={12} className="text-[rgb(var(--accent))]" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-50)]">
              {meta.label}
            </span>
          </div>
          <ProposalCards
            proposals={[block.proposal]}
            activeTaskId={activeTaskId}
            appliedProposals={appliedProposals}
            onApplied={onApplied}
            onConsume={onConsumeProposal}
          />
        </div>
      )
    }

    // ── Declared-but-not-yet-emitted blocks: tasteful placeholders ────────────
    // These render so the frame is visibly complete; a later session teaches the
    // model to emit them and swaps these bodies for live data.
    case 'record-table':
      return (
        <BlockShell icon="table_chart" label={block.title || 'Records'}>
          <div className="text-[11px] text-[var(--ink-50)]">
            {block.columns.length} columns · {block.rows.length} rows
          </div>
        </BlockShell>
      )

    case 'chart':
      return (
        <BlockShell icon="bar_chart" label={block.title || `${block.chartType} chart`}>
          <div className="text-[11px] text-[var(--ink-50)]">Chart · {block.chartType}</div>
        </BlockShell>
      )

    case 'widget-card':
      return (
        <button
          onClick={() => block.widgetId && onOpenWidget?.(block.widgetId)}
          disabled={!block.widgetId}
          className="max-w-[92%] flex items-center gap-2.5 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-accent px-3 py-2 text-left transition-colors disabled:cursor-default"
        >
          <span className="h-7 w-7 rounded-md bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--ink-50)] shrink-0">
            <Icon name="widgets" size={15} />
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-[var(--ink-100)] truncate">
            {block.title}
          </span>
          {block.widgetId && <Icon name="north_east" size={14} className="text-[var(--ink-40)]" />}
        </button>
      )

    case 'link':
      return (
        <a
          href={block.external ? block.href : undefined}
          target={block.external ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="max-w-[92%] inline-flex items-center gap-1.5 text-[13px] text-[rgb(var(--accent))] hover:underline self-start"
        >
          <Icon name={block.external ? 'open_in_new' : 'link'} size={14} />
          {block.label}
        </a>
      )

    default:
      return null
  }
}

// Small shared shell for placeholder blocks — a labelled, iconed container that
// matches the design system so a not-yet-live block still looks intentional.
function BlockShell({
  icon,
  label,
  children
}: {
  icon: string
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="max-w-[92%] rounded-lg border border-dashed border-[var(--edge-soft)] bg-[var(--surface-sunken)]/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icon} size={14} className="text-[var(--ink-50)]" />
        <span className="text-[12px] font-medium text-[var(--ink-90)]">{label}</span>
      </div>
      {children}
    </div>
  )
}
