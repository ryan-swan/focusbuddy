import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'

// Render children only once they are near the viewport.
//
// The desk index builds a live miniature for every desk, and each miniature
// renders every widget on that desk. For a large collection that is thousands
// of components mounted for cards nobody has scrolled to yet -- the reason
// "All desks" was slow and the reason off-screen desk contents existed in the
// DOM at all.
//
// Full list virtualization would be the complete answer; this is the part that
// carries the cost, and it does not require restructuring an index that also
// has to support grid and list layouts, drag, range selection and context
// menus. Once a card has been seen it stays mounted, so scrolling back is
// instant and nothing flickers.

export default function LazyVisible({
  children,
  placeholder = null,
  rootMargin = '300px'
}: {
  children: ReactNode
  placeholder?: ReactNode
  rootMargin?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) return
    // Environments without the observer (jsdom, older runtimes) render
    // everything rather than rendering nothing.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, rootMargin])

  return (
    <div ref={ref} className="h-full w-full">
      {shown ? children : placeholder}
    </div>
  )
}
