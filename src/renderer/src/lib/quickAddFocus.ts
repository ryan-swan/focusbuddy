// Should a bare letter create an object right now?
//
// Single-key quick-add (S=sticky, T=table, …) is a genuinely nice accelerator
// and a genuinely dangerous one: the same keystroke that means "new sticky" on
// an empty desk means "the letter s" the instant the user is writing something.
// Getting that wrong does not just annoy, it fabricates objects the user did
// not ask for, which is a data-integrity problem rather than a UX one.
//
// The previous guard asked whether document.activeElement was an INPUT, a
// TEXTAREA or contenteditable. That is a deny-list, and it misses the exact
// case people hit: click into a sticky, start typing before the editor has
// actually taken focus, and activeElement is still the body -- so every letter
// is read as a shortcut. It also misses focus inside a <webview>, inside a
// shadow root, on a <select>, and on any custom control that is not one of the
// three named tags.
//
// So this asks the opposite question: is focus *confirmed* to be somewhere that
// wants raw letters as commands? Anything else, including uncertainty, blocks.

/** Focus can live inside a shadow root; activeElement only reports the host. */
export function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const el = root.activeElement
  const shadow = (el as (Element & { shadowRoot?: ShadowRoot | null }) | null)?.shadowRoot
  if (el && shadow) return deepActiveElement(shadow)
  return el
}

/**
 * Elements that consume typing, or that host content we cannot see into. A
 * <webview> or <iframe> is opaque: the user may well be typing inside it, and
 * we have no way to ask, so it counts as typing.
 */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'WEBVIEW', 'IFRAME', 'OPTION'])

/**
 * Interactive roles that own the keyboard while focused. Buttons and links are
 * included because a letter there is at best meaningless and at worst a
 * type-ahead the user expects to reach the control, never a canvas command.
 */
const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  // An explicit opt-out any component can set on a subtree.
  '[data-no-shortcuts]'
].join(',')

/** True when the focused element means the user is typing or driving a control. */
export function focusBlocksQuickAdd(el: Element | null): boolean {
  if (!el) return false
  if (TYPING_TAGS.has(el.tagName)) return true
  const html = el as HTMLElement
  if (html.isContentEditable) return true
  // The focused element may be a plain span inside an editor or a dialog; what
  // matters is whether anything up the tree owns the keyboard.
  if (typeof el.closest === 'function' && el.closest(INTERACTIVE_SELECTOR)) return true
  return false
}

export interface QuickAddContext {
  /** The desk currently open. Quick-add is meaningless without one. */
  activeTaskId: string | null
  /** The widget the user has activated (clicked into). */
  activeWidgetId: string | null
  /** The widget open in focus mode. */
  focusedWidgetId: string | null
  /** document.activeElement, already pierced through shadow roots. */
  focusedElement: Element | null
}

/**
 * The single decision. Quick-add fires only on a desk, with nothing engaged,
 * and with focus resting somewhere that is not a control.
 *
 * The activeWidgetId check is the one that fixes the reported bug: clicking
 * into a sticky activates it long before its editor wins focus, and during that
 * window the old guard saw an unfocused body and happily created objects.
 */
export function quickAddAllowed(ctx: QuickAddContext): boolean {
  if (!ctx.activeTaskId) return false
  // A widget is engaged: the user is working inside an object, whatever the
  // focus machinery currently reports.
  if (ctx.activeWidgetId) return false
  if (ctx.focusedWidgetId) return false
  if (focusBlocksQuickAdd(ctx.focusedElement)) return false
  return true
}
