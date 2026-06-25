// PlexiBuild: build internal tools without code. An app is a screen you compose
// from typed components, headings, text, input fields, buttons, dividers, in a
// Build mode and run in a Preview mode. This is Phase 1 of the visual app
// platform: a single-screen component stack with persistence. Later phases add
// multi-screen navigation, data binding to tables, logic and actions, and a
// free-canvas layout. The model below is deliberately forward-compatible: a
// component carries a loose config bag so new component types and bindings slot
// in without a migration.
//
// Stored locally (same SQLite as the other surfaces). Nothing is fabricated: a
// new app starts genuinely empty, and an empty workspace has no apps until you
// build one.

export type AppComponentType = 'heading' | 'text' | 'field' | 'button' | 'divider'

export type AppFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date'

export interface AppComponent {
  id: string
  type: AppComponentType
  // Heading / field / button label.
  label?: string
  // Paragraph text for 'text'.
  text?: string
  // For 'field': the input type + (for select) its options + placeholder.
  fieldType?: AppFieldType
  options?: string[]
  placeholder?: string
  // For 'button': what it does. 'link' opens a url; 'none' is a placeholder for
  // the logic/actions phase.
  action?: { kind: 'none' | 'link'; url?: string }
}

export interface PlexiApp {
  id: string
  name: string
  icon: string
  components: AppComponent[]
  createdAt: number
  updatedAt: number
}

export interface PlexiAppDraft {
  name?: string
  icon?: string
  components?: AppComponent[]
}

export interface PlexiAppPatch {
  name?: string
  icon?: string
  components?: AppComponent[]
}

export const APP_COMPONENT_META: Record<AppComponentType, { label: string; icon: string }> = {
  heading: { label: 'Heading', icon: 'title' },
  text: { label: 'Text', icon: 'notes' },
  field: { label: 'Input field', icon: 'input' },
  button: { label: 'Button', icon: 'smart_button' },
  divider: { label: 'Divider', icon: 'horizontal_rule' }
}

export const APP_FIELD_META: Record<AppFieldType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'short_text' },
  number: { label: 'Number', icon: 'tag' },
  select: { label: 'Select', icon: 'arrow_drop_down_circle' },
  checkbox: { label: 'Checkbox', icon: 'check_box' },
  date: { label: 'Date', icon: 'calendar_today' }
}

export function newComponent(type: AppComponentType): AppComponent {
  const id = `c-${Math.random().toString(36).slice(2, 9)}`
  switch (type) {
    case 'heading':
      return { id, type, label: 'Heading' }
    case 'text':
      return { id, type, text: 'Some text.' }
    case 'field':
      return { id, type, label: 'Field', fieldType: 'text', placeholder: '' }
    case 'button':
      return { id, type, label: 'Button', action: { kind: 'none' } }
    case 'divider':
      return { id, type }
    default:
      return { id, type }
  }
}
