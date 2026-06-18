// The starter-template picker. Shows every template rendered as a live
// thumbnail (built from the active theme so the preview matches what you get),
// and inserts a new slide from the chosen one.

import { useEffect } from 'react'
import type { DeckTheme, Slide } from '@shared/types'
import { SLIDE_TEMPLATES } from '@shared/slideTemplates'
import SlideFace from './SlideFace'
import Icon from '../../Icon'

interface Props {
  theme: DeckTheme
  onPick: (templateId: string) => void
  onClose: () => void
}

export default function SlideTemplateGallery({ theme, onPick, onClose }: Props): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[250] bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="slide-template-gallery"
        className="w-[780px] max-w-[94vw] max-h-[86vh] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Icon name="dashboard_customize" size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-stone-800 dark:text-stone-100">Pick a starter slide</span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {SLIDE_TEMPLATES.map((tpl) => {
            const preview: Slide = {
              id: `preview-${tpl.id}`,
              notes: '',
              elements: tpl.build(theme),
              background: { type: 'solid', color: theme.background },
              schemaVersion: 2
            }
            return (
              <button
                key={tpl.id}
                data-testid={`slide-template-${tpl.id}`}
                onClick={() => onPick(tpl.id)}
                className="text-left rounded-lg border border-stone-200 dark:border-stone-700 hover:border-accent hover:ring-2 hover:ring-accent/30 overflow-hidden transition"
              >
                <div className="bg-stone-100 dark:bg-stone-950/40 flex items-center justify-center p-1">
                  <SlideFace slide={preview} theme={theme} width={232} />
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-[12px] font-medium text-stone-700 dark:text-stone-200">{tpl.name}</div>
                  <div className="text-[11px] text-stone-400 truncate">{tpl.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
