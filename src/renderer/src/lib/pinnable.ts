// The universal pin layer (spec §7): pin any item globally, carry it across
// navigation, and later drop it onto a chosen desk. This file holds the pure model
// + helpers; the store (stores/pinLayer) holds state, and PinTray does the impure
// open/place via window.api.

export type PinKind = 'desk' | 'room' | 'document' | 'widget' | 'activity' | 'link' | 'text'

export interface PinnedItem {
  id: string
  kind: PinKind
  // The object it points to: a node/document/widget id, or a URL for 'link'.
  refId: string
  title: string
  source?: string // human label of where it came from, e.g. "Home activity"
  content?: string // body for activity/text, materialised when dropped on a desk
  url?: string // for 'link'
  deskId?: string // owning desk for widget/activity — used to open + to place
  placedOn: string[] // desk ids this pin has been dropped onto
  createdAt: number
}

export type PinDraft = Omit<PinnedItem, 'id' | 'placedOn' | 'createdAt'>

// Which kinds can be materialised as a widget on a desk today. Others are
// open-only for now (honest: the tray disables Drop for them rather than
// pretending). desk → a live Portal; activity/link/text → a markdown note.
const PLACEABLE: ReadonlySet<PinKind> = new Set<PinKind>(['desk', 'activity', 'link', 'text'])
export function canPlaceKind(kind: PinKind): boolean {
  return PLACEABLE.has(kind)
}

export const PIN_ICON: Record<PinKind, string> = {
  desk: 'desk',
  room: 'folder',
  document: 'article',
  widget: 'widgets',
  activity: 'bolt',
  link: 'link',
  text: 'sticky_note_2'
}

// Markdown body when a text / activity / link pin is dropped onto a desk. Carries
// the title, any captured content, the link, and an italic source line — never
// fabricates content it doesn't have.
export function pinDropMarkdown(item: PinnedItem): string {
  const lines = [`# ${item.title}`]
  if (item.content) {
    lines.push('')
    lines.push(item.content)
  }
  if (item.url) {
    lines.push('')
    lines.push(item.url)
  }
  if (item.source) {
    lines.push('')
    lines.push(`_${item.source}_`)
  }
  return lines.join('\n')
}
