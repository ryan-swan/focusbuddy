// The interactive slide editor stage. Renders the 1280x720 logical slide CSS-
// scaled to fit, with every element wrapped in react-rnd for select / move /
// resize. Double-clicking a text element opens an inline textarea (one line per
// paragraph). Geometry and text edits flow back through callbacks; SlidesEditor
// owns the data and undo.

import { useState } from 'react'
import { Rnd } from 'react-rnd'
import type { DeckTheme, Slide, SlideElement } from '@shared/types'
import { SLIDE_W, SLIDE_H } from '@shared/slideThemes'
import SlideElementView from './SlideElementView'
import { elementText } from './slideOps'

interface Props {
  slide: Slide
  theme: DeckTheme
  width: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onSetText: (id: string, text: string) => void
}

export default function SlideCanvas({
  slide,
  theme,
  width,
  selectedId,
  onSelect,
  onUpdateElement,
  onSetText
}: Props): JSX.Element {
  const scale = width / SLIDE_W
  const height = width * (SLIDE_H / SLIDE_W)
  const bg = slide.background?.type === 'solid' ? slide.background.color : theme.background
  const elements = (slide.elements ?? []).slice().sort((a, b) => a.z - b.z)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startEdit(el: SlideElement): void {
    if (el.type !== 'text') return
    setEditingId(el.id)
    setDraft(elementText(el))
  }
  function commitEdit(): void {
    if (editingId) onSetText(editingId, draft)
    setEditingId(null)
  }

  return (
    <div
      data-testid="slide-canvas"
      style={{ width, height, position: 'relative', overflow: 'hidden', background: bg, boxShadow: '0 1px 8px rgba(0,0,0,0.12)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null)
      }}
    >
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left', color: theme.textColor }}>
        {elements.map((el) => {
          const selected = el.id === selectedId
          const isEditing = el.id === editingId
          return (
            <Rnd
              key={el.id}
              scale={scale}
              bounds="parent"
              size={{ width: el.w, height: el.h }}
              position={{ x: el.x, y: el.y }}
              disableDragging={isEditing}
              enableResizing={!isEditing}
              onMouseDown={() => onSelect(el.id)}
              onDragStop={(_e, d) => onUpdateElement(el.id, { x: Math.round(d.x), y: Math.round(d.y) })}
              onResizeStop={(_e, _dir, ref, _delta, pos) =>
                onUpdateElement(el.id, {
                  w: Math.round(parseFloat(ref.style.width)),
                  h: Math.round(parseFloat(ref.style.height)),
                  x: Math.round(pos.x),
                  y: Math.round(pos.y)
                })
              }
              style={{
                outline: selected ? '2px solid #6d5dfc' : '1px dashed rgba(120,120,120,0.35)',
                outlineOffset: 0
              }}
              onDoubleClick={() => startEdit(el)}
            >
              {isEditing && el.type === 'text' ? (
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditingId(null)
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    resize: 'none',
                    border: 'none',
                    outline: 'none',
                    background: 'rgba(255,255,255,0.85)',
                    color: '#111',
                    fontSize: el.paragraphs[0]?.runs[0]?.fontSize ?? 24,
                    fontFamily: el.fontFamily,
                    padding: 4
                  }}
                />
              ) : (
                <div data-testid="slide-element" data-eltype={el.type} style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <SlideElementView el={{ ...el, x: 0, y: 0 }} />
                </div>
              )}
            </Rnd>
          )
        })}
      </div>
    </div>
  )
}
