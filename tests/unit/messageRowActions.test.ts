// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const messages = read('src/renderer/src/components/views/MessagesView.tsx')
const hook = read('src/renderer/src/hooks/useClickAway.ts')
const emoji = read('src/renderer/src/components/views/chat/EmojiPicker.tsx')
const gif = read('src/renderer/src/components/views/chat/GifPicker.tsx')

// DEC-126 — the operator's clean-up of a message's doors: the time shows on
// hover only; the palette, the bell and the ⋯ menu sit on the BUBBLE's
// vertical centre; Translate lives in the ⋯ menu (on every message); the
// palette and the menu close on a click anywhere outside, or Esc.

describe('dec_126 — the doors are centred on the bubble, not the column', () => {
  it('the cluster is absolutely positioned beside the bubble on its vertical centre', () => {
    expect(messages).toContain('const actions = !deleted && !editing && (')
    expect(messages).toContain(
      "className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 ${mine ? 'right-full mr-1.5' : 'left-full ml-1.5'}`}"
    )
    expect(messages).toContain('data-testid={`msg-actions-${m.id}`}')
    // The anchor wraps the bubble alone — the meta row, reactions and
    // proposals ride below it and cannot shift the doors.
    expect(messages).toContain('<div className="relative max-w-full">\n          {actions}\n')
    // The row itself no longer centres its children as a whole.
    expect(messages).toContain("className={`group flex ${mine ? 'justify-end' : 'justify-start'} rounded-lg transition-colors`}")
    expect(messages).not.toContain("className={`group flex items-center gap-1.5 ${mine ? 'justify-end' : 'justify-start'} rounded-lg transition-colors`}")
  })

  it('one cluster serves both sides — the theirs-side doors after the bubble are gone', () => {
    expect(messages).not.toContain('{!mine && <ReactPicker onPick={onReact} />}')
    expect(messages).not.toContain('{mine && !deleted && !editing && <ReactPicker onPick={onReact} />}')
    expect(messages.split('<ReactPicker onPick={onReact} />').length - 1).toBe(1)
  })
})

describe('dec_126 — the time shows on hover', () => {
  it('the time span is hover-revealed and still carries edited / translated', () => {
    expect(messages).toContain(
      'className="fb-tabular shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"'
    )
    expect(messages).toContain('data-testid={`msg-time-${m.id}`}')
    expect(messages).toContain("{translated && !showOriginal ? ' · translated' : ''}")
    // Opacity, not display — the row keeps its height, nothing jumps on hover.
    expect(messages).not.toContain('group-hover:block')
  })
})

describe('dec_126 — Translate lives in the ⋯ menu, on every message', () => {
  it('the menu opens on any message with words; Edit / Delete stay yours', () => {
    expect(messages).toContain('const menuEntries = (m.body ? 1 : 0) + (mine && onEdit ? 1 : 0) + (mine && onDelete ? 1 : 0)')
    expect(messages).toContain('{menuEntries > 0 && (')
    expect(messages).not.toContain('{mine && !deleted && (onEdit || onDelete) && !editing && (')
    expect(messages).toContain('{mine && onEdit && (')
    expect(messages).toContain('{mine && onDelete && (')
    expect(messages).toContain('data-testid={`msg-menu-panel-${m.id}`}')
    expect(messages).toContain("${mine ? 'right-0' : 'left-0'} py-1 min-w-[8.5rem] whitespace-nowrap")
  })

  it('the one Translate door is in the menu, not the meta row', () => {
    expect(messages.split('data-testid={`msg-translate-${m.id}`}').length - 1).toBe(1)
    const translateAt = messages.indexOf('data-testid={`msg-translate-${m.id}`}')
    const panelAt = messages.indexOf('data-testid={`msg-menu-panel-${m.id}`}')
    const metaAt = messages.indexOf('data-testid={`msg-meta-${m.id}`}')
    expect(panelAt).toBeGreaterThan(0)
    expect(translateAt).toBeGreaterThan(panelAt)
    expect(translateAt).toBeLessThan(metaAt)
    expect(messages).toContain(
      "{translating ? 'Translating…' : translated ? (showOriginal ? `Show ${translateLang || 'translation'}` : 'Show original') : `Translate to ${translateLang || 'English'}`}"
    )
    // While the translation is in flight the meta row says so — the menu has closed.
    expect(messages).toContain('data-testid={`msg-translating-${m.id}`}')
  })
})

describe('dec_126 — a click anywhere outside closes the palette and the menu', () => {
  it('the hook is the house pattern, extracted: armed after a beat, mousedown, Esc', () => {
    expect(hook).toContain('export function useClickAway(ref: RefObject<HTMLElement | null>, active: boolean, onAway: () => void): void {')
    expect(hook).toContain("window.addEventListener('mousedown', onDown)")
    expect(hook).toContain("if (e.key === 'Escape') onAway()")
    expect(hook).toContain('const armId = window.setTimeout(() => {')
    expect(hook).toContain('if (!active) return')
    expect(hook).toContain("window.removeEventListener('mousedown', onDown)")
  })

  it('both row popovers use it, with stable callbacks and a ref on their own wrapper', () => {
    expect(messages).toContain("import { useClickAway } from '../../hooks/useClickAway'")
    expect(messages).toContain('useClickAway(ref, open, close)')
    expect(messages).toContain('<div className="relative" ref={ref}>')
    expect(messages).toContain('useClickAway(menuRef, menuOpen, closeMenu)')
    expect(messages).toContain('<div className="relative" ref={menuRef}>')
    expect(messages).toContain('const close = useCallback(() => setOpen(false), [])')
    expect(messages).toContain('const closeMenu = useCallback(() => setMenuOpen(false), [])')
  })

  it("the composer's emoji and GIF pickers already closed this way — unchanged", () => {
    for (const src of [emoji, gif]) {
      expect(src).toContain("document.addEventListener('mousedown', onDown)")
      expect(src).toContain('if (ref.current && !ref.current.contains(e.target as Node)) onClose()')
    }
  })
})
