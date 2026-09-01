// Capture's teachable copy (the rebuild, 2026-08-30). Lives here so it is
// importable without JSX; CaptureConsole renders it.

/** The rotating placeholder — the one thing in the product teaching the
 *  category grammar by example. Cycles while the field is empty + unfocused. */
export const CAPTURE_LEADINS = [
  'Remind me to…',
  'Review the…',
  'Decide whether…',
  'Reply to…',
  'Meet with…',
  'Talk through…',
  'fyi: …'
] as const

export const ROTATE_MS = 2600
