// An image node that the user can drag to resize, the way Word lets you grab a
// corner handle. It extends the stock Tiptap Image with a width attribute and a
// React NodeView that paints a drag handle while the image is selected. The
// width is stored on the node so it survives save, export and reload.

import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useRef } from 'react'

function ImageView({ node, updateAttributes, selected }: NodeViewProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const width = (node.attrs.width as number | null) ?? null

  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = wrapRef.current?.querySelector('img')?.clientWidth ?? 320
    const onMove = (ev: MouseEvent): void => {
      const next = Math.max(40, Math.round(startW + ev.clientX - startX))
      updateAttributes({ width: next })
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper
      ref={wrapRef}
      className="relative inline-block max-w-full"
      data-drag-handle
    >
      <img
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string) ?? ''}
        style={{ width: width ? `${width}px` : undefined }}
        className={`max-w-full rounded ${selected ? 'outline outline-2 outline-accent' : ''}`}
        draggable={false}
      />
      {selected && (
        <span
          onMouseDown={startResize}
          className="absolute -bottom-1 -right-1 h-3 w-3 rounded-sm bg-accent border-2 border-white dark:border-stone-900 cursor-nwse-resize"
          title="Drag to resize"
        />
      )}
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') ?? el.style.width
          if (!w) return null
          const n = parseInt(String(w), 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {}
          return { width: attrs.width, style: `width: ${attrs.width}px` }
        }
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  }
})
