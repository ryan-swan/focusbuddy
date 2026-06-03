import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/globals.css'

// Belt-and-braces: when an unmodified Space (or Shift+Space) is pressed
// inside a text input, textarea or contenteditable, short-circuit ALL
// other keydown handlers via stopImmediatePropagation. The browser's
// default "insert space" still runs because preventDefault is never
// called here. Registered in capture phase at FIRST mount — before any
// React component, dev-tools listener, HMR shim, accessibility tool
// or future global hotkey can install a competing handler. Cheap, no
// false positives (we only short-circuit when the caret is genuinely
// inside an editable element), and survives any future regression of
// the "space gets eaten in AI prompts" class of bug.
function isEditable(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type
    return t === 'text' || t === 'search' || t === 'url' || t === 'email' || t === 'password' || t === 'tel' || t === ''
  }
  return false
}
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== ' ' && e.code !== 'Space') return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!isEditable(e.target)) return
    e.stopImmediatePropagation()
  },
  true
)
// Same protection at the beforeinput layer — some libraries (TipTap /
// prosemirror, contenteditable wrappers) handle insertion via
// beforeinput rather than keydown. If one of them ever decides to
// preventDefault on inserting a single space, this guard cuts the
// other handlers off first.
window.addEventListener(
  'beforeinput',
  (e) => {
    if ((e as InputEvent).data !== ' ') return
    if (!isEditable(e.target)) return
    e.stopImmediatePropagation()
  },
  true
)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
