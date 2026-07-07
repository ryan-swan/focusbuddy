import { useViewStore } from '../../stores/view'
import { useCapabilityStore } from '../../stores/capabilities'
import Icon from '../Icon'

// A small always-visible switch between the four areas, shown at the top of every
// area's menu. Each area still shows only its own apps (the simple, contextual
// menu), but you can always jump to another area in one click, so Docs and Sheets
// in PlexiOffice are never more than a click away from the desk.
//
// Each area is gated by its product entitlement (product_desk/office/brain/
// people). An admin can switch a whole app off for a user, and it disappears
// from this switcher. The entitlements resolve from /account/capabilities.
const AREAS = [
  { kind: 'plexidesk', label: 'Desk', icon: 'desktop_windows', cap: 'product_desk' },
  { kind: 'office', label: 'Office', icon: 'grid_view', cap: 'product_office' },
  { kind: 'plexipeople', label: 'People', icon: 'diversity_3', cap: 'product_people' },
  { kind: 'plexibrain', label: 'Brain', icon: 'neurology', cap: 'product_brain' }
] as const

export default function SegmentSwitcher(): JSX.Element {
  const currentKind = useViewStore((s) => s.view.kind)
  const goHome = useViewStore((s) => s.goHome)
  const goOffice = useViewStore((s) => s.goOffice)
  const goPlexiPeople = useViewStore((s) => s.goPlexiPeople)
  const goPlexiBrain = useViewStore((s) => s.goPlexiBrain)
  const capGet = useCapabilityStore((s) => s.get)

  function go(kind: string): void {
    // Desk is the default area (the workspace, home, tasks, calendar, files and
    // your desks), so it opens Home rather than a separate segment.
    if (kind === 'plexidesk') goHome()
    else if (kind === 'office') goOffice()
    else if (kind === 'plexipeople') goPlexiPeople()
    else if (kind === 'plexibrain') goPlexiBrain()
  }

  // Only show areas the user is entitled to. An admin can switch a whole app off
  // per user; a missing entitlement removes it from the switcher entirely. Desk
  // is always kept as the floor so a user is never left with nowhere to go.
  const areas = AREAS.filter((a) => a.kind === 'plexidesk' || capGet(a.cap) === true)

  return (
    <div
      className="grid gap-1 px-2 pt-2 pb-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, areas.length)}, minmax(0, 1fr))` }}
      data-testid="segment-switcher"
    >
      {areas.map((a) => {
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
