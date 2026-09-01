import { useEffect, useState } from 'react'
import Icon from './Icon'
import { CLASS_CHOICES, CLASS_LABEL } from '../lib/attentionQueues'
import { fmtAnchor, type ValidatedCommitment } from '../lib/commitments'
import { useWorkItemStore } from '../stores/workItems'
import { useActionHistory } from '../stores/actionHistory'
import { useNoticeStore } from '../stores/notice'
import { serializeMentions } from '../lib/itemMentions'

// M3 (SPEC-003 §3.6) — the confirm stop for extracted commitments. This is
// the screen that answers "nothing happens after": nothing files silently
// (S3-DEC-023), every row is a checkbox, and the rules are the ruled ones —
//   - your commitments (and unowned ones) arrive CHECKED;
//   - someone else's arrive UNCHECKED, owner named, and file with the owner
//     as a person MENTION — a reference, never a send (SPEC-027 boundary);
//   - an anchored row shows the moment it came from ([m:ss] + the words);
//     an unanchored one is marked as unverified — the machine's guess LOOKS
//     like a guess (the house accent-vs-ink doctrine);
//   - everything stays on the meeting's desk; Attention holds references.
// Enter files the checked set; one batch, one undo (R008 — dismissal, not
// deletion, is the reverse).

export default function MeetingCommitmentsCard({
  commitments,
  meetingId,
  meetingTitle,
  deskNodeId,
  onFiled
}: {
  commitments: ValidatedCommitment[]
  meetingId: string
  meetingTitle: string
  deskNodeId: string | null
  onFiled: () => void
}): JSX.Element | null {
  const createItem = useWorkItemStore((s) => s.create)
  const [rows, setRows] = useState(commitments)
  const [busy, setBusy] = useState(false)
  useEffect(() => setRows(commitments), [commitments])

  const checkedCount = rows.filter((r) => r.checked).length

  async function fileChecked(): Promise<void> {
    if (busy || checkedCount === 0) return
    setBusy(true)
    try {
      const take = rows.filter((r) => r.checked)
      useActionHistory.getState().beginBatch()
      const ids: string[] = []
      try {
        for (const c of take) {
          const anchorNote = c.segment
            ? `From the meeting, ${fmtAnchor(c.segment.startMs)} — ${c.segment.speakerName}: “${c.segment.text}”`
            : `From the meeting “${meetingTitle}” (no transcript anchor — verify).`
          const item = await createItem({
            title: c.title,
            notes: anchorNote,
            parentId: deskNodeId,
            intentClass: c.intentClass,
            dueAt: c.dueAt,
            confidence: c.anchored ? 0.95 : 0.6,
            approvalState: 'approved',
            wiOrigin: 'ai',
            sourceType: 'meeting',
            sourceRef: meetingId,
            // C7 — the owner rides as a person mention: a reference the item
            // keeps, never a notification we send. SPEC-027 owns sending.
            mentions:
              !c.mine && c.ownerAccountId
                ? serializeMentions([{ kind: 'person', id: c.ownerAccountId, title: c.ownerName ?? 'Owner' }])
                : null
          })
          ids.push(item.id)
        }
      } finally {
        useActionHistory.getState().endBatch(`Filed ${take.length} from the meeting`)
      }
      useNoticeStore.getState().show({
        text: `Filed ${take.length} commitment${take.length === 1 ? '' : 's'} — they live on the meeting's desk`,
        icon: 'task_alt'
      })
      window.dispatchEvent(new CustomEvent('fb:workitems-changed'))
      onFiled()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter') {
        e.preventDefault()
        void fileChecked()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, busy])

  if (rows.length === 0) return null

  return (
    <div className="rounded-[var(--radius-card)] border border-accent/30 bg-accent/[0.05] p-3" data-testid="meeting-commitments">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="auto_awesome" size={14} className="text-[rgb(var(--accent))]" />
        <span className="text-[13px] font-semibold text-[var(--ink-100)]">
          Plexii found {rows.length} thing{rows.length === 1 ? '' : 's'} in this meeting
        </span>
        <span className="fb-t-caption text-[var(--ink-40)] ml-auto">nothing files until you say so</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((c, idx) => (
          <div
            key={idx}
            data-testid="commitment-row"
            className={`flex items-start gap-2.5 rounded-[var(--radius-row)] px-2.5 py-2 bg-[var(--surface-raised)] ${
              c.checked ? '' : 'opacity-70'
            }`}
          >
            <button
              onClick={() => setRows(rows.map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r)))}
              className="mt-0.5 shrink-0 fb-press"
              data-testid={`commitment-check-${idx}`}
              aria-label={c.checked ? 'Uncheck' : 'Check'}
            >
              <Icon
                name={c.checked ? 'check_box' : 'check_box_outline_blank'}
                size={17}
                className={c.checked ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-40)]'}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[var(--ink-100)] break-words">{c.title}</div>
              <div className="fb-t-caption text-[var(--ink-45)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() =>
                    setRows(
                      rows.map((r, i) => {
                        if (i !== idx) return r
                        const order = CLASS_CHOICES.map((cc) => cc.value)
                        const next = order[(order.indexOf(r.intentClass) + 1) % order.length]
                        return { ...r, intentClass: next }
                      })
                    )
                  }
                  className="text-[rgb(var(--accent))] fb-press"
                  title="Change the category"
                >
                  {CLASS_LABEL[c.intentClass] ?? c.intentClass}
                </button>
                {c.dueAt && (
                  <span>
                    · due{' '}
                    {new Date(c.dueAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {!c.mine && (
                  <span className="text-amber-700 dark:text-amber-400" data-testid="commitment-other-owner">
                    · owner is {c.ownerName ?? 'someone else'}, not you
                  </span>
                )}
              </div>
              {c.anchored && c.segment ? (
                <div className="fb-t-caption text-[var(--ink-45)] mt-1 border-l-2 border-[var(--edge-strong)] pl-2 break-words">
                  [{fmtAnchor(c.segment.startMs)}] {c.segment.speakerName}: “{c.segment.text.slice(0, 120)}
                  {c.segment.text.length > 120 ? '…' : ''}”
                </div>
              ) : (
                <div className="fb-t-caption text-[rgb(var(--accent))] mt-1 italic" data-testid="commitment-unanchored">
                  No transcript anchor — the machine’s reading, verify before you rely on it
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="fb-t-caption text-[var(--ink-40)] flex-1">everything stays on this meeting’s desk</span>
        <button
          onClick={() => void fileChecked()}
          disabled={busy || checkedCount === 0}
          className="btn-primary !h-8"
          data-testid="file-commitments"
        >
          <span>
            File {checkedCount} item{checkedCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden className="rounded bg-white/20 px-1 text-[11px] leading-4">↵</span>
        </button>
      </div>
    </div>
  )
}
