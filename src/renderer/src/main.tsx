import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { applyUiScale, loadUiScale } from './lib/uiScale'
// Self-hosted fonts. These used to load from the Google Fonts CDN via a <link> in
// index.html, which meant every icon (Material Symbols) and the UI type broke the
// moment the network was unavailable or the CDN was blocked, which a desktop app
// must never depend on. Bundling them makes icons and text always load, offline
// included.
import 'material-symbols/outlined.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/lexend'
import '@fontsource/jetbrains-mono'
import '@fontsource/patrick-hand'
import '@fontsource/atkinson-hyperlegible'
import './styles/globals.css'

// Restore the user's chosen text size before the app renders, so it comes up at
// the size they set rather than the default.
applyUiScale(loadUiScale())

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
