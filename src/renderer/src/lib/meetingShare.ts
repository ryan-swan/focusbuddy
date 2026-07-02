import type { ShareableKind } from '@shared/types'
import { useSharesStore } from '../stores/shares'
import { useNodeStore } from '../stores/nodes'
import { useAccountStore } from '../stores/account'
import { useMeetingRoomStore } from '../stores/meetingRoom'
import { buildFolderSnapshot, generateAnonymousHandle } from './shareSnapshot'
import { buildDocumentSnapshot } from './officeShareSnapshot'
import { accessToShare, type MeetingAccessLevel } from './meetingAccess'
import {
  createLiveDoc,
  inviteToLiveDocByEmail,
  setLiveDocMemberRole,
  removeLiveDocMember
} from './docCollabClient'
import type { MeetingOrigin } from './startMeeting'

// docTypes that have a live (co-editable) editor. Collaborate on one of these
// opens a real shared document; other origins fall back to an editable copy.
const LIVE_DOC_KINDS = new Set(['doc', 'sheet', 'slides'])

// What happens to a collaborate grant once the meeting ends. Collaborate access
// is only meant to last for the meeting by default: attendees work on the
// artifact while the meeting is live, then it becomes read-only. The host can
// instead keep the access, or revoke it entirely, when they start the meeting.
export type MeetingAfterAccess = 'downgrade-view' | 'keep' | 'revoke'

// Collaborate shares waiting for the meeting to end so they can be downgraded or
// revoked. Held in memory for the life of the session; a downgrade that is
// pending when the app closes simply does not run (the collaborate share
// persists), which is a safe, non-destructive miss.
interface PendingDowngrade {
  shareId: string
  after: MeetingAfterAccess
  snapshot: unknown
  fromHandle: string
}
let pendingDowngrades: PendingDowngrade[] = []

// Live-doc collaborators waiting for the meeting to end. On end they are turned
// read-only (viewer), removed (revoke), or left as editors (keep).
interface PendingLiveDowngrade {
  token: string
  liveDocId: string
  memberAccountIds: string[]
  after: MeetingAfterAccess
}
let pendingLiveDowngrades: PendingLiveDowngrade[] = []
let endWatcherInstalled = false

// Grants a meeting's attendees access to the artifact it was started from. This
// is the "trickle down" step: one share of the source artifact is minted at the
// level the host chose (view-once / view-always / collaborate), and every
// attendee is invited onto it, which records them as a recipient (so it lands in
// their PlexiDesk inbox) and emails them the link. Recording the recipient does
// not depend on email delivery, so an attendee still gets access in-app even
// when the notification email cannot be sent; the result reports both honestly.

export interface MeetingShareResult {
  shared: number // attendees granted access (recorded as recipients)
  emailed: number // of those, how many were emailed the link
  failed: string[] // attendees that could not be granted at all
}

// Resolve a meeting origin into the shareable artifact behind it, or null when
// the origin has no single artifact to share (chat, calendar, a plain start).
async function resolveArtifact(
  origin: MeetingOrigin,
  handle: string
): Promise<{ kind: ShareableKind; entityId: string; label: string; snapshot: unknown } | null> {
  if (origin.kind === 'desk') {
    const nodes = useNodeStore.getState().nodes
    const node = nodes.find((n) => n.id === origin.nodeId)
    if (!node) return null
    return {
      kind: 'folder', // a desk is a top-level folder node
      entityId: node.id,
      label: node.title || 'Desk',
      snapshot: await buildFolderSnapshot(node, nodes, handle)
    }
  }
  if (
    origin.kind === 'doc' ||
    origin.kind === 'sheet' ||
    origin.kind === 'slides' ||
    origin.kind === 'draw' ||
    origin.kind === 'design'
  ) {
    const doc = await window.api.documents.get(origin.id)
    if (!doc) return null
    return {
      kind: 'document',
      entityId: doc.id,
      label: doc.title || origin.title || 'Document',
      snapshot: buildDocumentSnapshot(doc, handle)
    }
  }
  return null
}

export async function shareArtifactWithAttendees(input: {
  origin: MeetingOrigin
  attendees: string[]
  level: MeetingAccessLevel
  // Only meaningful for the collaborate level. Defaults to downgrade-view.
  afterAccess?: MeetingAfterAccess
}): Promise<MeetingShareResult | null> {
  const emails = input.attendees.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))
  if (emails.length === 0) return { shared: 0, emailed: 0, failed: [] }

  // Collaborate on a live-capable document opens ONE shared document everyone
  // edits together in real time — genuine co-editing, not a copy each. Every
  // other case (view levels, or collaborate on a desk/drawing) uses a share.
  if (input.level === 'collaborate' && LIVE_DOC_KINDS.has(input.origin.kind)) {
    const live = await collaborateLive(input.origin, emails, input.afterAccess ?? 'downgrade-view')
    if (live) return live
    // If the live doc could not be created, fall through to the copy share so
    // attendees still get access rather than nothing.
  }

  return shareViaCopy(input.origin, emails, input.level, input.afterAccess ?? 'downgrade-view')
}

