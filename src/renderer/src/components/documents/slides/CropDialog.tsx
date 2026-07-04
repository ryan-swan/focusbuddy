import { useState } from 'react'
import { Rnd } from 'react-rnd'
import type { SlideImageElement } from '@shared/types'

// Interactive image crop. The full image fills a box sized to its aspect ratio;
// a draggable, resizable window (react-rnd) marks the part to keep, with the rest
// dimmed. Apply converts the window's geometry into inset fractions on the
// element. This is the real drag-handle crop, kept in a focused dialog so it
// never has to fight the scaled slide canvas.

const MAX_W = 520
const MAX_H = 380

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export default function CropDialog({
  el,
  onApply,
  onClose
}: {
  el: SlideImageElement
  onApply: (crop: { l: number; t: number; r: number; b: number }) => void
  onClose: () => void
}): JSX.Element {
  const ratio = el.naturalW && el.naturalH ? el.naturalW / el.naturalH : 1.6
  let boxW = MAX_W
  let boxH = Math.round(MAX_W / ratio)
  if (boxH > MAX_H) {
    boxH = MAX_H
    boxW = Math.round(MAX_H * ratio)
  }

  const init = el.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const [win, setWin] = useState({
    x: init.l * boxW,
    y: init.t * boxH,
    w: (1 - init.l - init.r) * boxW,
    h: (1 - init.t - init.b) * boxH
  })

  function apply(): void {
    onApply({
      l: clamp01(win.x / boxW),
      t: clamp01(win.y / boxH),
      r: clamp01(1 - (win.x + win.w) / boxW),
      b: clamp01(1 - (win.y + win.h) / boxH)
    })
  }

  const handle = (testid: string): JSX.Element => (
    <div
      data-testid={testid}
      style={{ width: 16, height: 16, background: '#6d5dfc', border: '2px solid #fff', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
    />
  )

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center"
      data-testid="slides-crop-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rounded-xl bg-[var(--surface-raised)] p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-[12px] font-semibold mb-2 text-[var(--ink-70)]">Crop image</div>
        <div
          className="relative overflow-hidden rounded"
          style={{ width: boxW, height: boxH, backgroundImage: `url(${el.src})`, backgroundSize: '100% 100%' }}
          data-testid="slides-crop-box"
        >
          <Rnd
            bounds="parent"
            size={{ width: win.w, height: win.h }}
            position={{ x: win.x, y: win.y }}
            onDrag={(_e, d) => setWin((w) => ({ ...w, x: d.x, y: d.y }))}
            onDragStop={(_e, d) => setWin((w) => ({ ...w, x: d.x, y: d.y }))}
            onResize={(_e, _dir, ref, _delta, pos) =>
              setWin({ x: pos.x, y: pos.y, w: parseFloat(ref.style.width), h: parseFloat(ref.style.height) })
            }
            onResizeStop={(_e, _dir, ref, _delta, pos) =>
              setWin({ x: pos.x, y: pos.y, w: parseFloat(ref.style.width), h: parseFloat(ref.style.height) })
            }
            resizeHandleComponent={{
              bottomRight: handle('slides-crop-handle-se'),
              topLeft: handle('slides-crop-handle-nw')
            }}
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)', border: '1px solid #fff', cursor: 'move' }}
          >
            <div data-testid="slides-crop-window" style={{ width: '100%', height: '100%' }} />
          </Rnd>
        </div>
        <div className="flex items-center gap-2 mt-3 justify-end">
          <button
            onClick={() => setWin({ x: 0, y: 0, w: boxW, h: boxH })}
            className="text-[12px] px-2 py-1 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="text-[12px] px-2 py-1 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]"
          >
            Cancel
          </button>
          <button onClick={apply} data-testid="slides-crop-apply" className="btn-primary text-[12px] px-3 py-1">
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
