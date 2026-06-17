// Find & replace panel. Drives the SearchHighlight extension: it sets the query,
// steps through matches, and replaces the current hit or all hits. The match
// count and current index come from the plugin state.

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import Icon from '../../Icon'
import { getSearchState } from './searchHighlight'

interface Props {
  editor: Editor
  onClose: () => void
}

export default function FindReplace({ editor, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [status, setStatus] = useState({ count: 0, index: 0 })

  // Push the query into the plugin whenever it or the options change.
  useEffect(() => {
    editor.commands.setSearch(query, { caseSensitive, wholeWord })
    setStatus(getSearchState(editor))
  }, [editor, query, caseSensitive, wholeWord])

  // Keep the count/index in sync as the selection or document moves.
  useEffect(() => {
    const update = (): void => setStatus(getSearchState(editor))
    editor.on('selectionUpdate', update)
    editor.on('update', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('update', update)
    }
  }, [editor])

  // Clear highlights when the panel closes.
  useEffect(() => {
    return () => {
      editor.commands.clearSearch()
    }
  }, [editor])

  function next(): void {
    editor.commands.findNext()
    setStatus(getSearchState(editor))
  }
  function prev(): void {
    editor.commands.findPrev()
    setStatus(getSearchState(editor))
  }
  function replaceOne(): void {
    editor.commands.replaceCurrent(replacement)
    editor.commands.findNext()
    setStatus(getSearchState(editor))
  }
  function replaceAll(): void {
    editor.commands.replaceAllMatches(replacement)
    setStatus(getSearchState(editor))
  }

  return (
    <div
      data-testid="doc-find-replace"
      className="absolute top-2 right-2 z-40 w-80 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl p-2 space-y-1.5"
    >
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.shiftKey ? prev() : next())
            if (e.key === 'Escape') onClose()
          }}
          placeholder="Find"
          data-testid="doc-find-input"
          className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
        />
        <span className="text-[11px] text-stone-400 tabular-nums w-14 text-center" data-testid="doc-find-count">
          {status.count ? `${status.index}/${status.count}` : '0/0'}
        </span>
        <button onClick={prev} title="Previous (Shift+Enter)" className="icon-btn">
          <Icon name="keyboard_arrow_up" size={16} />
        </button>
        <button onClick={next} title="Next (Enter)" className="icon-btn">
          <Icon name="keyboard_arrow_down" size={16} />
        </button>
        <button onClick={onClose} title="Close (Esc)" className="icon-btn">
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
        <button
          onClick={() => setShowReplace((v) => !v)}
          className="inline-flex items-center gap-0.5 hover:text-accent"
        >
          <Icon name={showReplace ? 'expand_less' : 'expand_more'} size={14} /> Replace
        </button>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="accent-accent" />
          Case
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} className="accent-accent" />
          Whole word
        </label>
      </div>

      {showReplace && (
        <div className="flex items-center gap-1">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace with"
            data-testid="doc-replace-input"
            className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
          />
          <button onClick={replaceOne} className="px-2 py-1 rounded text-[11px] border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800">
            Replace
          </button>
          <button onClick={replaceAll} data-testid="doc-replace-all" className="px-2 py-1 rounded text-[11px] bg-accent text-white">
            All
          </button>
        </div>
      )}
    </div>
  )
}