// Real co-editing: seed a live document from the source, add each attendee who
// is an existing user as an editor member, and remember them so the meeting's
// end can turn them read-only, remove them, or leave them. Attendees with no
// account cannot co-edit, so they get an editable-copy share instead.
async function collaborateLive(
  origin: MeetingOrigin,
  emails: string[],
  after: MeetingAfterAccess
): Promise<MeetingShareResult | null> {
  const token = useAccountStore.getState().sessionToken
  if (!token || origin.kind === 'desk' || origin.kind === 'chat' || origin.kind === 'calendar' || origin.kind === 'standalone') {
    return null
  }
  const doc = await window.api.documents.get(origin.id)
  if (!doc) return null
  const live = await createLiveDoc(token, {
    docType: origin.kind,
    title: doc.title || origin.title || 'Meeting document',
    body: JSON.stringify(doc.body ?? {})
  })
  if (!live) return null

  const memberAccountIds: string[] = []
  const noAccount: string[] = []
  const failed: string[] = []
  for (const email of emails) {
    const r = await inviteToLiveDocByEmail(token, live.id, email)
    if (!r.ok) failed.push(email)
    else if (r.accountId) memberAccountIds.push(r.accountId)
    else noAccount.push(email) // not a user yet — copy-share them below
  }

  if (after !== 'keep' && memberAccountIds.length > 0) {
    pendingLiveDowngrades.push({ token, liveDocId: live.id, memberAccountIds, after })
    installMeetingEndDowngrade()
  }

  // Non-users still get the content via an editable copy so they are not shut
  // out of a meeting they were invited to.
  let shared = memberAccountIds.length
  let emailed = 0
  if (noAccount.length > 0) {
    const fb = await shareViaCopy(origin, noAccount, 'collaborate', after)
    if (fb) {
      shared += fb.shared
      emailed += fb.emailed
      failed.push(...fb.failed)
    }
  }
  return { shared, emailed, failed }
}

// The share-link path: mint one share of the artifact at the level's scope and
// invite each attendee onto it. Meeting-scoped levels (view-once, collaborate)
// are remembered so the meeting's end revokes or downgrades them precisely.
async function shareViaCopy(
  origin: MeetingOrigin,
  emails: string[],
  level: MeetingAccessLevel,
  after: MeetingAfterAccess
): Promise<MeetingShareResult | null> {
  const handle = generateAnonymousHandle()
  const artifact = await resolveArtifact(origin, handle)
  if (!artifact) return null

  // A live meeting has no set end; assume an hour so a view-once link stays
  // valid across the meeting plus the grace window in accessToShare.
  const endsAt = Date.now() + 60 * 60 * 1000
  const { scope, expiresAt } = accessToShare(level, endsAt)

  const shares = useSharesStore.getState()
  let token: string
  let shareId: string
  try {
    const link = await shares.createFor({
      kind: artifact.kind,
      entityId: artifact.entityId,
      label: artifact.label,
      scope,
      expiresAt,
      snapshot: artifact.snapshot,
      fromHandle: handle
    })
    token = link.token
    shareId = link.id
  } catch {
    return null
  }

  if (level === 'view-once') {
    pendingDowngrades.push({ shareId, after: 'revoke', snapshot: artifact.snapshot, fromHandle: handle })
    installMeetingEndDowngrade()
  } else if (level === 'collaborate' && after !== 'keep') {
    pendingDowngrades.push({ shareId, after, snapshot: artifact.snapshot, fromHandle: handle })
    installMeetingEndDowngrade()
  }

  let shared = 0
  let emailed = 0
  const failed: string[] = []
  for (const email of emails) {
    try {
      const { emailDelivered } = await shares.invite(token, email)
      shared += 1
      if (emailDelivered) emailed += 1
    } catch {
      failed.push(email)
    }
  }
  return { shared, emailed, failed }
}

// Apply the end-of-meeting behaviour to every pending collaborate grant:
// downgrade it to read-only, or revoke it. Runs when the meeting ends.
async function applyMeetingEndDowngrades(): Promise<void> {
  if (pendingDowngrades.length === 0 && pendingLiveDowngrades.length === 0) return

  // Share-link grants: revoke, or downgrade the copy to read-only view.
  const shareQueue = pendingDowngrades
  pendingDowngrades = []
  const shares = useSharesStore.getState()
  for (const p of shareQueue) {
    try {
      if (p.after === 'revoke') {
        await shares.revoke(p.shareId)
      } else {
        await shares.setScope(p.shareId, 'view', { snapshot: p.snapshot, fromHandle: p.fromHandle })
      }
    } catch {
      /* a failed downgrade leaves the grant in place — non-destructive */
    }
  }

  // Live-doc collaborators: turn read-only (viewer), remove (revoke), or keep.
  const liveQueue = pendingLiveDowngrades
  pendingLiveDowngrades = []
  for (const p of liveQueue) {
    for (const accountId of p.memberAccountIds) {
      try {
        if (p.after === 'revoke') await removeLiveDocMember(p.token, p.liveDocId, accountId)
        else if (p.after === 'downgrade-view') await setLiveDocMemberRole(p.token, p.liveDocId, accountId, 'viewer')
      } catch {
        /* a failed change leaves the collaborator's access in place — non-destructive */
      }
    }
  }
}

// Watch the meeting room and run the downgrades the moment a meeting ends (the
// room status leaves 'in'). Installed lazily the first time a meeting-scoped
// collaborate grant is created, and only once per session.
export function installMeetingEndDowngrade(): void {
  if (endWatcherInstalled) return
  endWatcherInstalled = true
  let wasIn = useMeetingRoomStore.getState().status === 'in'
  useMeetingRoomStore.subscribe((state) => {
    const isIn = state.status === 'in'
    if (wasIn && !isIn) void applyMeetingEndDowngrades()
    wasIn = isIn
  })
}
