import { useEffect, useState } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { catalogFor } from '../lib/widgetCatalog'
import StickyWidget from './widgets/StickyWidget'
import NoteWidget from './widgets/NoteWidget'
import MarkdownWidget from './widgets/MarkdownWidget'
import TaskLinkWidget from './widgets/TaskLinkWidget'
import LocalAppLauncherWidget from './widgets/LocalAppLauncherWidget'
import FileWidget from './widgets/FileWidget'
import FieldWidget from './widgets/FieldWidget'
import PageWidget from './widgets/PageWidget'
import TableWidget from './widgets/TableWidget'
import CalculatorWidget from './widgets/CalculatorWidget'
import ColorWidget from './widgets/ColorWidget'
import WebViewWidget from './widgets/WebViewWidget'
import ImageWidget from './widgets/ImageWidget'
import VideoWidget from './widgets/VideoWidget'
import TimerWidget from './widgets/TimerWidget'
import MinimapWidget from './widgets/MinimapWidget'
import VoiceRecorderWidget from './widgets/VoiceRecorderWidget'
import MindMapWidget from './widgets/MindMapWidget'
import Icon from './Icon'
import type { Widget } from '@shared/types'

function renderInline(w: Widget): JSX.Element | null {
  switch (w.kind) {
    case 'sticky':
      return <StickyWidget widget={w} inline />
    case 'note':
      return <NoteWidget widget={w} inline />
    case 'markdown':
      return <MarkdownWidget widget={w} inline />
    case 'task-link':
      return <TaskLinkWidget widget={w} inline />
    case 'local-app-launcher':
      return <LocalAppLauncherWidget widget={w} inline />
    case 'file':
      return <FileWidget widget={w} inline />
    case 'field':
      return <FieldWidget widget={w} inline />
    case 'page':
      return <PageWidget widget={w} inline />
    case 'table':
      return <TableWidget widget={w} inline />
    case 'calculator':
      return <CalculatorWidget widget={w} inline />
    case 'color':
      return <ColorWidget widget={w} inline />
    case 'image':
      return <ImageWidget widget={w} inline />
    case 'video':
      return <VideoWidget widget={w} inline />
    case 'timer':
      return <TimerWidget widget={w} inline />
    case 'minimap':
      return <MinimapWidget widget={w} inline />
    case 'voice-recorder':
      return <VoiceRecorderWidget widget={w} inline />
    case 'mindmap':
      return <MindMapWidget widget={w} inline />
    case 'section':
      return null
    case 'webview':
    case 'pdf':
    case 'gdoc':
    case 'gsheet':
    case 'gslide':
    case 'email':
      return <WebViewWidget widget={w} inline />
    default:
      return null
  }
}

export default function WidgetFocusMode(): JSX.Element | null {
  const focusedId = useWidgetStore((s) => s.focusedWidgetId)
  const widgets = useWidgetStore((s) => s.widgets)
  const setFocused = useWidgetStore((s) => s.setFocused)
  const widget = focusedId ? widgets.find((w) => w.id === focusedId) ?? null : null
  const entry = widget ? catalogFor(widget.kind) : null
  const [maximized, setMaximized] = useState(false)

  // Reset maximize when modal closes / different widget opens
  useEffect(() => {
    if (!widget) setMaximized(false)
  }, [widget])

  useEffect(() => {
    if (!widget) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setFocused(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [widget, setFocused])

  if (!widget) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-md"
      style={{ padding: maximized ? 0 : '1cm' }}
      onClick={() => setFocused(null)}
    >
      <div
        className={`bg-white dark:bg-stone-900 shadow-2xl w-full h-full flex flex-col overflow-hidden border border-stone-200 dark:border-stone-700 ${
          maximized ? '' : 'rounded-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex items-center gap-2 shrink-0">
          <Icon name={entry?.icon ?? 'apps'} size={18} className="text-stone-600 dark:text-stone-300" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex-1 truncate">
            {widget.title || entry?.label || 'Widget'}
          </h3>
          <span className="text-[11px] text-stone-500 dark:text-stone-400 hidden sm:inline">
            press <kbd className="px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">Esc</kbd> to close
          </span>
          <button
            onClick={() => setMaximized((v) => !v)}
            className="icon-btn"
            aria-label={maximized ? 'Restore window padding' : 'Maximize to full window'}
            title={maximized ? 'Restore (1cm padding)' : 'Maximize (full window)'}
          >
            <Icon name={maximized ? 'fullscreen_exit' : 'fullscreen'} size={16} />
          </button>
          <button
            onClick={() => setFocused(null)}
            className="icon-btn"
            aria-label="Close focus mode"
            title="Close (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{renderInline(widget)}</div>
      </div>
    </div>
  )
}
