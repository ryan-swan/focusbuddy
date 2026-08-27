import { useEffect, useRef, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useWorkItemStore } from '../stores/workItems'
import { CLASS_CHOICES, queueOf } from '../lib/attentionQueues'
import { URGENCY_LEVELS, parseTags, serializeTags, urgencyOf } from '../lib/itemTags'
import Icon from './Icon'

// DEC-036 — the item editor. Double-clicking a queue row opens the WHOLE item
// and lets every part of it be changed: title, notes, classification, due
// date, and the desk it lives on.
//
// This closes the oldest Layer-0 gap in the layer (analysis/21 Part II §12:
// "no post-creation editing — updateFields exists at IPC; no UI"). Until now a
// capture was effectively immutable from the surface: you could reclassify it,
// snooze it, or close it, but you could not correct a typo in your own words.
//
// Every write goes through the one store seam (F008), and ONLY changed fields
// are sent — so an edit that touches the title cannot quietly restamp the due
// date or the class.

const isoToInputDate = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export default function AttentionItemEditor({
  item,
  desks,
  onClose
}: {
  item: FbNode
  /** Personal, live desks — shared/archived ones refuse work-item parenting. */
  desks: Array<{ id: string; title: string }>
  onClose: (changed: boolean) => void
}): JSX.Element {
  const updateFields = useWorkItemStore((s) => s.updateFields)
  const [title, setTitle] = useState(item.title ?? '')
  const [notes, setNotes] = useState(item.description ?? '')
  const [cls, setCls] = useState(queueOf(item))
  const [due, setDue] = useState(isoToInputDate(item.dueAt))
  const [deskId, setDeskId] = useState(item.parentId ?? '')
  // DEC-037 — the chosen context. Never mandatory.
  const [urgency, setUrgency] = useState<string>(urgencyOf(item) ?? 'normal')
  const [tagText, setTagText] = useState(parseTags(item.tags).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 0)
  }, [])

  async function save(): Promise<void> {
    if (busy) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('An item needs a title.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Only what actually changed — an edit must never restamp a field the
      // operator did not touch.
      const patch: Record<string, unknown> = {}
      if (trimmed !== (item.title ?? '')) patch.title = trimmed
      if (notes !== (item.description ?? '')) patch.notes = notes
      if (cls !== queueOf(item)) patch.intentClass = cls
      const nextDue = due ? new Date(`${due}T17:00:00`).toISOString() : null
      if (nextDue !== (item.dueAt ?? null)) patch.dueAt = nextDue
      const nextUrgency = urgency === 'normal' ? null : urgency
      if (nextUrgency !== (item.wiUrgency ?? null)) patch.wiUrgency = nextUrgency
      const nextTags = serializeTags(tagText.split(','))
      if (nextTags !== (item.tags ?? null)) patch.tags = nextTags
      let changed = Object.keys(patch).length > 0
      if (changed) await updateFields(item.id, patch)

      // The desk is a NODE move, not a work-item field — same call the
      // Detached shelf's recovery uses.
      const nextDesk = deskId || null
      if (nextDesk !== (item.parentId ?? null)) {
        if (nextDesk) await window.api.nodes.move(item.id, nextDesk, null)
        else await window.api.nodes.move(item.id, null, null)
        changed = true
      }
      onClose(changed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those changes.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fb-scrim fixed inset-0 z-[320] flex items-start justify-center pt-[14vh]"
      onMouseDown={() => onClose(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit attention item"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose(false)
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
        }}
        className="fb-card w-[min(620px,94vw)] p-4"
      >
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-semibold text-[var(--ink-100)]">Edit item</div>
          <button onClick={() => onClose(false)} title="Close" className="icon-btn !h-7 !w-7">
            <Icon name="close" size={14} />
          </button>
        </div>

        <label className="block mt-3">
          <span className="fb-t-caption text-[var(--ink-40)]">Title</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="fb-field mt-1 w-full bg-[var(--surface-raised)] px-3 py-2 text-[13px]"
          />
        </label>

        <label className="block mt-3">
          <span className="fb-t-caption text-[var(--ink-40)]">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Context, links, anything worth keeping with it…"
            className="fb-field mt-1 w-full bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] resize-y"
          />
        </label>

        <div className="mt-3">
          <span className="fb-t-caption text-[var(--ink-40)]">Classification</span>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {CLASS_CHOICES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCls(c.value)}
                title={c.hint}
                className={`px-2.5 h-7 fb-t-label fb-press rounded-full ${
                  cls === c.value
                    ? 'bg-[rgb(var(--accent))] text-white'
                    : 'bg-[var(--surface-raised)] text-[var(--ink-60)] hover:text-[var(--ink-100)]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="fb-t-caption text-[var(--ink-40)]">Due</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="fb-field bg-[var(--surface-raised)] px-2 py-1.5 text-[12px]"
              />
              {due && (
                <button
                  onClick={() => setDue('')}
                  title="Clear the due date"
                  className="icon-btn !h-7 !w-7"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          </label>
          <label className="block min-w-0">
            <span className="fb-t-caption text-[var(--ink-40)]">Desk</span>
            <select
              value={deskId}
              onChange={(e) => setDeskId(e.target.value)}
              className="fb-field mt-1 bg-[var(--surface-raised)] px-2 py-1.5 text-[12px] max-w-[260px]"
            >
              <option value="">No desk</option>
              {desks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || 'Untitled desk'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <span className="fb-t-caption text-[var(--ink-40)]">Urgency</span>
            <div className="mt-1 flex items-center gap-1">
              {URGENCY_LEVELS.map((u) => (
                <button
                  key={u}
                  onClick={() => setUrgency(u)}
                  className={`px-2.5 h-7 fb-t-label fb-press rounded-full capitalize ${
                    urgency === u
                      ? 'bg-[rgb(var(--accent))] text-white'
                      : 'bg-[var(--surface-raised)] text-[var(--ink-60)] hover:text-[var(--ink-100)]'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block mt-3">
          <span className="fb-t-caption text-[var(--ink-40)]">
            Tags <span className="text-[var(--ink-30)]">— optional, comma separated</span>
          </span>
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="client, rush, q3"
            className="fb-field mt-1 w-full bg-[var(--surface-raised)] px-3 py-2 text-[12.5px]"
          />
        </label>

        {error && <div className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</div>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-[var(--ink-30)]">⌘↵ to save · Esc to cancel</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onClose(false)}
              className="h-8 px-3 fb-press fb-t-label text-[var(--ink-60)] hover:text-[var(--ink-100)]"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={busy}
              className="h-8 px-3.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
