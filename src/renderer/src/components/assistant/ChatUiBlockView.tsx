import { useState } from 'react'
import type { ChatUiBlock } from '@shared/types'
import Icon from '../Icon'

// Renderer for the model-emitted interactive UI blocks (Plexii P4): choice
// chips, scales, icon rows, info cards. One component, one case per type,
// dispatched from ChatBlockView's registry.
//
// Interaction contract: a tap SENDS — the selection becomes the user's next
// chat message via onSubmit, exactly the QuestionCard convention, so blocks
// carry no conversation state of their own. `enabled` is false on any turn
// that is not the latest (or while a send is in flight): older blocks stay
// visible as a record of what was offered, but no longer answer for the user.
//
// Materials per the design law: interactive tiles are fb-tile + fb-press,
// radius 10 (tile) / 8 (chip), accent strictly for selection and the primary
// send affordance, springs come free with the utility classes.

interface Props {
  block: ChatUiBlock
  enabled: boolean
  onSubmit?: (text: string) => void
}

export default function ChatUiBlockView({ block, enabled, onSubmit }: Props): JSX.Element | null {
  switch (block.type) {
    case 'choices':
      return <ChoicesBlock block={block} enabled={enabled} onSubmit={onSubmit} />
    case 'scale':
      return <ScaleBlock block={block} enabled={enabled} onSubmit={onSubmit} />
    case 'icon-row':
      return (
        <div className="flex flex-wrap gap-1.5" data-testid="ui-block-icon-row">
          {block.items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] bg-[var(--surface-sunken)] shadow-[0_0_0_1px_var(--edge-hairline)] fb-t-caption text-[var(--ink-80)]"
            >
              <Icon name={item.icon} size={14} className="text-[var(--ink-60)] shrink-0" />
              {item.label}
            </span>
          ))}
        </div>
      )
    case 'cards':
      return (
        <div
          className={`grid gap-1.5 ${block.items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
          data-testid="ui-block-cards"
        >
          {block.items.map((item, i) => (
            <div key={i} className="fb-card px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1.5">
                {item.icon && (
                  <span className="h-5 w-5 rounded-[6px] grid place-items-center bg-accent/10 text-accent shrink-0">
                    <Icon name={item.icon} size={12} />
                  </span>
                )}
                <span className="fb-t-label font-medium text-[var(--ink-100)] truncate">
                  {item.title}
                </span>
              </div>
              {item.body && (
                <p className="mt-1 fb-t-caption text-[var(--ink-60)] leading-snug">{item.body}</p>
              )}
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}

function ChoicesBlock({
  block,
  enabled,
  onSubmit
}: {
  block: Extract<ChatUiBlock, { type: 'choices' }>
  enabled: boolean
  onSubmit?: (text: string) => void
}): JSX.Element {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const interactive = enabled && !!onSubmit

  function tap(optionId: string, label: string): void {
    if (!interactive) return
    if (!block.multi) {
      onSubmit?.(label)
      return
    }
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }

  function confirm(): void {
    if (!interactive || picked.size === 0) return
    const labels = block.options.filter((o) => picked.has(o.id)).map((o) => o.label)
    onSubmit?.(labels.join(', '))
  }

  return (
    <div data-testid="ui-block-choices" className="flex flex-col gap-1.5">
      {block.prompt && (
        <p className="fb-t-label text-[var(--ink-70)]">{block.prompt}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((o) => {
          const selected = block.multi ? picked.has(o.id) : false
          return (
            <button
              key={o.id}
              type="button"
              data-testid="ui-choice-option"
              disabled={!interactive}
              onClick={() => tap(o.id, o.label)}
              title={o.description ? `${o.label} — ${o.description}` : o.label}
              className={`fb-press inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1.5 rounded-[10px] text-left transition-colors ${
                selected
                  ? 'bg-accent/10 text-[rgb(var(--accent))] shadow-[0_0_0_1px_rgb(var(--accent)/0.35)]'
                  : 'fb-tile text-[var(--ink-90)]'
              } ${interactive ? '' : 'opacity-60 cursor-default'}`}
            >
              {o.icon && (
                <Icon
                  name={o.icon}
                  size={14}
                  className={`shrink-0 ${selected ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-60)]'}`}
                />
              )}
              <span className="min-w-0">
                <span className="block fb-t-label font-medium leading-tight">{o.label}</span>
                {o.description && (
                  <span className="block fb-t-caption text-[var(--ink-50)] leading-tight">
                    {o.description}
                  </span>
                )}
              </span>
              {selected && <Icon name="check" size={13} className="shrink-0" />}
            </button>
          )
        })}
      </div>
      {block.multi && (
        <button
          type="button"
          data-testid="ui-choices-confirm"
          disabled={!interactive || picked.size === 0}
          onClick={confirm}
          className="fb-press self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] bg-[rgb(var(--accent))] text-white fb-t-label font-medium disabled:opacity-40 transition-opacity"
        >
          <Icon name="arrow_upward" size={13} />
          Send {picked.size > 0 ? `${picked.size} picked` : ''}
        </button>
      )}
    </div>
  )
}

function ScaleBlock({
  block,
  enabled,
  onSubmit
}: {
  block: Extract<ChatUiBlock, { type: 'scale' }>
  enabled: boolean
  onSubmit?: (text: string) => void
}): JSX.Element {
  const [value, setValue] = useState<number>(Math.round((block.min + block.max) / 2))
  const [touched, setTouched] = useState(false)
  const interactive = enabled && !!onSubmit

  return (
    <div data-testid="ui-block-scale" className="fb-card px-3 py-2.5 max-w-[420px]">
      <div className="flex items-center justify-between gap-2">
        <span className="fb-t-label font-medium text-[var(--ink-100)]">{block.label}</span>
        <span className="fb-t-caption fb-tabular text-[rgb(var(--accent))] font-semibold">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={block.min}
        max={block.max}
        step={1}
        value={value}
        disabled={!interactive}
        data-testid="ui-scale-input"
        onChange={(e) => {
          setValue(Number(e.target.value))
          setTouched(true)
        }}
        className="w-full mt-2 accent-[rgb(var(--accent))] disabled:opacity-50"
      />
      <div className="flex items-center justify-between mt-1 gap-2">
        <span className="fb-t-caption text-[var(--ink-50)]">{block.minLabel ?? block.min}</span>
        <button
          type="button"
          data-testid="ui-scale-confirm"
          disabled={!interactive || !touched}
          onClick={() => onSubmit?.(`${block.label}: ${value}`)}
          className="fb-press inline-flex items-center gap-1 h-7 px-2.5 rounded-[10px] bg-[rgb(var(--accent))] text-white fb-t-caption font-medium disabled:opacity-40 transition-opacity"
        >
          <Icon name="arrow_upward" size={12} />
          Send
        </button>
        <span className="fb-t-caption text-[var(--ink-50)]">{block.maxLabel ?? block.max}</span>
      </div>
    </div>
  )
}
