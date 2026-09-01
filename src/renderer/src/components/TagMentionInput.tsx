import { useMemo, useRef, useState } from 'react'
import { useNodeStore } from '../stores/nodes'
import { usePeopleStore } from '../lib/peopleDirectory'
import { normalizeTag } from '../lib/itemTags'
import {
  MENTION_ICON,
  mentionKey,
  type ItemMention,
  type ItemMentionKind
} from '../lib/itemMentions'
import Icon from './Icon'

// DEC-039 — ONE input for an item's chosen context, used by the capture card,
// the manual form and the item editor so the grammar can never fork:
//
//   plain word + Enter/comma  → a free-form tag
//   "@" + typing              → a typeahead over the PRIMARY GROUPINGS —
//                               people, desks, rooms, plans — pick one to
//                               attach it as a typed mention
//   Backspace on empty        → removes the last chip
//
// People come from the org directory the app has genuinely loaded; signed out
// or personal-only, none are offered. A person mention is stored and shown —
// routing a notification to them arrives with SPEC-027.

interface Candidate {
  kind: ItemMentionKind
  id: string
  title: string
  hint: string
}

const MAX_OPTIONS = 6

export default function TagMentionInput({
  tags,
  mentions,
  onTags,
  onMentions,
  placeholder = 'Add tags — @ mentions a person, desk, room or plan',
  autoFocus = false
}: {
  tags: string[]
  mentions: ItemMention[]
  onTags: (next: string[]) => void
  onMentions: (next: ItemMention[]) => void
  placeholder?: string
  autoFocus?: boolean
}): JSX.Element {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const nodes = useNodeStore((s) => s.nodes)
  const people = usePeopleStore((s) => s.people)

  const atQuery = text.startsWith('@') ? text.slice(1).trim().toLowerCase() : null

  const candidates = useMemo((): Candidate[] => {
    if (atQuery === null) return []
    const out: Candidate[] = []
    const taken = new Set(mentions.map(mentionKey))
    const push = (c: Candidate): void => {
      if (out.length >= MAX_OPTIONS) return
      if (taken.has(`${c.kind}:${c.id}`)) return
      if (atQuery && !c.title.toLowerCase().includes(atQuery)) return
      out.push(c)
    }
    for (const p of people) {
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.handle
      push({ kind: 'person', id: p.accountId, title: name, hint: p.handle })
    }
    for (const n of nodes) {
      if (n.archived) continue
      if (n.kind === 'task') push({ kind: 'desk', id: n.id, title: n.title || 'Untitled desk', hint: 'Desk' })
      else if (n.kind === 'folder' && n.isPlan)
        push({ kind: 'plan', id: n.id, title: n.title || 'Untitled plan', hint: 'Plan' })
      else if (n.kind === 'folder')
        push({ kind: 'room', id: n.id, title: n.title || 'Untitled room', hint: 'Room' })
    }
    return out
  }, [atQuery, nodes, people, mentions])

  const addTag = (raw: string): void => {
    const t = normalizeTag(raw)
    if (t && !tags.includes(t)) onTags([...tags, t])
    setText('')
  }
  const addMention = (c: Candidate): void => {
    onMentions([...mentions, { kind: c.kind, id: c.id, title: c.title }])
    setText('')
    setSelected(0)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div className="fb-field mt-1 w-full bg-[var(--surface-raised)] px-2 py-1.5 flex flex-wrap items-center gap-1">
        {mentions.map((m) => (
          <span
            key={mentionKey(m)}
            title={
              m.kind === 'person'
                ? `${m.title} — mentioned (notifications arrive with routing)`
                : m.title
            }
            className="inline-flex items-center gap-1 pl-1.5 pr-1 h-6 rounded-full text-[11px] bg-accent/[0.12] text-[var(--ink-90)]"
          >
            <Icon name={MENTION_ICON[m.kind]} size={11} />
            <span className="max-w-[140px] truncate">{m.title}</span>
            <button
              onClick={() => onMentions(mentions.filter((x) => mentionKey(x) !== mentionKey(m)))}
              className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-[var(--surface-sunken)] fb-press"
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        ))}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 pl-1.5 pr-1 h-6 rounded-full text-[11px] bg-[var(--surface-sunken)] text-[var(--ink-70)]"
          >
            <Icon name="sell" size={10} />
            {t}
            <button
              onClick={() => onTags(tags.filter((x) => x !== t))}
              className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-[var(--surface-raised)] fb-press"
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSelected(0)
          }}
          onKeyDown={(e) => {
            if (atQuery !== null && candidates.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((s) => (s + 1) % candidates.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((s) => (s - 1 + candidates.length) % candidates.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                e.stopPropagation()
                addMention(candidates[Math.min(selected, candidates.length - 1)])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setText('')
                return
              }
            }
            if ((e.key === 'Enter' || e.key === ',') && text.trim() && atQuery === null) {
              e.preventDefault()
              e.stopPropagation()
              addTag(text)
              return
            }
            if (e.key === 'Backspace' && !text) {
              if (tags.length) onTags(tags.slice(0, -1))
              else if (mentions.length) onMentions(mentions.slice(0, -1))
            }
          }}
          placeholder={mentions.length || tags.length ? '' : placeholder}
          className="flex-1 min-w-[140px] bg-transparent outline-none text-[12px] py-0.5"
        />
      </div>
      {atQuery !== null && candidates.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[340] rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl py-1 max-h-56 overflow-auto">
          {candidates.map((c, i) => (
            <button
              key={`${c.kind}:${c.id}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => addMention(c)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left ${
                i === selected
                  ? 'bg-accent/[0.14] shadow-[inset_2px_0_0_rgb(var(--accent))]'
                  : 'hover:bg-[var(--surface-sunken)]'
              }`}
            >
              <Icon name={MENTION_ICON[c.kind]} size={13} className="text-[var(--ink-50)] shrink-0" />
              <span className="text-[12px] text-[var(--ink-90)] truncate flex-1">{c.title}</span>
              <span className="text-[10px] text-[var(--ink-40)] shrink-0">{c.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
