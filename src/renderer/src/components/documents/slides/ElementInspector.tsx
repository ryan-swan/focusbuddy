// The right-hand inspector. With an element selected it shows type-specific
// controls (position/size, text styling, shape/line/image properties, z-order,
// duplicate, delete). With nothing selected it shows slide-level controls
// (transition, background) and the deck theme picker.

import type { DeckTheme, Slide, SlideElement, SlideTransition } from '@shared/types'
import { BUILTIN_THEMES } from '@shared/slideThemes'
import Icon from '../../Icon'
import FontPicker from '../editor/FontPicker'

interface Props {
  slide: Slide
  selected: SlideElement | null
  currentThemeId: string
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onStyleText: (id: string, patch: Partial<{ bold: boolean; italic: boolean; underline: boolean; color: string; fontSize: number }>) => void
  onAlign: (id: string, align: 'left' | 'center' | 'right') => void
  onSetList: (id: string, style: 'bullet' | 'number' | 'none') => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorderZ: (id: string, dir: 'forward' | 'back' | 'front' | 'backmost') => void
  onSetTransition: (t: SlideTransition) => void
  onSetBackground: (color: string) => void
  onApplyTheme: (theme: DeckTheme) => void
  onCrop: (id: string) => void
}

const labelCls = 'text-[10px] uppercase tracking-wide text-stone-400'
const inputCls = 'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-1 text-[12px] focus:outline-none'
const numCls = 'w-16 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-1 text-[12px] focus:outline-none'

