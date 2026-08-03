// Add / edit / remove a hyperlink on the current selection. Opened from the
// toolbar and the selection bubble menu. Pre-fills the existing href when the
// cursor is already inside a link.

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import Icon from '../../Icon'

interface Props {
  editor: Editor
  onClose: () => void
}

export default function LinkPopover({ editor, onClose }: Props): JSX.Element {
  const existing = (editor.getAttributes('link').href as string) ?? ''
  const [href, setHref] = useState(existing)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  function apply(): void {
    const url = href.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      const normalized = /^(https?:|mailto:|tel:|#|\/)/i.test(url) ? url : `https://${url}`
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
    }
    onClose()
  }

  function remove(): void {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }

  return (
    <div
      ref={ref}
      data-testid="doc-link-popover"
      className="absolute z-50 mt-1 w-72 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl p-2"
    >
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            if (e.key === 'Escape') onClose()
          }}
          placeholder="Paste or type a URL"
          className="flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
        />
        <button onClick={apply} className="px-2 py-1 rounded bg-accent text-white text-[12px]">
          Apply
        </button>
      </div>
      {existing && (
        <button
          onClick={remove}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded px-1.5 py-0.5"
        >
          <Icon name="link_off" size={12} /> Remove link
        </button>
      )}
    </div>
  )
}
