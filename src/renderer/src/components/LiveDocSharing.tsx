import { useState } from 'react'
import Icon from './Icon'
import SharePeoplePicker, { type SharePick } from './SharePeoplePicker'
import {
  createLiveDoc,
  inviteToLiveDoc,
  inviteToLiveDocByEmail,
  setLiveDocMemberRole
} from '../lib/docCollabClient'
import { useAccountStore } from '../stores/account'
import { useViewStore } from '../stores/view'

// Live people-sharing for an office file (a local document). Sharing promotes the
// document to a live, co-edited document (the same "collaborate" path the hub
// uses), invites the chosen people, and switches the sharer into the live copy so
// everyone edits the same file. Uses the shared multi-select picker.
export default function LiveDocSharing({
  documentId,
  onClose
}: {
  documentId: string
  onClose: () => void
}): JSX.Element {
  const [perm, setPerm] = useState<'view' | 'edit'>('edit')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const goLiveDoc = useViewStore((s) => s.goLiveDoc)

  async function onShare(picks: SharePick[]): Promise<{ ok: boolean; error?: string }> {
    const token = useAccountStore.getState().sessionToken
    if (!token) {
      setMsg('Sign in to share this file.')
      return { ok: false }
    }
    setBusy(true)
    setMsg(null)
    const doc = await window.api.documents.get(documentId)
    if (!doc) {
      setMsg('Could not load this document.')
      setBusy(false)
      return { ok: false }
    }
    const created = await createLiveDoc(token, {
      docType: doc.docType,
      title: doc.title,
      body: JSON.stringify(doc.body)
    })
    if (!created) {
      setMsg('Could not start live sharing. Check your connection and that you are signed in.')
      setBusy(false)
      return { ok: false }
    }
    for (const p of picks) {
      let accId: string | null = null
      if (p.handle) {
        const r = await inviteToLiveDoc(token, created.id, p.handle).catch(() => null)
        accId = r?.member?.accountId ?? null
      } else if (p.email) {
        const r = await inviteToLiveDocByEmail(token, created.id, p.email).catch(() => null)
        accId = r?.accountId ?? null
      }
      if (perm === 'view' && accId) await setLiveDocMemberRole(token, created.id, accId, 'viewer').catch(() => {})
    }
    setBusy(false)
    // Move the sharer into the live copy so everyone is editing the same document.
    goLiveDoc(created.id)
    onClose()
    return { ok: true }
  }

  return (
    <div className="rounded-md border-2 border-accent/40 bg-accent/[0.04] p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-accent">
        <Icon name="bolt" size={12} />
        Live sharing (real-time)
      </div>
      <p className="text-[11px] text-[var(--ink-50)] leading-snug">
        Sharing turns this into a live document everyone edits together, and switches you to the shared copy.
        Add as many people as you like.
      </p>
      <SharePeoplePicker perm={perm} onPermChange={setPerm} busy={busy} onShare={onShare} msg={msg} />
    </div>
  )
}
