import { useEffect, useRef } from 'react'

// Land a module on its content, not on its empty landing dashboard. When a module
// opens with items already in it, select the most recently touched one so the
// person sees real work straight away instead of being routed through ModuleHome
// as a toll booth (the UX-panel fix). ModuleHome stays reachable on demand via the
// returned showOverview(), so it survives as the optional dashboard it should be.
//
// Auto-selection happens once per mount: after that, deselecting (Overview) or
// deleting the open item leaves you where you chose to be rather than yanking you
// back into an item.

interface Selectable {
  id: string
  updatedAt?: number
  createdAt?: number
}

// The most recently touched item, by updatedAt then createdAt. Pure so the
// land-on-content choice is unit-testable without rendering.
export function pickMostRecent<T extends Selectable>(items: T[]): T | null {
  if (items.length === 0) return null
  return [...items].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))[0]
}

export function useLandOnContent<T extends Selectable>(
  loaded: boolean,
  items: T[],
  selectedId: string | null,
  select: (id: string | null) => void
): { showOverview: () => void } {
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !loaded || selectedId || items.length === 0) return
    done.current = true
    const recent = pickMostRecent(items)
    if (recent) select(recent.id)
  }, [loaded, items, selectedId, select])

  return {
    showOverview: () => {
      done.current = true
      select(null)
    }
  }
}
