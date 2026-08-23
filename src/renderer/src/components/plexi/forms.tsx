import type { ReactNode } from 'react'

// Shared form primitives for the Plexi suite. Every input, textarea and select
// on a Plexi surface composes fieldInputClass() instead of hand-rolling
// hardcoded grey utility classes, so fields repaint correctly across light,
// dark, futuristic and atelier via the token ramps in tokens.css.

/** The canonical token-driven field skin for inputs, textareas and selects. */
export function fieldInputClass(): string {
  // The canonical field skin lives in globals.css as .fb-field so plain markup
  // and this helper share ONE definition. Never re-inline the recipe.
  return 'fb-field'
}

/** The 11px uppercase field label used above every form control. */
export function FieldLabel({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <label
      className={`block text-[11px] uppercase tracking-wider text-[var(--ink-50)] font-medium mb-1.5 ${className}`}
    >
      {children}
    </label>
  )
}

/** Label + optional inline hint + control, the standard vertical field block. */
export function FormField({
  label,
  hint,
  className = '',
  children
}: {
  label: ReactNode
  hint?: ReactNode
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className={className}>
      <FieldLabel>
        {label}
        {hint != null && <span className="normal-case text-[var(--ink-40)]"> {hint}</span>}
      </FieldLabel>
      {children}
    </div>
  )
}
