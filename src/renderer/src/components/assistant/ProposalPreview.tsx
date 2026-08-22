// True miniatures (facelift F3). Caleb's ruling: "a spreadsheet should look
// like a spreadsheet, a task should look like a task." Each proposal kind
// renders a small, honest preview of the REAL thing it would create — the
// actual proposed columns, the actual checklist items, the actual first lines
// — never a stock illustration. Kinds without enough payload to preview
// return null and keep the generic card body.
//
// Local to assistant/ by design (single call site in ProposalCards; the
// 3-call-site bar for shared primitives is not met). Colours: kind wells
// (the sticky's canonical yellow) are data, not chrome; everything else is
// tokens and the canonical area tones.

import type { ActionProposal } from '@shared/types'
import Icon from '../Icon'
import { areaTone } from '../../lib/areaTones'

// Plain text out of a serialized Tiptap document, best-effort.
function tiptapText(json: string | undefined): string {
  if (!json) return ''
  try {
    const walk = (n: unknown): string => {
      const node = n as { text?: string; content?: unknown[] }
      if (typeof node?.text === 'string') return node.text
      if (Array.isArray(node?.content)) return node.content.map(walk).join(' ')
      return ''
    }
    return walk(JSON.parse(json)).replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

const CELL = 'px-2 py-1 fb-t-caption truncate'

// A miniature table: the REAL proposed columns as a header row, plus two
// ghost body rows so it reads as a grid, not a list.
function TableMini({ columns }: { columns: Array<{ label: string }> }): React.JSX.Element {
  const shown = columns.slice(0, 4)
  const extra = columns.length - shown.length
  return (
    <div className="rounded-[var(--radius-chip)] overflow-hidden shadow-[0_0_0_1px_var(--edge-hairline)]">
      <div className="grid bg-[var(--surface-sunken)]" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0,1fr))` }}>
        {shown.map((c, i) => (
          <span key={i} className={`${CELL} font-medium text-[var(--ink-70)]`}>
            {c.label}
            {extra > 0 && i === shown.length - 1 ? `  +${extra}` : ''}
          </span>
        ))}
      </div>
      {[0, 1].map((r) => (
        <div
          key={r}
          className="grid bg-[var(--surface-raised)]"
          style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0,1fr))` }}
        >
          {shown.map((_, i) => (
            <span key={i} className={CELL}>
              <span className="inline-block w-3/5 h-1.5 rounded-full bg-[var(--surface-sunken)]" />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

// One real row landing under a header of the cells' own keys.
function RowMini({ cells }: { cells: Record<string, string> }): React.JSX.Element | null {
  const entries = Object.entries(cells).slice(0, 4)
  if (entries.length === 0) return null
  return (
    <div className="rounded-[var(--radius-chip)] overflow-hidden shadow-[0_0_0_1px_var(--edge-hairline)]">
      <div className="grid bg-[var(--surface-sunken)]" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0,1fr))` }}>
        {entries.map(([k], i) => (
          <span key={i} className={`${CELL} font-medium text-[var(--ink-60)]`}>{k}</span>
        ))}
      </div>
      <div className="grid bg-[var(--surface-raised)]" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0,1fr))` }}>
        {entries.map(([, v], i) => (
          <span key={i} className={`${CELL} text-[var(--ink-90)]`}>{v}</span>
        ))}
      </div>
    </div>
  )
}

function TodoMini({ items }: { items: string[] }): React.JSX.Element {
  const shown = items.slice(0, 4)
  return (
    <div className="rounded-[var(--radius-chip)] bg-[var(--surface-raised)] shadow-[0_0_0_1px_var(--edge-hairline)] px-2 py-1.5 flex flex-col gap-1">
      {shown.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 fb-t-caption text-[var(--ink-90)]">
          <span className="w-3 h-3 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_var(--edge-firm)]" aria-hidden="true" />
          <span className="truncate">{item}</span>
        </span>
      ))}
      {items.length > shown.length && (
        <span className="fb-t-caption text-[var(--ink-40)] pl-[18px]">+{items.length - shown.length} more</span>
      )}
    </div>
  )
}

// The sticky is a coloured well — canonical sticky yellow is DATA (the same
// value the widget itself uses), so text on it is fixed dark in every theme.
function StickyMini({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="w-[180px] -rotate-1 rounded-[var(--radius-chip)] px-2.5 py-2 shadow-[var(--shadow-soft)]" style={{ background: '#fef08a' }}>
      <span className="fb-t-caption leading-snug text-[oklch(30%_0.02_100)] line-clamp-3 block">
        {text || 'A quick note'}
      </span>
    </div>
  )
}

