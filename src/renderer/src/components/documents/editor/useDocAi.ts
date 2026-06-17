// The document editor's AI hook. It drives two flows that both end in formatted
// content, previewed before it touches the document:
//   insert  - draft new content from an instruction, inserted at the cursor
//   rewrite - transform the current selection (concise, grammar, to a table, ...)
// The model returns constrained HTML; we sanitize and convert it to editor JSON
// via docHtml so colour, alignment and tables survive (markdown could not carry
// them).

import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { htmlToDocContent } from '../../../lib/docHtml'

export type DocAiMode = 'insert' | 'rewrite'

interface DocAiState {
  open: boolean
  mode: DocAiMode
  busy: boolean
  error: string | null
  previewHtml: string | null
}

export interface DocAi extends DocAiState {
  openInsert: () => void
  openRewrite: () => void
  close: () => void
  run: (instruction: string) => Promise<void>
  apply: () => void
}

export function useDocAi(editor: Editor | null): DocAi {
  const [state, setState] = useState<DocAiState>({
    open: false,
    mode: 'insert',
    busy: false,
    error: null,
    previewHtml: null
  })

  const openInsert = useCallback(
    () => setState({ open: true, mode: 'insert', busy: false, error: null, previewHtml: null }),
    []
  )
  const openRewrite = useCallback(
    () => setState({ open: true, mode: 'rewrite', busy: false, error: null, previewHtml: null }),
    []
  )
  const close = useCallback(
    () => setState((s) => ({ ...s, open: false, error: null, previewHtml: null })),
    []
  )

  const run = useCallback(
    async (instruction: string): Promise<void> => {
      if (!editor || !instruction.trim()) return
      setState((s) => ({ ...s, busy: true, error: null, previewHtml: null }))
      try {
        let res: { ok: boolean; html?: string; error?: string; needsApiKey?: boolean }
        if (state.mode === 'rewrite') {
          const { from, to } = editor.state.selection
          const selected = editor.state.doc.textBetween(from, to, '\n', ' ').trim()
          if (!selected) {
            setState((s) => ({ ...s, busy: false, error: 'Select some text to rewrite first.' }))
            return
          }
          res = await window.api.ai.rewriteSelection({ text: selected, instruction })
        } else {
          res = await window.api.ai.suggestDocContent({ prompt: instruction })
        }
        if (!res.ok || !res.html) {
          setState((s) => ({
            ...s,
            busy: false,
            error: res.error || (res.needsApiKey ? 'No Anthropic API key set.' : 'The AI returned nothing.')
          }))
          return
        }
        setState((s) => ({ ...s, busy: false, previewHtml: res.html ?? '' }))
      } catch (e) {
        setState((s) => ({ ...s, busy: false, error: (e as Error).message }))
      }
    },
    [editor, state.mode]
  )

  const apply = useCallback(() => {
    if (!editor || !state.previewHtml) return
    const content = htmlToDocContent(state.previewHtml)
    if (content.length === 0) {
      setState((s) => ({ ...s, error: 'Could not parse the AI output.' }))
      return
    }
    if (state.mode === 'rewrite') {
      editor.chain().focus().deleteSelection().insertContent(content).run()
    } else {
      editor.chain().focus().insertContent(content).run()
    }
    setState((s) => ({ ...s, open: false, previewHtml: null, error: null }))
  }, [editor, state.previewHtml, state.mode])

  return { ...state, openInsert, openRewrite, close, run, apply }
}
