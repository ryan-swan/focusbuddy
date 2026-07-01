import { useViewStore } from '../../stores/view'
import Icon from '../Icon'

// A small always-visible switch between the four areas, shown at the top of every
// area's menu. Each area still shows only its own apps (the simple, contextual
// menu), but you can always jump to another area in one click, so Docs and Sheets
// in PlexiOffice are never more than a click away from the desk.
const AREAS = [
  { kind: 'plexidesk', label: 'Desk', icon: 'desktop_windows' },
  { kind: 'office', label: 'Office', icon: 'grid_view' },
  { kind: 'plexipeople', label: 'People', icon: 'diversity_3' },
  { kind: 'plexibrain', label: 'Brain', icon: 'neurology' }
] as const

export default function SegmentSwitcher(): JSX.Element {
  const currentKind = useViewStore((s) => s.view.kind)
  const goHome = useViewStore((s) => s.goHome)
  const goOffice = useViewStore((s) => s.goOffice)
  const goPlexiPeople = useViewStore((s) => s.goPlexiPeople)
  const goPlexiBrain = useViewStore((s) => s.goPlexiBrain)

  function go(kind: string): void {
    // Desk is the default area (the workspace, home, tasks, calendar, files and
    // your desks), so it opens Home rather than a separate segment.
    if (kind === 'plexidesk') goHome()
    else if (kind === 'office') goOffice()
    else if (kind === 'plexipeople') goPlexiPeople()
    else if (kind === 'plexibrain') goPlexiBrain()
  }

  return (
    <div className="grid grid-cols-4 gap-1 px-2 pt-2 pb-1" data-testid="segment-switcher">
      {AREAS.map((a) => {
        // Desk is active for every view that is not one of the other three areas,
        // since the whole desk workspace lives under it.
        const active =
          a.kind === 'plexidesk'
            ? !['office', 'plexipeople', 'plexibrain'].includes(currentKind)
            : currentKind === a.kind
        return (
          <button
            key={a.kind}
            onClick={() => go(a.kind)}
            data-testid={`switch-${a.kind}`}
            title={a.label}
            className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] ${
              active
                ? 'bg-[rgb(var(--accent)/0.14)] text-[rgb(var(--accent))] font-medium'
                : 'text-[var(--ink-60)] hover:bg-[var(--surface-sunken)]'
            }`}
          >
            <Icon name={a.icon} size={18} />
            <span>{a.label}</span>
          </button>
        )
      })}
    </div>
  )
}
