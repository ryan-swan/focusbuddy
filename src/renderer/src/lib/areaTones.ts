// The canonical per-area stroke colours — ONE hue per destination, used by the
// sidebar (expanded rows + collapsed rail), the home Quick Links widget, and
// any surface that references an area by colour (e.g. the Plexii trace's kind
// icons). This mapping is the source of truth: consume it, never fork it.
//
// Values are Tailwind text-* classes because the icons are coloured in the
// stroke itself (brand treatment: no tile behind them). If an area ever needs
// a bg tint, derive it as `bg-<hue>-500/10` from the same hue.

export type AreaId =
  | 'home'
  | 'rooms'
  | 'desks'
  | 'shared'
  | 'plans'
  | 'tasks'
  | 'calendar'
  | 'files'
  | 'vault'
  | 'office'
  | 'people'
  | 'brain'

export const AREA_TONES: Record<AreaId, string> = {
  home: 'text-indigo-500',
  rooms: 'text-sky-500',
  desks: 'text-teal-500',
  shared: 'text-fuchsia-500',
  plans: 'text-violet-500',
  tasks: 'text-emerald-500',
  calendar: 'text-amber-500',
  files: 'text-orange-500',
  vault: 'text-rose-500',
  office: 'text-purple-500',
  people: 'text-pink-500',
  brain: 'text-cyan-500'
}

export function areaTone(id: AreaId): string {
  return AREA_TONES[id]
}