export default function ElementInspector(props: Props): JSX.Element {
  const el = props.selected
  const btn = 'h-7 min-w-7 px-1.5 inline-flex items-center justify-center rounded text-[12px] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700'

  if (!el) {
    return (
      <div className="w-60 shrink-0 border-l border-stone-200 dark:border-stone-800 p-3 space-y-3 overflow-auto">
        <div>
          <div className={labelCls}>Slide transition</div>
          <select className={inputCls} value={props.slide.transition ?? 'none'} onChange={(e) => props.onSetTransition(e.target.value as SlideTransition)}>
            <option value="none">None</option>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
          </select>
        </div>
        <div>
          <div className={labelCls}>Background</div>
          <input type="color" className="w-full h-7 rounded cursor-pointer" onChange={(e) => props.onSetBackground(e.target.value)} />
        </div>
        <div>
          <div className={labelCls}>Theme</div>
          <div className="grid grid-cols-1 gap-1 mt-1">
            {BUILTIN_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => props.onApplyTheme(t)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[12px] text-left ${
                  props.currentThemeId === t.id ? 'border-accent bg-accent/10 text-accent' : 'border-stone-200 dark:border-stone-700'
                }`}
              >
                <span className="h-4 w-4 rounded-full shrink-0" style={{ background: t.accent }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-stone-400">Select an element to edit it, or use the toolbar to insert one.</p>
      </div>
    )
  }

  const num = (v: number, patch: (n: number) => Partial<SlideElement>): JSX.Element => (
    <input
      type="number"
      className={numCls}
      value={Math.round(v)}
      onChange={(e) => props.onUpdateElement(el.id, patch(Number(e.target.value)))}
    />
  )

  return (
    <div className="w-60 shrink-0 border-l border-stone-200 dark:border-stone-800 p-3 space-y-3 overflow-auto" data-testid="element-inspector">
      <div className="text-[12px] font-semibold capitalize">{el.type}</div>

      <div>
        <div className={labelCls}>Position & size</div>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {num(el.x, (n) => ({ x: n }))}
          {num(el.y, (n) => ({ y: n }))}
          {num(el.w, (n) => ({ w: n }))}
          {num(el.h, (n) => ({ h: n }))}
        </div>
      </div>

      {el.type === 'text' && (
        <div className="space-y-1.5">
          <div className={labelCls}>Text</div>
          <div className="flex items-center gap-1">
            <button className={btn} title="Bold" onClick={() => props.onStyleText(el.id, { bold: !el.paragraphs[0]?.runs[0]?.bold })}>
              <Icon name="format_bold" size={14} />
            </button>
            <button className={btn} title="Italic" onClick={() => props.onStyleText(el.id, { italic: !el.paragraphs[0]?.runs[0]?.italic })}>
              <Icon name="format_italic" size={14} />
            </button>
            <button className={btn} title="Underline" onClick={() => props.onStyleText(el.id, { underline: !el.paragraphs[0]?.runs[0]?.underline })}>
              <Icon name="format_underlined" size={14} />
            </button>
            <label className={btn + ' relative cursor-pointer'} title="Colour">
              <Icon name="format_color_text" size={14} />
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => props.onStyleText(el.id, { color: e.target.value })} />
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button className={btn} onClick={() => props.onAlign(el.id, 'left')}><Icon name="format_align_left" size={14} /></button>
            <button className={btn} onClick={() => props.onAlign(el.id, 'center')}><Icon name="format_align_center" size={14} /></button>
            <button className={btn} onClick={() => props.onAlign(el.id, 'right')}><Icon name="format_align_right" size={14} /></button>
            <input
              type="number"
              className={numCls}
              title="Font size"
              value={el.paragraphs[0]?.runs[0]?.fontSize ?? 24}
              onChange={(e) => props.onStyleText(el.id, { fontSize: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-1">
            <FontPicker value={el.fontFamily} onChange={(v) => props.onUpdateElement(el.id, { fontFamily: v })} compact />
            <button
              className={`${btn} ${el.paragraphs[0]?.listStyle === 'bullet' ? 'bg-accent/15 text-accent' : ''}`}
              title="Bulleted list"
              onClick={() => props.onSetList(el.id, el.paragraphs[0]?.listStyle === 'bullet' ? 'none' : 'bullet')}
            >
              <Icon name="format_list_bulleted" size={14} />
            </button>
            <button
              className={`${btn} ${el.paragraphs[0]?.listStyle === 'number' ? 'bg-accent/15 text-accent' : ''}`}
              title="Numbered list"
              onClick={() => props.onSetList(el.id, el.paragraphs[0]?.listStyle === 'number' ? 'none' : 'number')}
            >
              <Icon name="format_list_numbered" size={14} />
            </button>
          </div>
        </div>
      )}

      {el.type === 'shape' && (
        <div className="space-y-1.5">
          <div className={labelCls}>Fill & border</div>
          <div className="flex items-center gap-2">
            <label className={btn + ' relative cursor-pointer'} title="Fill">
              <Icon name="format_color_fill" size={14} />
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => props.onUpdateElement(el.id, { fill: { type: 'solid', color: e.target.value } })} />
            </label>
            <label className={btn + ' relative cursor-pointer'} title="Border">
              <Icon name="border_color" size={14} />
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => props.onUpdateElement(el.id, { border: { color: e.target.value, width: 2 } })} />
            </label>
          </div>
        </div>
      )}

      {el.type === 'line' && (
        <div className="space-y-1.5">
          <div className={labelCls}>Line</div>
          <div className="flex items-center gap-2">
            <label className={btn + ' relative cursor-pointer'} title="Stroke">
              <Icon name="palette" size={14} />
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => props.onUpdateElement(el.id, { stroke: e.target.value })} />
            </label>
            <button className={btn} title="Toggle arrow" onClick={() => props.onUpdateElement(el.id, { arrowEnd: !el.arrowEnd })}>
              <Icon name="arrow_forward" size={14} />
            </button>
          </div>
        </div>
      )}

      {el.type === 'image' && (
        <div className="space-y-1.5">
          <div className={labelCls}>Image</div>
          <select
            className={inputCls}
            value={el.fit ?? 'contain'}
            onChange={(e) => props.onUpdateElement(el.id, { fit: e.target.value as 'contain' | 'cover' | 'fill' })}
            title="How the image fills its frame"
          >
            <option value="contain">Fit (show all)</option>
            <option value="cover">Fill frame (crop)</option>
            <option value="fill">Stretch</option>
          </select>
          <button
            className={`${btn} w-full justify-start gap-1.5 ${el.lockAspect ? 'bg-accent/15 text-accent' : ''}`}
            title="Keep the image's aspect ratio when resizing"
            onClick={() => props.onUpdateElement(el.id, { lockAspect: !el.lockAspect })}
          >
            <Icon name={el.lockAspect ? 'lock' : 'lock_open'} size={14} /> Lock aspect ratio
          </button>
          <button
            className={`${btn} w-full justify-start gap-1.5 ${el.crop ? 'text-accent' : ''}`}
            title="Crop the image"
            data-testid="inspector-crop"
            onClick={() => props.onCrop(el.id)}
          >
            <Icon name="crop" size={14} /> {el.crop ? 'Edit crop' : 'Crop'}
          </button>
          {el.crop && (
            <button
              className={btn + ' w-full justify-start gap-1.5'}
              title="Remove the crop"
              onClick={() => props.onUpdateElement(el.id, { crop: undefined })}
            >
              <Icon name="crop_free" size={14} /> Remove crop
            </button>
          )}
          {el.naturalW && el.naturalH && (
            <button
              className={btn + ' w-full justify-start gap-1.5'}
              title="Resize the frame to the image's natural proportions"
              onClick={() => {
                const ratio = el.naturalH! / el.naturalW!
                props.onUpdateElement(el.id, { h: Math.round(el.w * ratio) })
              }}
            >
              <Icon name="aspect_ratio" size={14} /> Reset proportions
            </button>
          )}
        </div>
      )}

      {el.type !== 'line' && (
        <div className="space-y-1.5" data-testid="inspector-frame">
          <div className={labelCls}>Frame</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-stone-500 dark:text-stone-400">Radius</span>
            {num(el.cornerRadius ?? 0, (n) => ({ cornerRadius: Math.max(0, n) }))}
          </div>
          <select
            className={inputCls}
            title="Drop shadow"
            data-testid="inspector-shadow"
            value={el.shadow ?? 'none'}
            onChange={(e) =>
              props.onUpdateElement(el.id, { shadow: e.target.value === 'none' ? undefined : (e.target.value as 'sm' | 'md' | 'lg') })
            }
          >
            <option value="none">No shadow</option>
            <option value="sm">Shadow: subtle</option>
            <option value="md">Shadow: medium</option>
            <option value="lg">Shadow: large</option>
          </select>
          {el.type === 'image' && (
            <label className={btn + ' relative cursor-pointer w-full justify-start gap-1.5'} title="Image border colour">
              <Icon name="border_color" size={14} /> Border
              <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => props.onUpdateElement(el.id, { border: { color: e.target.value, width: 2 } })}
              />
            </label>
          )}
        </div>
      )}

      <div>
        <div className={labelCls}>Arrange</div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <button className={btn} title="Bring forward" onClick={() => props.onReorderZ(el.id, 'forward')}><Icon name="flip_to_front" size={14} /></button>
          <button className={btn} title="Send back" onClick={() => props.onReorderZ(el.id, 'back')}><Icon name="flip_to_back" size={14} /></button>
          <button className={btn} title="Duplicate" onClick={() => props.onDuplicate(el.id)}><Icon name="content_copy" size={14} /></button>
          <button className={btn + ' text-red-600'} title="Delete" onClick={() => props.onDelete(el.id)}><Icon name="delete" size={14} /></button>
        </div>
      </div>
    </div>
  )
}
