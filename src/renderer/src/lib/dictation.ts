// Dictation sink for the voice (Whisper) button. Tracks the last editable the
// user focused — a doc's ProseMirror surface, a note/sticky textarea, a sheet
// cell input, any text field — so the FAB can insert a transcript straight into
// what you were editing instead of only issuing canvas commands. This is the
// "dictate" half of press-to-talk (docs/VOICE-CONTEXT-ROUTING.md); AI commands
// layer on after.
//
// Clicking the mic itself must NOT become the target, so the tracker ignores any
// editable inside the FAB (marked data-voice-fab) and the mic button is a <button>
// anyway, which is not editable — so the editable you left stays the sink.

let lastEditable: HTMLElement | null = null
let installed = false

function isEditable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.closest('[data-voice-fab]')) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') {
    const ta = el as HTMLTextAreaElement
    return !ta.disabled && !ta.readOnly
  }
  if (tag === 'INPUT') {
    const inp = el as HTMLInputElement
    const textual = ['text', 'search', 'url', 'email', 'tel', 'number', 'password', ''].includes(inp.type)
    return textual && !inp.disabled && !inp.readOnly
  }
  return el.isContentEditable
}

// Install once (idempotent). Uses capture so it sees focus changes anywhere.
export function initDictationTracker(): void {
  if (installed) return
  installed = true
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target as Element | null
      if (isEditable(t)) lastEditable = t as HTMLElement
    },
    true
  )
}

// The current dictation target, or null when the user isn't in a text surface
// (e.g. on the bare canvas) — in which case the FAB keeps its AI-command behaviour.
export function getDictationTarget(): HTMLElement | null {
  if (lastEditable && lastEditable.isConnected && isEditable(lastEditable)) return lastEditable
  return null
}

// Insert text at the caret of an editable. execCommand('insertText') is the only
// universal caret-aware insert that also fires an `input` event — which React
// controlled inputs AND ProseMirror both observe, so the editor's own state stays
// in sync and the edit lands in its undo stack. It's deprecated but unreplaced for
// this. A manual value-splice fallback covers inputs/textareas if it ever no-ops.
export function dictateInto(el: HTMLElement, text: string): boolean {
  const t = text.trim()
  if (!t) return false
  el.focus()
  const payload = t.endsWith(' ') ? t : t + ' '
  try {
    if (document.execCommand('insertText', false, payload)) return true
  } catch {
    /* fall through to the manual splice */
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
    const next = el.value.slice(0, start) + payload + el.value.slice(end)
    setter?.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    const caret = start + payload.length
    el.setSelectionRange(caret, caret)
    return true
  }
  return false
}
