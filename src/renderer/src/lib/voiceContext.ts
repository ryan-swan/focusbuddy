import type { DocType } from '@shared/types'
import { useViewStore } from '../stores/view'
import { useDocumentsStore } from '../stores/documents'
import { useWidgetStore } from '../stores/widgets'

// The single place that decides what a spoken voice command should act on, so the
// VoiceCommandFAB never scatters view/document/widget store reads across its
// send-time and apply-time handlers (which would let a command captured on the
// canvas apply after the user has navigated into a document). Read it FRESH at
// both send and apply — never cache it across a capture→send→apply lifecycle.
//
// See docs/VOICE-CONTEXT-ROUTING.md for the rollout. Today only the 'canvas'
// branch is wired end to end; 'document' is detected so the per-docType handlers
// can be added checkpoint by checkpoint without re-plumbing the FAB.

export type VoiceContext =
  | {
      kind: 'canvas'
      taskId: string | null
      selectedWidgetId: string | null
      focusedWidgetId: string | null
    }
  | { kind: 'document'; documentId: string; docType: DocType }

export function resolveVoiceContext(): VoiceContext {
  const view = useViewStore.getState().view

  // An office file is open AND actually mounted (id match guards a view/store
  // race where the view switched but the document store hasn't loaded yet).
  if (view.kind === 'document') {
    const active = useDocumentsStore.getState().active
    if (active && active.id === view.documentId) {
      return { kind: 'document', documentId: active.id, docType: active.docType }
    }
  }

  // Everything else resolves to the canvas path (today's only wired behaviour).
  const ws = useWidgetStore.getState()
  return {
    kind: 'canvas',
    taskId: view.kind === 'task' ? view.taskId : null,
    selectedWidgetId: ws.activeWidgetId,
    focusedWidgetId: ws.focusedWidgetId
  }
}
