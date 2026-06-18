// The slides toolbar: insert elements (text, image, shapes, line), apply a
// layout to the current slide, present, AI, and Office import/export.

import { useEffect, useRef, useState } from 'react'
import type { SlideLayout } from '@shared/types'
import Icon from '../../Icon'

interface Props {
  onInsertText: () => void
  onInsertImage: () => void
  onInsertShape: (shape: 'rect' | 'ellipse' | 'roundRect' | 'triangle') => void
  onInsertLine: () => void
  onApplyLayout: (layout: SlideLayout) => void
  onTemplates: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onPresent: () => void
  onAi: () => void
  onImport: () => void
  onExport: (format: 'pptx' | 'pdf') => void
}

const LAYOUTS: Array<{ id: SlideLayout; label: string }> = [
  { id: 'title', label: 'Title' },
  { id: 'title-content', label: 'Title + content' },
  { id: 'two-content', label: 'Two content' },
  { id: 'section', label: 'Section' },
  { id: 'image-caption', label: 'Image + caption' },
  { id: 'blank', label: 'Blank' }
]

export default function SlidesToolbar(props: Props): JSX.Element {
  const [menu, setMenu] = useState<null | 'shape' | 'layout' | 'io'>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const btn = 'h-7 px-2 inline-flex items-center gap-1 rounded text-[12px] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
  const Divider = (): JSX.Element => <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-0.5" />

  return (
    <div ref={ref} className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-stone-200 dark:border-stone-700" data-testid="slides-toolbar">
      <button className={`${btn} disabled:opacity-40`} onClick={props.onUndo} disabled={!props.canUndo} title="Undo" data-testid="slides-undo"><Icon name="undo" size={15} /></button>
      <button className={`${btn} disabled:opacity-40`} onClick={props.onRedo} disabled={!props.canRedo} title="Redo" data-testid="slides-redo"><Icon name="redo" size={15} /></button>
      <Divider />
      <button className={btn} onClick={props.onInsertText}><Icon name="title" size={15} /> Text</button>
      <button className={btn} onClick={props.onInsertImage}><Icon name="image" size={15} /> Image</button>
      <div className="relative">
        <button className={btn} onClick={() => setMenu(menu === 'shape' ? null : 'shape')}><Icon name="category" size={15} /> Shape</button>
        {menu === 'shape' && (
          <div className="absolute left-0 z-50 mt-1 w-36 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-[12px]">
            {([['rect', 'Rectangle'], ['roundRect', 'Rounded'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle']] as const).map(([s, label]) => (
              <button key={s} onClick={() => { props.onInsertShape(s); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800">{label}</button>
            ))}
            <button onClick={() => { props.onInsertLine(); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800">Line / arrow</button>
          </div>
        )}
      </div>
      <Divider />
      <button className={btn} onClick={props.onTemplates} data-testid="slides-templates-btn"><Icon name="dashboard_customize" size={15} /> Templates</button>
      <div className="relative">
        <button className={btn} onClick={() => setMenu(menu === 'layout' ? null : 'layout')}><Icon name="dashboard" size={15} /> Layout</button>
        {menu === 'layout' && (
          <div className="absolute left-0 z-50 mt-1 w-44 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-[12px]">
            {LAYOUTS.map((l) => (
              <button key={l.id} onClick={() => { props.onApplyLayout(l.id); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800">{l.label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <div className="relative">
          <button className={btn} onClick={() => setMenu(menu === 'io' ? null : 'io')}><Icon name="folder_open" size={15} /></button>
          {menu === 'io' && (
            <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-[12px]">
              <button onClick={() => { props.onImport(); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"><Icon name="upload_file" size={14} className="inline mr-1.5 text-stone-400" /> Import .pptx</button>
              <button onClick={() => { props.onExport('pptx'); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"><Icon name="slideshow" size={14} className="inline mr-1.5 text-stone-400" /> Export .pptx</button>
              <button onClick={() => { props.onExport('pdf'); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"><Icon name="picture_as_pdf" size={14} className="inline mr-1.5 text-stone-400" /> Export PDF</button>
            </div>
          )}
        </div>
        <button onClick={props.onAi} className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20">
          <Icon name="auto_awesome" size={13} /> AI
        </button>
        <button onClick={props.onPresent} className="btn-primary text-[12px] px-3 py-1.5"><Icon name="play_arrow" size={14} /> Present</button>
      </div>
    </div>
  )
}
