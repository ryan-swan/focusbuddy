import { useCallback, useEffect, useState } from 'react'
import { useAccountStore } from '../../stores/account'
import { usePresenceStore, type PresenceStatus } from '../../stores/presence'
import { getPeopleMap, absolutePhotoUrl, type PeopleMap, type PeopleMapPerson, type Office, type WorkWindow } from '../orgsClient'

// One person as the People Map renders them: their static org profile (from the
// server) plus their live presence status (from the presence socket). No sample
// data — liveStatus is 'offline' until the presence channel says otherwise.
export interface MapPerson extends PeopleMapPerson {
  liveStatus: PresenceStatus
  liveWorkingOn: string | null
  isSelf: boolean
}

export interface PeopleMapData {
  orgId: string
  defaultHours: WorkWindow
  offices: Office[]
  people: MapPerson[]
}

interface Result {
  data: PeopleMapData | null
  loading: boolean
  error: string | null
  refresh: () => void
}

// Fetch the org People Map and keep it live: re-merges presence on every
// presence-store change, and re-fetches the structure on demand.
export function usePeopleMap(orgId: string | null): Result {
  const token = useAccountStore((s) => s.sessionToken)
  const myId = useAccountStore((s) => s.account?.id ?? null)
  const peers = usePresenceStore((s) => s.peers)
  const myStatus = usePresenceStore((s) => s.myStatus)
  const myWorkingOn = usePresenceStore((s) => s.myWorkingOn)

  const [raw, setRaw] = useState<PeopleMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token || !orgId) {
      setRaw(null)
      return
    }
    setLoading(true)
    setError(null)
    const map = await getPeopleMap(token, orgId)
    if (!map) setError('Could not load the People Map.')
    setRaw(map)
    setLoading(false)
  }, [token, orgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Merge live presence over the static structure. Recomputed whenever presence
  // changes, so statuses update the instant the socket pushes them.
  const data: PeopleMapData | null = raw
    ? {
        orgId: raw.orgId,
        defaultHours: raw.defaultHours,
        offices: raw.offices,
        people: raw.people.map((p) => {
          const isSelf = p.accountId === myId
          const peer = peers[p.accountId]
          const liveStatus: PresenceStatus = isSelf ? myStatus : peer ? peer.status : 'offline'
          const liveWorkingOn = isSelf ? myWorkingOn : peer ? peer.workingOn : null
          // The feed gives a relative photo URL; resolve it so an <img> can load it.
          const photoUrl = p.photoUrl ? absolutePhotoUrl(p.photoUrl) : null
          return { ...p, liveStatus, liveWorkingOn, isSelf, photoUrl }
        })
      }
    : null

  return { data, loading, error, refresh }
}
