// The conversation's live reference row (Phase 4.3), sitting above the composer.
//
// This is the second half of plan P1. An inline chip records what ONE message
// said and stays in the transcript forever; this row shows what the conversation
// is still referencing and therefore what will ride the NEXT message. Both draw
// from one set — the chips cannot disagree with what is sent, because they are
// rendered from the same MentionRef[] the request is built from.
//
// A reference the main process reported as unresolvable renders visibly
// degraded rather than live (plan P3). Absence of a verdict is not a failure:
// a reference nothing has reported on yet renders normally.

import Icon from '../Icon'
import {
  isKnownUnresolved,
  mentionKey,
  mentionKindLabel,
  type MentionRef,
  type MentionResolution
} from '../../lib/assistantMentions'

interface Props {
  refs: readonly MentionRef[]
  resolution: MentionResolution
  onRemove: (key: string) => void
}

export default function MentionRefRow({ refs, resolution, onRemove }: Props): JSX.Element | null {
  if (refs.length === 0) return null
  return (
    <div
      data-testid="composer-mention-row"
      className="flex flex-wrap items-center gap-1"
      aria-label="Items this conversation references"
    >
      {refs.map((m) => {
        const broken = isKnownUnresolved(resolution, m)
        const key = mentionKey(m)
        return (
          <span
            key={key}
            data-testid="composer-mention-ref"
            data-mention-id={m.id}
            data-mention-resolved={broken ? 'false' : 'true'}
            title={
              broken
                ? `${m.title} — the assistant could not read this. It is not being used.`
                : `${m.title} (${mentionKindLabel(m.kind)}) — referenced for this conversation; the assistant reads it on every message.`
            }
            className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
              broken
                ? 'border-[var(--edge-soft)] bg-[var(--surface-sunken)] text-[var(--ink-40)] line-through decoration-[var(--ink-30)]'
                : 'border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.10)] text-[var(--ink-80)]'
            }`}
          >
            <Icon
              name={broken ? 'link_off' : m.icon}
              size={11}
              className={`shrink-0 ${broken ? '' : 'text-accent'}`}
            />
            <span className="truncate max-w-[150px]">{m.title}</span>
            <button
              type="button"
              onClick={() => onRemove(key)}
              aria-label={`Stop referencing ${m.title}`}
              title="Remove this reference"
              data-testid="composer-mention-clear"
              className="shrink-0 grid place-items-center rounded-full hover:text-[var(--ink-100)] transition-colors"
            >
              <Icon name="close" size={11} />
            </button>
          </span>
        )
      })}
    </div>
  )
}
