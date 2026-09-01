// Where a picked "@" mention should replace text.
//
// The tiptap suggestion plugin hands `command()` a `range`, and the happy path
// is to delete exactly that. In practice it can lag the caret by a keystroke on
// this React/tiptap pairing — the same class of problem as the null `.ref` the
// picker already works around — and the visible symptom is the typed query
// surviving the insert: "@att" + Tab left "att @attention" in the box
// (operator live QA).
//
// So the range is treated as a HINT and reconciled against the document: the
// text actually being replaced runs from the "@" that opened the picker to the
// caret. Pure arithmetic over primitives, so every case is unit-tested without
// a ProseMirror instance.

export interface ReplaceRange {
  from: number
  to: number
}

/**
 * The document range a picked mention should replace.
 *
 * @param caret        absolute position of the caret (selection head)
 * @param textBefore   document text immediately before the caret (a bounded
 *                     window; only its tail matters)
 * @param hint         the suggestion plugin's own range
 *
 * The "@" nearest the caret wins, because that is the one the open picker
 * belongs to — an earlier "@" in the same paragraph is a completed mention,
 * not this query. When no "@" is in the window (nothing to reconcile against)
 * the hint is trusted unchanged, and the result always spans at least the
 * hint so a lagging range can never leave a fragment behind.
 */
export function mentionReplaceRange(
  caret: number,
  textBefore: string,
  hint: ReplaceRange
): ReplaceRange {
  const at = textBefore.lastIndexOf('@')
  if (at === -1) {
    // Nothing to anchor to — trust the plugin, but never end before the caret.
    return { from: hint.from, to: Math.max(hint.to, caret) }
  }
  const fromAt = caret - (textBefore.length - at)
  return {
    // Whichever anchor sits further left is the one that leaves no fragment.
    from: Math.min(fromAt, hint.from),
    to: Math.max(hint.to, caret)
  }
}
