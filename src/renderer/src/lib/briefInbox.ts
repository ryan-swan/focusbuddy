// Q14, the receiving half — the RECIPIENT's per-series opt-in.
//
// A brief arrives as a normal DM (briefOutbox composes it; the last line is
// the plexii://brief marker). This module decides what ELSE happens, and the
// decision belongs entirely to the recipient:
//   followBriefs null  (never asked) → a notice ASKS: "file it + follow this
//                        series?" — nothing files until they say so (the
//                        confirm-stop doctrine, reduced to one toast);
//   followBriefs true  → file a to_know item quietly, with a door OUT
//                        ("stop following") on the same notice;
//   followBriefs false → nothing. The chat message stays readable; declining
//                        the machinery never hides the prose.
//
// The filed item is sourceType 'note' — the meeting row lives on the HOST's
// machine, and a chip pointing at a meeting this client does not have would
// be a dead door dressed as a live one.
//
// A processed-id ledger (localStorage, capped) makes ingestion idempotent:
// the same message arrives via the live socket AND every later history load,
// and must act exactly once.

import { parseBriefMessage } from './meetingLink'
import type { ChatMessage } from './messagingClient'

const LEDGER_KEY = 'fb.briefs.processed'
const LEDGER_CAP = 300

function ledgerHas(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]') as string[]).includes(id)
  } catch {
    return false
  }
}

function ledgerAdd(id: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]') as string[]
    list.push(id)
    localStorage.setItem(LEDGER_KEY, JSON.stringify(list.slice(-LEDGER_CAP)))
  } catch {
    /* a private-mode storage failure degrades to possible duplicate asks */
  }
}

export interface BriefInboxDeps {
  selfAccountId: string | null
  senderName: string
  getPrefs: (seriesId: string) => Promise<{ followBriefs: boolean | null }>
  setPrefs: (seriesId: string, patch: { followBriefs: boolean }) => Promise<unknown>
  fileItem: (input: { title: string; notes: string }) => Promise<unknown>
  notify: (n: { text: string; icon?: string; action?: { label: string; run: () => void } }) => void
}

/** Inspect one message; act at most once. Exported with injected deps so the
 *  decision table is unit-testable without stores. */
export async function ingestBrief(message: ChatMessage, deps: BriefInboxDeps): Promise<void> {
  if (!message.body || message.deletedAt) return
  if (deps.selfAccountId && message.fromAccount === deps.selfAccountId) return
  const brief = parseBriefMessage(message.body)
  if (!brief) return
  if (ledgerHas(message.id)) return
  ledgerAdd(message.id)

  const file = async (): Promise<void> => {
    await deps
      .fileItem({ title: `Meeting brief — ${brief.title}`, notes: brief.summary })
      .catch(() => null)
  }
  const prefs = await deps.getPrefs(brief.seriesId).catch(() => ({ followBriefs: null as boolean | null }))
  if (prefs.followBriefs === false) return
  if (prefs.followBriefs === true) {
    await file()
    deps.notify({
      text: `Meeting brief filed — ${brief.title}`,
      icon: 'history_edu',
      action: {
        label: 'Stop following this series',
        run: () => void deps.setPrefs(brief.seriesId, { followBriefs: false })
      }
    })
    return
  }
  // Never asked: the notice IS the opt-in. Nothing files until they say so.
  deps.notify({
    text: `${deps.senderName} shared the meeting brief for “${brief.title}”`,
    icon: 'history_edu',
    action: {
      label: 'File it + follow this series',
      run: () => {
        void deps.setPrefs(brief.seriesId, { followBriefs: true })
        void file()
      }
    }
  })
}

/** The live wrapper the messaging store calls — binds real stores lazily so
 *  this module stays import-cycle-free. Fire-and-forget by design. */
export function maybeIngestBrief(message: ChatMessage, senderName: string): void {
  void (async () => {
    const { useAccountStore } = await import('../stores/account')
    const { useWorkItemStore } = await import('../stores/workItems')
    const { useNoticeStore } = await import('../stores/notice')
    await ingestBrief(message, {
      selfAccountId: useAccountStore.getState().account?.id ?? null,
      senderName,
      getPrefs: (seriesId) => window.api.meetings.getSeriesPrefs(seriesId),
      setPrefs: (seriesId, patch) => window.api.meetings.setSeriesPrefs(seriesId, patch),
      fileItem: (input) =>
        useWorkItemStore.getState().create({
          title: input.title,
          notes: input.notes,
          intentClass: 'to_know',
          dueAt: null,
          confidence: 1,
          approvalState: 'approved',
          wiOrigin: 'ai',
          sourceType: 'note'
        }),
      notify: (n) => useNoticeStore.getState().show(n, 10000)
    })
  })().catch(() => {})
}
