import { useRef, useState } from 'react'
import type { ActionProposal, AppliedProposal } from '@shared/types'
import { useActionHistory } from '../stores/actionHistory'
import { applyProposal, describeProposal } from '../lib/actionExecutor'
import { resolveGoToTarget, goToTarget } from '../lib/goToTarget'
import Icon from './Icon'

// ── Inline action-proposal cards ────────────────────────────────────────────
//
// Each ActionProposal renders as a clickable card. On apply, the executor
// mutates the workspace; on success the card turns green (done) and STAYS in the
// thread as a durable record with an optional "Go to". Dismiss (×) removes an
// un-applied suggestion. Multiple cards can be applied; "Apply all" runs them.
//
// Store-agnostic: the applied-state + the mark-applied callback are passed in by
// the host surface, so the SAME component works for the in-memory side-panel
// assistant (useChatStore) AND the persisted Focus chat (useFocusChatStore).
//
// Both are OPTIONAL so a surface can adopt this component before it has anywhere
// to keep applied-state. Omit them and an applied card is simply consumed on
// success (the pre-durable-record behaviour) — no store change required. Pass
// them and the card becomes a durable green record with a "Go to". PlexiChat
// (MessagesView) is on the fallback today; wiring applied-state into
// stores/messaging.ts is all it needs to gain the richer behaviour.

interface ProposalCardsProps {
  proposals: ActionProposal[]
  activeTaskId: string | null
  // Optional destination folder for document-producing proposals (e.g. the
  // meeting wrap-up files deliverables into the meeting folder). Threaded to the
  // applier; ignored by proposals that don't create documents.
  destinationFolderId?: string | null
  // Applied-card state keyed by proposal id (from the host surface's store).
  // Omitted → no card is ever shown as applied (see onApplied).
  appliedProposals?: Record<string, AppliedProposal>
  // Record that a proposal was approved (the host persists / stores it).
  // Omitted → the card is consumed on success instead of kept as a record.
  onApplied?: (proposalId: string, applied: AppliedProposal) => void
  // Remove an un-applied suggestion (dismiss).
  onConsume: (proposalId: string) => void
}

const NO_APPLIED: Record<string, AppliedProposal> = {}

