// The document editor's AI hook. It drives the flows that all end in formatted
// content, previewed before it touches the document:
//   insert  - draft new content from an instruction, inserted at the cursor
//   rewrite - transform the current selection (concise, grammar, to a table, ...)
// The model returns constrained HTML; we sanitize and convert it to editor JSON
// via docHtml so colour, alignment and tables survive (markdown could not carry
// them).
//
// The right-side AI Assistant panel builds on the SAME real infrastructure. Its
// quick actions call window.api.ai.rewriteSelection (transform a span) or
// window.api.ai.suggestDocContent (whole-document work like summarise/translate).
// There is no dedicated summarise/translate endpoint, so those actions embed the
// document text via editor.getText() into a suggestDocContent prompt. A rewrite
// action with no selection honestly falls back to operating on the whole document
// text rather than silently doing nothing.

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
  // Quick actions for the AI Assistant panel. Each ends in a preview (previewHtml)
  // with the same apply() path, or sets `error` with the real failure text.
  summarize: () => Promise<void>
  improve: () => Promise<void>
  shorten: () => Promise<void>
  grammar: () => Promise<void>
  translate: (language: string) => Promise<void>
  // Reset the panel to a clean state (no preview, no error, no busy).
  reset: () => void
}

// One rewrite-style action. Uses the current selection when there is one; with no
// selection it falls back to the whole document text through the same real API, so
// the action never silently no-ops. Returns the HTML or throws with the real error.
async function runRewrite(editor: Editor, instruction: string): Promise<string> {
  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to, '\n', ' ').trim()
  const text = selected || editor.getText().trim()
  if (!text) throw new Error('There is nothing in the document to work on yet. Add some text first.')
  const res = await window.api.ai.rewriteSelection({ text, instruction })
  if (!res.ok || !res.html) {
    throw new Error(res.error || (res.needsApiKey ? 'No Anthropic API key set.' : 'The AI returned nothing.'))
  }
  return res.html
}

// One whole-document action (summarise, translate). Embeds the full document text
// into a suggestDocContent prompt, since there is no dedicated endpoint for these.
async function runWholeDoc(editor: Editor, prompt: string): Promise<string> {
  const body = editor.getText().trim()
  if (!body) throw new Error('There is nothing in the document to work on yet. Add some text first.')
  const full = `${prompt}\n\n${body}`
  const res = await window.api.ai.suggestDocContent({ prompt: full })
  if (!res.ok || !res.html) {
    throw new Error(res.error || (res.needsApiKey ? 'No Anthropic API key set.' : 'The AI returned nothing.'))
  }
  return res.html
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
  const reset = useCallback(
    () => setState((s) => ({ ...s, busy: false, error: null, previewHtml: null })),
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

  // Drive a quick action: set the mode so apply() inserts (whole-doc) or replaces
  // the selection (rewrite), run the real API, and land the result in previewHtml.
  const quick = useCallback(
    async (mode: DocAiMode, work: (editor: Editor) => Promise<string>): Promise<void> => {
      if (!editor) return
      setState((s) => ({ ...s, mode, busy: true, error: null, previewHtml: null }))
      try {
        const html = await work(editor)
        setState((s) => ({ ...s, busy: false, previewHtml: html }))
      } catch (e) {
        setState((s) => ({ ...s, busy: false, error: (e as Error).message }))
      }
    },
    [editor]
  )

  const summarize = useCallback(
    () =>
      quick('insert', (ed) =>
        runWholeDoc(
          ed,
          'Summarise the following document into a short, clear summary with a heading and a few concise points. Return formatted HTML only.'
        )
      ),
    [quick]
  )
  const improve = useCallback(
    () => quick('rewrite', (ed) => runRewrite(ed, 'Improve the writing while keeping the meaning. Return formatted HTML only.')),
    [quick]
  )
  const shorten = useCallback(
    () => quick('rewrite', (ed) => runRewrite(ed, 'Make this shorter and more concise while keeping the meaning. Return formatted HTML only.')),
    [quick]
  )
  const grammar = useCallback(
    () => quick('rewrite', (ed) => runRewrite(ed, 'Fix spelling and grammar without changing the meaning or tone. Return formatted HTML only.')),
    [quick]
  )
  const translate = useCallback(
    (language: string) =>
      quick('insert', (ed) =>
        runWholeDoc(
          ed,
          `Translate the following document into ${language}. Preserve the formatting and structure. Return formatted HTML only.`
        )
      ),
    [quick]
  )

  const apply = useCallback(() => {
    if (!editor || !state.previewHtml) return
    const content = htmlToDocContent(state.previewHtml)
    if (content.length === 0) {
      setState((s) => ({ ...s, error: 'Could not parse the AI output.' }))
      return
    }
    if (state.mode === 'rewrite') {
      const { empty } = editor.state.selection
      if (empty) editor.chain().focus().insertContent(content).run()
      else editor.chain().focus().deleteSelection().insertContent(content).run()
    } else {
      editor.chain().focus().insertContent(content).run()
    }
    // Clear the preview after applying. `open` controls the legacy inline panel
    // only; the right-side AI Assistant manages its own visibility, so closing it
    // here is harmless to that panel and keeps the inline panel's old behaviour.
    setState((s) => ({ ...s, open: false, previewHtml: null, error: null }))
  }, [editor, state.previewHtml, state.mode])

  return {
    ...state,
    openInsert,
    openRewrite,
    close,
    run,
    apply,
    summarize,
    improve,
    shorten,
    grammar,
    translate,
    reset
  }
}
