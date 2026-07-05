// Accessibility check for a PlexiDesign canvas — the Design slice of the shared
// a11y checker. A design is mostly imagery, so the main concern is alt text.
// Pure + honest: a clean design returns an empty list.

import type { DesignBody } from '@shared/design'
import type { A11yIssue } from './docA11y'

export function checkDesignA11y(design: DesignBody): A11yIssue[] {
  const missing = (design.elements ?? []).filter((el) => el.type === 'image' && !((el.alt ?? '').trim())).length
  if (missing === 0) return []
  return [
    {
      severity: 'error',
      message: `${missing} image${missing === 1 ? '' : 's'} missing alt text — add a description in the inspector for accessibility.`
    }
  ]
}