export default function ProposalCards({
  proposals,
  activeTaskId,
  destinationFolderId = null,
  appliedProposals = NO_APPLIED,
  onApplied,
  onConsume
}: ProposalCardsProps): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: string; ok: boolean; message: string } | null>(
    null
  )

  // resolvedIds threads newly-created entity ids (today: tables) through a
  // batch so a follow-up proposal (today: add-table-row) can reference what
  // an earlier one created via "$<proposalId>" symbolic refs. Held in a ref
  // so a per-card click survives outside of a single applyAll() loop —
  // without this, clicking Apply on an add-table-row card after manually
  // applying its parent create-table card would still fail because the
  // resolution map was local to applyAll's stack frame.
  const batchResolvedIds = useRef<Map<string, string>>(new Map())

  // Single place the "what happens to a card once it succeeds" decision lives.
  // With an applied-state store the card becomes a durable green record with a
  // "Go to"; without one it is consumed, matching the pre-durable behaviour.
  // Every success path (direct apply + each auto-applied parent dependency)
  // routes through here so the two modes can never drift apart.
  function recordApplied(
    p: ActionProposal,
    message: string,
    resolvedIds: Map<string, string>
  ): void {
    if (onApplied) {
      onApplied(p.id, {
        message,
        target: resolveGoToTarget(p, resolvedIds),
        appliedAt: Date.now()
      })
    } else {
      onConsume(p.id)
    }
  }

  // Detect "I depend on a proposal that hasn't been applied yet" cases.
  // When the user clicks Apply on a single dependent card (e.g. an
  // add-table-row pointing at $tbl-1), we look up the parent in the
  // current proposals array and run it first, threading the resolved id
  // into the batch map so the child's apply succeeds. Today only
  // add-table-row → create-table exists; the helper is structured so
  // new dependent kinds slot in by adding a case to the switch.
  async function ensureDependencies(
    p: ActionProposal,
    resolvedIds: Map<string, string>
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (p.kind === 'add-table-row' && p.tableId.startsWith('$')) {
      const refKey = p.tableId.slice(1)
      if (resolvedIds.has(refKey)) return { ok: true }
      const parent = proposals.find(
        (x) => x.id === refKey && x.kind === 'create-table'
      )
      if (!parent) {
        return {
          ok: false,
          message:
            'Row references a table that was never proposed alongside it — try regenerating the request.'
        }
      }
      const parentResult = await applyProposal(parent, { activeTaskId, resolvedIds, destinationFolderId })
      if (!parentResult.ok) {
        return {
          ok: false,
          message: `Couldn't auto-create parent table: ${parentResult.message}`
        }
      }
      // Parent landed — mark it applied (green record) rather than removing it,
      // so an auto-created dependency reads the same as a manually-applied one.
      recordApplied(parent, parentResult.message, resolvedIds)
    }
    // edit-document → create-document in the same batch, same shape.
    // `generate-document` counts as a parent too: it also produces a document,
    // so an edit referencing one must resolve against it. Carried over from
    // da4938b, which added it to the inlined copy this component replaced —
    // converging the fork must not drop the fix that lived in the fork.
    if (p.kind === 'edit-document' && p.documentId.startsWith('$')) {
      const refKey = p.documentId.slice(1)
      if (!resolvedIds.has(refKey)) {
        const parent = proposals.find(
          (x) => x.id === refKey && (x.kind === 'create-document' || x.kind === 'generate-document')
        )
        if (!parent) {
          return {
            ok: false,
            message: 'Edit references a document that was never proposed alongside it — try regenerating.'
          }
        }
        const parentResult = await applyProposal(parent, { activeTaskId, resolvedIds, destinationFolderId })
        if (!parentResult.ok) {
          return { ok: false, message: `Couldn't auto-create the document first: ${parentResult.message}` }
        }
        recordApplied(parent, parentResult.message, resolvedIds)
      }
    }
    // schedule-event bound to a create-task in the same batch.
    if (p.kind === 'schedule-event' && p.taskId && p.taskId.startsWith('$')) {
      const refKey = p.taskId.slice(1)
      if (!resolvedIds.has(refKey)) {
        const parent = proposals.find((x) => x.id === refKey && x.kind === 'create-task')
        if (!parent) {
          return { ok: false, message: 'Event references a task that was never proposed alongside it.' }
        }
        const parentResult = await applyProposal(parent, { activeTaskId, resolvedIds, destinationFolderId })
        if (!parentResult.ok) {
          return { ok: false, message: `Couldn't auto-create the task first: ${parentResult.message}` }
        }
        recordApplied(parent, parentResult.message, resolvedIds)
      }
    }
    return { ok: true }
  }

  async function applyOne(
    p: ActionProposal,
    resolvedIds?: Map<string, string>
  ): Promise<void> {
    if (busy) return
    const ids = resolvedIds ?? batchResolvedIds.current
    setBusy(p.id)
    const dep = await ensureDependencies(p, ids)
    if (!dep.ok) {
      setBusy(null)
      setToast({ id: p.id, ok: false, message: dep.message })
      setTimeout(() => setToast((t) => (t?.id === p.id ? null : t)), 2800)
      return
    }
    // A canvas handler (or its store IPC) can throw rather than return a
    // failure envelope. Without this guard the throw skipped setBusy(null), so
    // every Apply button stayed disabled and the panel looked frozen. Always
    // clear busy and show an honest failure chip; the card stays for a retry.
    let result: { ok: boolean; message: string }
    try {
      result = await applyProposal(p, { activeTaskId, resolvedIds: ids, destinationFolderId })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Could not apply that action.' }
    }
    setBusy(null)
    // On success the card is NOT removed — it turns green + gains a "Go to" and
    // stays in the thread as a durable record. We resolve where "Go to" jumps
    // from the proposal + the ids the executor stashed for creations. Failures
    // keep the card clickable (so the user can read the message + retry) and are
    // shown as an inline toast.
    if (result.ok) {
      recordApplied(p, result.message, ids)
    } else {
      setToast({ id: p.id, ok: false, message: result.message })
      setTimeout(() => setToast((t) => (t?.id === p.id ? null : t)), 2200)
    }
  }

  async function applyAll(): Promise<void> {
    if (busy) return
    // Only apply the ones not already done (applied cards stay as green records).
    const pending = proposals.filter((p) => !appliedProposals[p.id])
    if (pending.length === 0) return
    // Confirm before a batch that destroys anything — undo exists as a backstop,
    // but a one-click bulk delete deserves a heads-up.
    const destructive = pending.filter((p) => p.kind === 'delete-widget')
    if (destructive.length > 0) {
      const ok = window.confirm(
        `This will delete ${destructive.length} item${destructive.length > 1 ? 's' : ''} from your canvas. You can undo it afterwards. Apply all ${pending.length} change${pending.length > 1 ? 's' : ''}?`
      )
      if (!ok) return
    }
    const resolvedIds = batchResolvedIds.current
    // Coalesce the whole batch into one undo entry, so a single Cmd-Z (or the
    // toast's Undo) reverses the entire "Apply all".
    useActionHistory.getState().beginBatch()
    try {
      for (const p of pending) {
        // Sequential so error messages from one don't get clobbered by the
        // next, AND so symbolic-id refs resolve in order (create-table must
        // run before its add-table-row siblings).
        await applyOne(p, resolvedIds)
      }
    } finally {
      useActionHistory
        .getState()
        .endBatch(`Apply ${proposals.length} AI change${proposals.length > 1 ? 's' : ''}`)
    }
  }

  // Only the not-yet-applied proposals are candidates for "Apply all".
  const pendingCount = proposals.filter((p) => !appliedProposals[p.id]).length

  return (
    <div className="ml-0 mr-auto max-w-[92%] flex flex-col gap-1">
      {proposals.map((p) => {
        const desc = describeProposal(p)
        const isBusy = busy === p.id
        const showToast = toast?.id === p.id
        const applied = appliedProposals[p.id]

        // ── Applied (done) card: green, kept as a durable record, with an
        //    optional "Go to". Not clickable-to-apply; never dismissed.
        if (applied) {
          return (
            <div
              key={p.id}
              data-testid={`proposal-card-applied-${p.id}`}
              className="rounded-md border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-md inline-flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Icon name="check" size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80">
                    {desc.verb} · done
                  </div>
                  <div className="text-[12px] font-medium text-[var(--ink-100)] truncate">
                    {desc.subject}
                  </div>
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 leading-snug">
                    {applied.message}
                  </div>
                </div>
                {applied.target && (
                  <button
                    onClick={() => void goToTarget(applied.target!)}
                    title="Go to what this created"
                    data-testid={`proposal-goto-${p.id}`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-800/60 bg-[var(--surface-raised)] hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 transition-colors"
                  >
                    <span>Go to</span>
                    <Icon name="north_east" size={12} />
                  </button>
                )}
              </div>
            </div>
          )
        }

        // ── Pending card: clickable to apply, × to dismiss.
        return (
          <button
            key={p.id}
            onClick={() => void applyOne(p)}
            disabled={isBusy}
            data-testid={`proposal-card-${p.id}`}
            className="text-left rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-accent hover:bg-accent/5 px-2.5 py-1.5 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-md inline-flex items-center justify-center bg-accent/10 text-accent shrink-0">
                <Icon name={desc.icon} size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-50)]">
                  {desc.verb}
                </div>
                <div className="text-[12px] font-medium text-[var(--ink-100)] truncate">
                  {desc.subject}
                </div>
                {p.reason && (
                  <div className="text-[10px] text-[var(--ink-50)] mt-0.5 leading-snug">
                    {p.reason}
                  </div>
                )}
                {showToast && (
                  <div className="text-[10px] mt-1 text-amber-700 dark:text-amber-400">
                    ⚠ {toast.message}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isBusy && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      onConsume(p.id)
                    }}
                    title="Dismiss this suggestion"
                    role="button"
                    className="icon-btn !h-5 !w-5"
                  >
                    <Icon name="close" size={11} />
                  </span>
                )}
                <span className="text-[10px] text-accent font-medium px-1">
                  {isBusy ? '…' : 'apply'}
                </span>
              </div>
            </div>
          </button>
        )
      })}
      {pendingCount > 1 && (
        <button
          onClick={() => void applyAll()}
          disabled={busy !== null}
          className="text-[11px] text-accent self-start px-1.5 py-0.5 hover:underline disabled:opacity-50"
        >
          Apply all {pendingCount}
        </button>
      )}
    </div>
  )
}
