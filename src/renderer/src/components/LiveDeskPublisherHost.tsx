import { useEffect, useState, type JSX } from 'react'
import { useLiveDeskPublisher } from '../lib/useLiveDeskPublisher'

// Keeps every published desk current, for as long as the app is running.
//
// The publishing hook used to live only inside the share dialog's Live web view
// panel, which meant a "live" desk was live exactly while its share panel was
// on screen and frozen the rest of the time. Worse, the panel's last act on the
// way out could be a publish built from a desk that was no longer loaded.
//
// Publishing belongs to the app, not to a dialog, so it is mounted once at the
// root and runs for every desk that has a public link.

function DeskPublisher({ deskId }: { deskId: string }): null {
  useLiveDeskPublisher(deskId)
  return null
}

export default function LiveDeskPublisherHost(): JSX.Element | null {
  const [deskIds, setDeskIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void window.api.liveDesk
        .list()
        .then((rows) => {
          if (cancelled) return
          const next = rows.map((r) => r.deskId).sort()
          // Replace only on a real change, so publishers are not torn down and
          // remounted every poll.
          setDeskIds((prev) => (prev.join(',') === next.join(',') ? prev : next))
        })
        .catch(() => {
          /* the list is a convenience; a failed read just means no change */
        })
    }
    load()
    // Picks up a desk that was just published or stopped, without a restart.
    const timer = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
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
