// The home widget registry — pure data, no JSX, no store imports. Lives apart
// from homeWidgets.tsx so grid geometry (homeGridLayout.ts) and unit tests can
// read the catalog without dragging component code in.

export type HomeWidgetId =
  | 'standup'
  | 'navigator'
  | 'continue'
  | 'agenda'
  | 'pulse'
  | 'quick'
  | 'activity'
  | 'pinned-desk'
  | 'room-portal'
  | 'quick-links'
  | 'shortcuts'
  | 'app-launcher'
  | 'create'
  | 'overdue'
  | 'focus-timer'
  | 'one-thing'
  | 'where-was-i'
  | 'stalled'
  | 'new-meeting'
  | 'pinned-conversation'
  | 'transcribe'

// One tile in a Shortcuts box. Every kind carries an optional label snapshot
// taken when the target was added: live store titles win while the subject
// exists (renames stay fresh), the snapshot keeps a dead target legible
// ("Payroll desk" instead of an anonymous missing tile).
export type ShortcutTarget =
  | { kind: 'url'; url: string; label?: string }
  | { kind: 'section'; id: string; label?: string }
  | { kind: 'desk'; nodeId: string; label?: string }
  | { kind: 'room'; roomId: string; label?: string }
  | { kind: 'document'; documentId: string; label?: string }
  | { kind: 'connected-app'; appId: string; label?: string }
  // A tile that DOES something instead of going somewhere: starts a meeting
  // or a transcription right from the box.
  | { kind: 'action'; action: 'new-meeting' | 'transcribe'; label?: string }
  // Message a person: opens their DM (starting it for real if none exists).
  | { kind: 'person'; accountId: string; handle?: string; label?: string }
  // A specific widget on a desk: lands on the desk with the camera centred on
  // that widget (the desk alone if the widget has since been removed).
  | { kind: 'desk-widget'; nodeId: string; widgetId: string; label?: string }

export interface HomeWidgetConfig {
  deskId?: string
  roomId?: string
  routes?: string[]
  // Shortcuts: the box name and its tiles.
  title?: string
  targets?: ShortcutTarget[]
  // Pinned conversation: either a conversation, or a person (name and handle
  // snapshotted at pin time — presence only lists people currently online, so
  // the tile must stay legible when they are not).
  conversationId?: string
  personId?: string
  personHandle?: string
  personName?: string
}

export interface HomeWidgetInstance {
  key: string
  widget: HomeWidgetId
  config?: HomeWidgetConfig
}

// Apple-style widget sizes, in grid cells: sm 1x1, md 2x1, lg 2x2,
// stack 1x2 tall. Every def declares only the sizes its content genuinely
// supports, plus the size it arrives at.
export type WidgetSize = 'sm' | 'md' | 'lg' | 'stack'

export interface HomeWidgetDef {
  id: HomeWidgetId
  name: string
  blurb: string
  icon: string
  tint: string
  category: 'Navigation' | 'Live' | 'Actions' | 'Smart' | 'Communication'
  // Multi-instance widgets (a pinned desk per desk, a portal per room). All
  // others are singletons: the gallery shows them as Added once placed.
  multi?: boolean
  // Which picker must run before this widget can be placed.
  config?: 'desk' | 'room' | 'conversation'
  // Retired widgets stay in the id union and this registry so stored layouts
  // keep loading (and migrating) sanely, but the gallery never offers them.
  retired?: boolean
  defaultCol: 'main' | 'rail'
  sizes: WidgetSize[]
  defaultSize: WidgetSize
}

