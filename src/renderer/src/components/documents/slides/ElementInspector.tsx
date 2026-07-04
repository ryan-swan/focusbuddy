// The right-hand inspector. With an element selected it shows type-specific
// controls (position/size, text styling, shape/line/image properties, z-order,
// duplicate, delete). With nothing selected it shows slide-level controls
// (transition, background) and the deck theme picker.

import type { DeckTheme, Slide, SlideElement, SlideTransition } from '@shared/types'
import { BUILTIN_THEMES } from '@shared/slideThemes'
import { CHART_TYPES, type ChartType } from '@shared/chart'
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
  onEditChart: (id: string) => void
  onRefreshChart: (id: string) => void
}

const labelCls = 'text-[10px] uppercase tracking-wide text-[var(--ink-40)]'
const inputCls = 'w-full bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-1.5 py-1 text-[12px] focus:outline-none'
const numCls = 'w-16 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-1.5 py-1 text-[12px] focus:outline-none'

export default function ElementInspector(props: Props): JSX.Element {
  const el = props.selected
  const btn = 'h-7 min-w-7 px-1.5 inline-flex items-center justify-center rounded text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] border border-[var(--edge-soft)]'

  if (!el) {
    return (
      <div className="w-60 shrink-0 border-l border-[var(--edge-soft)] p-3 space-y-3 overflow-auto">
        <div>
          <div className={labelCls}>Slide transition</div>
          <select className={inputCls} value={props.slide.transition ?? 'none'} onChange={(e) => props.onSetTransition(e.target.value as SlideTransition)}>
            <option value="none">None</option>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="zoom">Zoom</option>
            <option value="morph">Morph (tween shared objects)</option>
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
                  props.currentThemeId === t.id ? 'border-accent bg-accent/10 text-accent' : 'border-[var(--edge-soft)]'
                }`}
              >
                <span className="h-4 w-4 rounded-full shrink-0" style={{ background: t.accent }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-[var(--ink-40)]">Select an element to edit it, or use the toolbar to insert one.</p>
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
    <div className="w-60 shrink-0 border-l border-[var(--edge-soft)] p-3 space-y-3 overflow-auto" data-testid="element-inspector">
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

      <div>
        <div className={labelCls}>Rotation & opacity</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex items-center gap-1" title="Rotation (degrees)">
            <Icon name="rotate_right" size={13} className="text-[var(--ink-40)]" />
            <input
              type="number"
              data-testid="element-rotation"
              className={numCls}
              value={Math.round(el.rotation ?? 0)}
              onChange={(e) => props.onUpdateElement(el.id, { rotation: Number(e.target.value) })}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            data-testid="element-opacity"
            title="Opacity"
            className="flex-1"
            value={Math.round((el.opacity ?? 1) * 100)}
            onChange={(e) => props.onUpdateElement(el.id, { opacity: Number(e.target.value) / 100 })}
          />
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
          {el.fill?.type === 'gradient' ? (
            <div className="flex items-center gap-1.5" data-testid="shape-gradient">
              <input
                type="color"
                title="Gradient start"
                value={el.fill.color ?? '#6d5dfc'}
                onChange={(e) => props.onUpdateElement(el.id, { fill: { type: 'gradient', color: e.target.value, color2: el.fill?.color2 ?? '#22d3ee', angle: el.fill?.angle ?? 135 } })}
                className="h-6 w-7 rounded cursor-pointer bg-transparent"
              />
              <input
                type="color"
                title="Gradient end"
                value={el.fill.color2 ?? '#22d3ee'}
                onChange={(e) => props.onUpdateElement(el.id, { fill: { type: 'gradient', color: el.fill?.color ?? '#6d5dfc', color2: e.target.value, angle: el.fill?.angle ?? 135 } })}
                className="h-6 w-7 rounded cursor-pointer bg-transparent"
              />
              <input
                type="number"
                title="Angle (degrees)"
                value={el.fill.angle ?? 135}
                onChange={(e) => props.onUpdateElement(el.id, { fill: { type: 'gradient', color: el.fill?.color ?? '#6d5dfc', color2: el.fill?.color2 ?? '#22d3ee', angle: Number(e.target.value) } })}
                className={numCls}
              />
              <button
                className="text-[10px] text-[var(--ink-40)] hover:text-accent"
                onClick={() => props.onUpdateElement(el.id, { fill: { type: 'solid', color: el.fill?.color ?? '#6d5dfc' } })}
              >
                solid
              </button>
            </div>
          ) : (
            <button
              data-testid="shape-gradient-toggle"
              className="text-[10px] text-[var(--ink-50)] hover:text-accent inline-flex items-center gap-1"
              onClick={() => props.onUpdateElement(el.id, { fill: { type: 'gradient', color: (el.fill?.type === 'solid' && el.fill.color) || '#6d5dfc', color2: '#22d3ee', angle: 135 } })}
            >
              <Icon name="gradient" size={12} /> Gradient fill
            </button>
          )}
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

      {el.type === 'table' && (
        <div className="space-y-1.5" data-testid="inspector-table">
          <div className={labelCls}>Table</div>
          <div className="flex items-center gap-1">
            <button
              className={btn}
              title="Add row"
              data-testid="table-add-row"
              onClick={() => {
                const cols = el.cells[0]?.length ?? 1
                props.onUpdateElement(el.id, { cells: [...el.cells, new Array(cols).fill('')] })
              }}
            >
              <Icon name="add" size={13} /> Row
            </button>
            <button
              className={btn}
              title="Add column"
              data-testid="table-add-col"
              onClick={() => props.onUpdateElement(el.id, { cells: el.cells.map((r) => [...r, '']) })}
            >
              <Icon name="add" size={13} /> Col
            </button>
            <button
              className={btn}
              title="Remove last row"
              onClick={() => el.cells.length > 1 && props.onUpdateElement(el.id, { cells: el.cells.slice(0, -1) })}
            >
              <Icon name="remove" size={13} /> Row
            </button>
            <button
              className={btn}
              title="Remove last column"
              onClick={() => (el.cells[0]?.length ?? 0) > 1 && props.onUpdateElement(el.id, { cells: el.cells.map((r) => r.slice(0, -1)) })}
            >
              <Icon name="remove" size={13} /> Col
            </button>
          </div>
          <button
            className={`${btn} w-full justify-start gap-1.5 ${el.headerRow ? 'bg-accent/15 text-accent' : ''}`}
            onClick={() => props.onUpdateElement(el.id, { headerRow: !el.headerRow })}
          >
            <Icon name="table_rows" size={14} /> Header row
          </button>
          <div className="space-y-1 max-h-48 overflow-auto" data-testid="table-cells">
            {el.cells.map((row, r) => (
              <div key={r} className="flex gap-1">
                {row.map((cell, c) => (
                  <input
                    key={c}
                    className="min-w-0 flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-accent"
                    value={cell}
                    onChange={(e) => {
                      const next = el.cells.map((rr) => rr.slice())
                      next[r][c] = e.target.value
                      props.onUpdateElement(el.id, { cells: next })
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {el.type === 'chart' && (
        <div className="space-y-1.5" data-testid="inspector-chart">
          <div className={labelCls}>Chart</div>
          <input
            className={inputCls}
            placeholder="Chart title"
            value={el.chart.title ?? ''}
            onChange={(e) => props.onUpdateElement(el.id, { chart: { ...el.chart, title: e.target.value } })}
          />
          <select
            className={inputCls}
            data-testid="chart-type"
            value={el.chart.type}
            onChange={(e) => props.onUpdateElement(el.id, { chart: { ...el.chart, type: e.target.value as ChartType } })}
          >
            {CHART_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
          {(el.chart.type === 'bar' || el.chart.type === 'area') && (
            <button
              className={`${btn} w-full justify-start gap-1.5 ${el.chart.stacked ? 'bg-accent/15 text-accent' : ''}`}
              onClick={() => props.onUpdateElement(el.id, { chart: { ...el.chart, stacked: !el.chart.stacked } })}
            >
              <Icon name="stacked_bar_chart" size={14} /> Stacked
            </button>
          )}
          <button className={`${btn} w-full justify-start gap-1.5`} data-testid="chart-link" onClick={() => props.onEditChart(el.id)}>
            <Icon name="table_chart" size={14} /> Link a sheet range…
          </button>
          {el.source && (
            <div className="text-[11px] text-[var(--ink-50)] space-y-1">
              <div className="truncate" title={el.source.range}>
                Linked to {el.source.range}
              </div>
              <button className={`${btn} w-full justify-start gap-1.5`} data-testid="chart-refresh" onClick={() => props.onRefreshChart(el.id)}>
                <Icon name="refresh" size={14} /> Refresh from sheet
              </button>
            </div>
          )}
        </div>
      )}

      {el.type !== 'line' && (
        <div className="space-y-1.5" data-testid="inspector-frame">
          <div className={labelCls}>Frame</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--ink-50)]">Radius</span>
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

      <div data-testid="inspector-anim">
        <div className={labelCls}>Entrance animation</div>
        <select
          className={inputCls}
          data-testid="element-anim"
          value={el.anim?.type ?? 'none'}
          onChange={(e) => {
            const v = e.target.value
            props.onUpdateElement(el.id, { anim: v === 'none' ? undefined : { ...(el.anim ?? {}), type: v as NonNullable<SlideElement['anim']>['type'] } })
          }}
        >
          <option value="none">None</option>
          <option value="fadeIn">Fade in</option>
          <option value="slideUp">Slide up</option>
          <option value="slideLeft">Slide in</option>
          <option value="zoomIn">Zoom in</option>
        </select>
        {el.anim && (
          <div className="flex items-center gap-2 mt-1" title="Play order (staggers multiple animations)">
            <span className="text-[11px] text-[var(--ink-50)]">Order</span>
            {num(el.anim.order ?? 0, (n) => ({ anim: { ...el.anim!, order: Math.max(0, n) } }))}
          </div>
        )}
      </div>

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
