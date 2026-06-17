// Find & replace as a ProseMirror plugin. It decorates every match of the
// current query (so the user sees all hits), steps the selection through them,
// and replaces the current hit or all hits. Matching reuses the pure findMatches
// core (docFind.ts); positions are computed per text node so plain-text offsets
// map correctly onto document positions.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { findMatches, type FindOptions } from '../../../lib/docFind'

export const searchKey = new PluginKey('docSearch')

interface SearchState {
  query: string
  opts: FindOptions
  set: DecorationSet
  matches: Array<{ from: number; to: number }>
}

function build(doc: PMNode, query: string, opts: FindOptions): SearchState {
  if (!query) return { query, opts, set: DecorationSet.empty, matches: [] }
  const matches: Array<{ from: number; to: number }> = []
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const m of findMatches(node.text, query, opts)) {
      const from = pos + m.start
      const to = pos + m.end
      matches.push({ from, to })
      decos.push(Decoration.inline(from, to, { style: 'background-color: rgba(250,204,21,0.55)' }))
    }
  })
  return { query, opts, set: DecorationSet.create(doc, decos), matches }
}

// Read the live search state for the count/index UI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSearchState(editor: any): { count: number; index: number } {
  const st = searchKey.getState(editor.state) as SearchState | undefined
  if (!st || st.matches.length === 0) return { count: 0, index: 0 }
  const sel = editor.state.selection.from
  const idx = st.matches.findIndex((m) => m.from <= sel && sel <= m.to)
  return { count: st.matches.length, index: idx === -1 ? 0 : idx + 1 }
}

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    docSearch: {
      setSearch: (query: string, opts: FindOptions) => ReturnType
      clearSearch: () => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAllMatches: (replacement: string) => ReturnType
    }
  }
}

export const SearchHighlight = Extension.create({
  name: 'docSearch',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: (): SearchState => ({ query: '', opts: {}, set: DecorationSet.empty, matches: [] }),
          apply(tr, value: SearchState): SearchState {
            const meta = tr.getMeta(searchKey) as { query: string; opts: FindOptions } | undefined
            if (meta) return build(tr.doc, meta.query, meta.opts)
            if (tr.docChanged && value.query) return build(tr.doc, value.query, value.opts)
            return value
          }
        },
        props: {
          decorations(state) {
            return (searchKey.getState(state) as SearchState | undefined)?.set
          }
        }
      })
    ]
  },

  addCommands() {
    return {
      setSearch:
        (query, opts) =>
        ({ state, dispatch }) => {
          dispatch?.(state.tr.setMeta(searchKey, { query, opts }))
          return true
        },
      clearSearch:
        () =>
        ({ state, dispatch }) => {
          dispatch?.(state.tr.setMeta(searchKey, { query: '', opts: {} }))
          return true
        },
      findNext:
        () =>
        ({ state, dispatch, tr }) => {
          const st = searchKey.getState(state) as SearchState | undefined
          if (!st || st.matches.length === 0) return false
          const sel = state.selection.from
          const next = st.matches.find((m) => m.from > sel) ?? st.matches[0]
          dispatch?.(tr.setSelection(TextSelection.create(tr.doc, next.from, next.to)).scrollIntoView())
          return true
        },
      findPrev:
        () =>
        ({ state, dispatch, tr }) => {
          const st = searchKey.getState(state) as SearchState | undefined
          if (!st || st.matches.length === 0) return false
          const sel = state.selection.from
          const prevs = st.matches.filter((m) => m.to < sel)
          const prev = prevs.length ? prevs[prevs.length - 1] : st.matches[st.matches.length - 1]
          dispatch?.(tr.setSelection(TextSelection.create(tr.doc, prev.from, prev.to)).scrollIntoView())
          return true
        },
      replaceCurrent:
        (replacement) =>
        ({ state, dispatch, tr }) => {
          const { from, to } = state.selection
          if (from === to) return false
          tr.insertText(replacement, from, to)
          dispatch?.(tr)
          return true
        },
      replaceAllMatches:
        (replacement) =>
        ({ state, dispatch, tr }) => {
          const st = searchKey.getState(state) as SearchState | undefined
          if (!st || st.matches.length === 0) return false
          // Back to front so earlier replacements do not shift later positions.
          for (let i = st.matches.length - 1; i >= 0; i--) {
            const m = st.matches[i]
            tr.insertText(replacement, m.from, m.to)
          }
          dispatch?.(tr)
          return true
        }
    }
  }
})