export const HOME_WIDGET_DEFS: HomeWidgetDef[] = [
  // Live
  { id: 'standup', name: 'Standup', blurb: 'Your look-back and look-forward narrative for the day', icon: 'auto_awesome', tint: 'bg-accent/10 text-accent', category: 'Live', defaultCol: 'main', sizes: ['lg'], defaultSize: 'lg' },
  { id: 'agenda', name: "Today's agenda", blurb: 'The time blocks on your calendar today', icon: 'calendar_today', tint: 'bg-sky-500/10 text-sky-500', category: 'Live', defaultCol: 'rail', sizes: ['sm', 'md', 'stack'], defaultSize: 'sm' },
  { id: 'pulse', name: 'Pulse', blurb: 'Open, due, and overdue counts at a glance', icon: 'monitoring', tint: 'bg-violet-500/10 text-violet-500', category: 'Live', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  { id: 'continue', name: 'Continue', blurb: 'The documents you touched most recently', icon: 'history', tint: 'bg-accent/10 text-accent', category: 'Live', defaultCol: 'main', sizes: ['md', 'lg'], defaultSize: 'lg' },
  { id: 'activity', name: 'Recent activity', blurb: 'The workspace activity trail from the last week', icon: 'bolt', tint: 'bg-accent/10 text-accent', category: 'Live', defaultCol: 'rail', sizes: ['sm', 'md', 'stack'], defaultSize: 'sm' },
  { id: 'overdue', name: 'Overdue radar', blurb: 'Only the tasks past their due date. Empty is the goal', icon: 'priority_high', tint: 'bg-rose-500/10 text-rose-500', category: 'Live', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  // Navigation
  { id: 'navigator', name: 'Rooms and desks', blurb: 'Browse rooms on the left, their desks open to the right', icon: 'meeting_room', tint: 'bg-sky-500/10 text-sky-500', category: 'Navigation', defaultCol: 'main', sizes: ['lg'], defaultSize: 'lg' },
  { id: 'pinned-desk', name: 'Pinned desk', blurb: 'One desk you care about, one click away', icon: 'push_pin', tint: 'bg-violet-500/10 text-violet-500', category: 'Navigation', multi: true, config: 'desk', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  { id: 'room-portal', name: 'Room portal', blurb: 'A single room and the desks inside it', icon: 'door_open', tint: 'bg-teal-500/10 text-teal-500', category: 'Navigation', multi: true, config: 'room', defaultCol: 'main', sizes: ['md', 'lg'], defaultSize: 'lg' },
  // Absorbed by Shortcuts (2026-08-21): stored quick-links instances migrate
  // to a Shortcuts box with section targets at load.
  { id: 'quick-links', name: 'Quick links', blurb: 'Your own row of shortcuts to the places you use most', icon: 'link', tint: 'bg-indigo-500/10 text-indigo-500', category: 'Navigation', retired: true, defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  { id: 'shortcuts', name: 'Shortcuts', blurb: 'Your own tiles to anywhere: desks, documents, websites, apps', icon: 'link', tint: 'bg-indigo-500/10 text-indigo-500', category: 'Navigation', multi: true, defaultCol: 'rail', sizes: ['sm', 'md', 'lg', 'stack'], defaultSize: 'sm' },
  { id: 'app-launcher', name: 'App launcher', blurb: 'Your favourite connected apps with their real logos', icon: 'apps', tint: 'bg-emerald-500/10 text-emerald-500', category: 'Navigation', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  // Actions
  { id: 'quick', name: 'Quick actions', blurb: 'Create, plan, collaborate, automate', icon: 'bolt', tint: 'bg-emerald-500/10 text-emerald-500', category: 'Actions', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  { id: 'create', name: 'Create new', blurb: 'Start a document, spreadsheet, deck, or desk in one tap', icon: 'add_circle', tint: 'bg-accent/10 text-accent', category: 'Actions', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  { id: 'focus-timer', name: 'Focus timer', blurb: 'Start and stop the five minute promise from home', icon: 'timer', tint: 'bg-violet-500/10 text-violet-500', category: 'Actions', defaultCol: 'rail', sizes: ['sm'], defaultSize: 'sm' },
  // Communication
  { id: 'new-meeting', name: 'New meeting', blurb: 'Start or schedule a PlexiMeet and invite anyone', icon: 'plexii:meet', tint: 'bg-rose-500/10 text-rose-500', category: 'Communication', defaultCol: 'rail', sizes: ['sm'], defaultSize: 'sm' },
  { id: 'pinned-conversation', name: 'Pinned conversation', blurb: 'One person or chat, unread count and one click away', icon: 'plexii:chat', tint: 'bg-sky-500/10 text-sky-500', category: 'Communication', multi: true, config: 'conversation', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' },
  { id: 'transcribe', name: 'Transcribe', blurb: 'Record and transcribe, then keep it where it belongs', icon: 'plexii:mic', tint: 'bg-violet-500/10 text-violet-500', category: 'Communication', defaultCol: 'rail', sizes: ['sm'], defaultSize: 'sm' },
  // Smart
  { id: 'one-thing', name: 'One thing now', blurb: 'The single most pressing task. No list, just the one', icon: 'target', tint: 'bg-amber-500/10 text-amber-600', category: 'Smart', defaultCol: 'main', sizes: ['md', 'lg'], defaultSize: 'md' },
  { id: 'where-was-i', name: 'Where was I', blurb: 'Your last working context, with one button: Resume', icon: 'undo', tint: 'bg-sky-500/10 text-sky-500', category: 'Smart', defaultCol: 'main', sizes: ['md', 'lg'], defaultSize: 'md' },
  { id: 'stalled', name: 'Stalled desk', blurb: 'The in-progress desk that has waited longest for you', icon: 'hourglass_bottom', tint: 'bg-orange-500/10 text-orange-500', category: 'Smart', defaultCol: 'rail', sizes: ['sm', 'md'], defaultSize: 'sm' }
]

export function widgetDef(id: HomeWidgetId): HomeWidgetDef {
  return HOME_WIDGET_DEFS.find((d) => d.id === id) ?? HOME_WIDGET_DEFS[0]
}

// The route catalog Quick Links composes from. Each id is stable and stored in
// the widget's config; icons and tones mirror the sidebar so the shortcuts
// read as the same destinations.
export interface QuickLinkRoute {
  id: string
  label: string
  icon: string
  tone: string
}
export const QUICK_LINK_ROUTES: QuickLinkRoute[] = [
  { id: 'rooms', label: 'Rooms', icon: 'meeting_room', tone: 'text-sky-500' },
  { id: 'desks', label: 'Desks', icon: 'desk', tone: 'text-teal-500' },
  { id: 'shared', label: 'Shared', icon: 'folder_shared', tone: 'text-fuchsia-500' },
  { id: 'plans', label: 'Plans', icon: 'account_tree', tone: 'text-violet-500' },
  { id: 'tasks', label: 'Tasks', icon: 'checklist', tone: 'text-emerald-500' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar_month', tone: 'text-amber-500' },
  { id: 'documents', label: 'Documents', icon: 'description', tone: 'text-sky-500' },
  { id: 'files', label: 'Files', icon: 'folder', tone: 'text-orange-500' },
  { id: 'vault', label: 'Vault', icon: 'plexii:vault', tone: 'text-rose-500' }
]
