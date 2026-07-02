import type { ShareableKind } from '@shared/types'
import { useSharesStore } from '../stores/shares'
import { useNodeStore } from '../stores/nodes'
import { useMeetingRoomStore } from '../stores/meetingRoom'
import { buildFolderSnapshot, generateAnonymousHandle } from './shareSnapshot'
import { buildDocumentSnapshot } from './officeShareSnapshot'
import { accessToShare, type MeetingAccessLevel } from './meetingAccess'
import type { MeetingOrigin } from './startMeeting'

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

  const handle = generateAnonymousHandle()
  const artifact = await resolveArtifact(input.origin, handle)
  if (!artifact) return null

  // A live meeting has no set end; assume an hour so a view-once link stays
  // valid across the meeting plus the grace window in accessToShare.
  const endsAt = Date.now() + 60 * 60 * 1000
  const { scope, expiresAt } = accessToShare(input.level, endsAt)

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

  // A collaborate grant is meeting-scoped by default: remember it so it can be
  // downgraded to read-only (or revoked) when the meeting ends.
  const after = input.afterAccess ?? 'downgrade-view'
  if (input.level === 'collaborate' && after !== 'keep') {
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
  if (pendingDowngrades.length === 0) return
  const queue = pendingDowngrades
  pendingDowngrades = []
  const shares = useSharesStore.getState()
  for (const p of queue) {
    try {
      if (p.after === 'revoke') {
        await shares.revoke(p.shareId)
      } else {
        // Downgrade the same share from an editable copy to read-only view.
        await shares.setScope(p.shareId, 'view', { snapshot: p.snapshot, fromHandle: p.fromHandle })
      }
    } catch {
      /* a failed downgrade leaves the collaborate share in place — non-destructive */
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
