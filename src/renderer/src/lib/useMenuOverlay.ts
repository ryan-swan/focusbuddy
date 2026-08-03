import { useEffect } from 'react'
import { useOverlayStore, type MenuRect } from '../stores/overlay'

// Register a menu in the overlay store for as long as it is open. While it is
// registered the canvas edge-pan stands down and sibling menus can avoid
// overlapping it. The rect is captured from the passed ref (best effort) so
// placement can read it; presence alone is what edge-pan needs. Registration is
// torn down on close and on unmount, so a menu that disappears without a close
// handler can never leave edge-pan stuck off.
export function useMenuOverlay(
  id: string,
  isOpen: boolean,
  ref?: React.RefObject<HTMLElement | null>
): void {
  const openMenu = useOverlayStore((s) => s.openMenu)
  const closeMenu = useOverlayStore((s) => s.closeMenu)
  useEffect(() => {
    if (!isOpen) return
    const el = ref?.current
    let rect: MenuRect | null = null
    if (el) {
      const r = el.getBoundingClientRect()
      rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    openMenu(id, rect)
    return () => closeMenu(id)
  }, [id, isOpen, openMenu, closeMenu, ref])
}
