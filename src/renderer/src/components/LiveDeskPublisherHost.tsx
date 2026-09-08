import { useEffect, useState, type JSX } from 'react'
import { useLiveDeskPublisher } from '../lib/useLiveDeskPublisher'

// Keeps every published desk current, for as long as the app is running.
//
// Publishing used to live inside the share dialog's Live web view panel, which
// meant a "live" desk was live exactly while its share panel was on screen. It
// belongs to the app, so it is mounted once at the root.
//
// Which desks are published is ANNOUNCED by the main process rather than asked
// for. The previous version pulled the list with an invoke, and that invoke
// stopped settling -- neither resolving nor rejecting -- which disabled
// publishing completely and silently, because every branch that would have
// reported the problem sat downstream of the call that hung. Listening removes
// the request from the critical path, and a missed announcement is corrected by
// the next one.

function DeskPublisher({ deskId }: { deskId: string }): null {
  useLiveDeskPublisher(deskId)
  useEffect(() => {
    void window.api.liveDesk.note(deskId, 'publisher mounted')
  }, [deskId])
  return null
}

export default function LiveDeskPublisherHost(): JSX.Element | null {
  const [deskIds, setDeskIds] = useState<string[]>([])

  useEffect(() => {
    void window.api.liveDesk.note('*', 'renderer: host listening')
    return window.api.liveDesk.onDesks((rows) => {
      const next = rows.map((r) => r.deskId).sort()
      void window.api.liveDesk.note('*', `renderer: announced ${rows.length}`)
      // Replaced only on a real change, so publishers are not torn down and
      // remounted on every announcement.
      setDeskIds((prev) => (prev.join(',') === next.join(',') ? prev : next))
    })
  }, [])

  if (deskIds.length === 0) return null
  return (
    <>
      {deskIds.map((id) => (
        <DeskPublisher key={id} deskId={id} />
      ))}
    </>
  )
}
