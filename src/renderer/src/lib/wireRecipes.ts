import type { WidgetKind } from '@shared/types'

// Preset transform recipes — the one-click "the AI writes the instruction for you"
// library (Lever 2). Facing a blank instruction box is the biggest reason people
// never use transform wires, per the adoption panel; a recipe fills a good verb so
// the first useful result happens in one click, and the user can still edit it.
//
// A recipe is just a named verb (the transform instruction). `appliesTo` narrows
// which SOURCE kinds it's offered for so the suggestions stay relevant; omit it to
// offer the recipe for any text-bearing source. `targetKind` is a hint for future
// "create the target too" flows — the recipe itself only sets the wire's verb.

export interface WireRecipe {
  id: string
  label: string
  verb: string
  icon: string
  appliesTo?: WidgetKind[]
  targetKind?: WidgetKind
}

// Kinds that carry free text a transform can meaningfully read.
export const TEXT_SOURCE_KINDS: WidgetKind[] = [
  'sticky',
  'note',
  'markdown',
  'page',
  'card',
  'doc',
  'living-doc',
  'file',
  'webview',
  'voice-recorder',
  'agent'
]

export const WIRE_RECIPES: WireRecipe[] = [
  {
    id: 'action-items',
    label: 'Extract action items',
    verb: 'Extract the action items from this as a short checklist. Only list concrete, actionable tasks.',
    icon: 'checklist'
  },
  {
    id: 'summarize',
    label: 'Summarize',
    verb: 'Summarize this clearly and concisely in a few bullet points.',
    icon: 'notes'
  },
  {
    id: 'key-points',
    label: 'Pull key points',
    verb: 'Pull out the key points as a tight bulleted list, most important first.',
    icon: 'format_list_bulleted'
  },
  {
    id: 'to-table',
    label: 'Turn into a table',
    verb: 'Turn this into a structured table with clear typed columns and one row per item.',
    icon: 'table_chart',
    targetKind: 'table'
  },
  {
    id: 'draft-reply',
    label: 'Draft a reply',
    verb: 'Draft a concise, professional reply to this.',
    icon: 'reply'
  },
  {
    id: 'rewrite-clearer',
    label: 'Rewrite clearer',
    verb: 'Rewrite this to be clearer and more concise, keeping the meaning and tone.',
    icon: 'auto_fix_high'
  },
  {
    id: 'extract-dates',
    label: 'Find dates & deadlines',
    verb: 'List every date, deadline or scheduled item mentioned, each with what it refers to.',
    icon: 'event'
  }
]

// The recipes worth suggesting for a given source kind. Text sources get the full
// set; anything else gets none (the user can still type a custom verb). Kept small
// and relevant so the picker never becomes a wall of options.
export function recipesForSource(sourceKind: WidgetKind | undefined): WireRecipe[] {
  if (!sourceKind) return WIRE_RECIPES
  return WIRE_RECIPES.filter((r) => !r.appliesTo || r.appliesTo.includes(sourceKind)).filter(
    () => TEXT_SOURCE_KINDS.includes(sourceKind)
  )
}