function PageMini({ title, text }: { title: string; text: string }): React.JSX.Element {
  return (
    <div className="max-w-[260px] rounded-[var(--radius-chip)] bg-[var(--surface-raised)] shadow-[0_0_0_1px_var(--edge-hairline),var(--shadow-soft)] px-2.5 py-2 flex flex-col gap-1">
      <span className="fb-t-caption font-semibold text-[var(--ink-100)] truncate">{title}</span>
      {text ? (
        <span className="fb-t-caption text-[var(--ink-50)] line-clamp-2 leading-snug">{text}</span>
      ) : (
        <span className="flex flex-col gap-1" aria-hidden="true">
          <span className="h-1.5 w-11/12 rounded-full bg-[var(--surface-sunken)]" />
          <span className="h-1.5 w-3/5 rounded-full bg-[var(--surface-sunken)]" />
        </span>
      )}
    </div>
  )
}

function KnowledgeMini({ title, body, tags }: { title: string; body: string; tags?: string[] }): React.JSX.Element {
  return (
    <div className="max-w-[280px] rounded-[var(--radius-chip)] bg-[var(--surface-raised)] shadow-[0_0_0_1px_var(--edge-hairline)] px-2.5 py-2 flex flex-col gap-1">
      <span className="flex items-center gap-1.5 fb-t-caption font-semibold text-[var(--ink-100)]">
        <Icon name="neurology" size={12} className={`${areaTone('brain')} shrink-0`} />
        <span className="truncate">{title}</span>
      </span>
      <span className="fb-t-caption text-[var(--ink-50)] line-clamp-2 leading-snug">{body}</span>
      {tags && tags.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-[var(--surface-sunken)] px-1.5 fb-t-caption text-[var(--ink-50)]">
              {t}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

function DocumentMini({ docType, title }: { docType: string; title: string }): React.JSX.Element {
  if (docType === 'sheet') {
    return (
      <TableMini columns={[{ label: 'A' }, { label: 'B' }, { label: 'C' }]} />
    )
  }
  const icon = docType === 'slides' ? 'slideshow' : docType === 'design' ? 'gesture' : 'description'
  return (
    <div className="max-w-[260px] rounded-[var(--radius-chip)] bg-[var(--surface-raised)] shadow-[0_0_0_1px_var(--edge-hairline),var(--shadow-soft)] px-2.5 py-2 flex items-center gap-2">
      <Icon name={icon} size={16} className={`${areaTone('office')} shrink-0`} />
      <span className="min-w-0">
        <span className="block fb-t-caption font-semibold text-[var(--ink-100)] truncate">{title}</span>
        <span className="block fb-t-caption text-[var(--ink-40)] capitalize">{docType}</span>
      </span>
    </div>
  )
}

function DeskMini({ title, notes }: { title: string; notes?: string }): React.JSX.Element {
  return (
    <div className="max-w-[240px] rounded-[var(--radius-chip)] bg-[var(--surface-raised)] shadow-[0_0_0_1px_var(--edge-hairline)] px-2.5 py-2 flex items-center gap-2">
      <Icon name="desk" size={15} className={`${areaTone('desks')} shrink-0`} />
      <span className="min-w-0">
        <span className="block fb-t-caption font-semibold text-[var(--ink-100)] truncate">{title}</span>
        {notes && <span className="block fb-t-caption text-[var(--ink-50)] truncate">{notes}</span>}
      </span>
    </div>
  )
}

export default function ProposalPreview({ p }: { p: ActionProposal }): React.JSX.Element | null {
  switch (p.kind) {
    case 'create-table':
      return p.columns.length > 0 ? <TableMini columns={p.columns} /> : null
    case 'add-table-row':
      return <RowMini cells={p.cells} />
    case 'create-todo-list':
      return p.items.length > 0 ? <TodoMini items={p.items} /> : null
    case 'create-page':
      return <PageMini title={p.title} text={tiptapText(p.content)} />
    case 'create-knowledge-entry':
      return <KnowledgeMini title={p.title} body={p.body} tags={p.tags} />
    case 'create-document':
    case 'generate-document':
      return <DocumentMini docType={p.docType} title={p.title} />
    case 'create-task':
      return <DeskMini title={p.title} notes={p.notes} />
    case 'create-widget': {
      const text = (p.content ?? '').trim()
      if (p.widgetKind === 'sticky') return <StickyMini text={text || p.title || ''} />
      if (p.widgetKind === 'note' || p.widgetKind === 'markdown')
        return <PageMini title={p.title || 'Note'} text={text} />
      if (p.widgetKind === 'page') return <PageMini title={p.title || 'Page'} text={tiptapText(p.content)} />
      return null
    }
    default:
      return null
  }
}
