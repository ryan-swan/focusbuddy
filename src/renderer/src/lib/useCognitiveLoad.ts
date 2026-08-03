import { useWidgetStore } from '../stores/widgets'

const KIND_WEIGHT: Record<string, number> = {
  webview: 1.5,
  pdf: 1.5,
  gdoc: 1.3,
  gsheet: 1.3,
  gslide: 1.3,
  email: 1.3,
  video: 1.2,
  markdown: 1.1,
  note: 1.0,
  sticky: 0.7,
  timer: 0.6,
  calculator: 0.5,
  color: 0.4,
  image: 0.6,
  section: 0.5
}

export interface LoadTier {
  label: string
  // Tailwind text color class
  textClass: string
  // Tailwind bg class (for fill bars)
  bgClass: string
  // CSS color value for dynamic ring/shadow (not Tailwind — needed for inline styles)
  ringColor: string
  shadowColor: string
  cap: number
}

export const LOAD_TIERS: LoadTier[] = [
  {
    label: 'Light',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-500',
    ringColor: 'rgb(16 185 129)',   // emerald-500
    shadowColor: 'rgba(16,185,129,0.35)',
    cap: 5
  },
  {
    label: 'Comfortable',
    textClass: 'text-sky-600 dark:text-sky-400',
    bgClass: 'bg-sky-500',
    ringColor: 'rgb(14 165 233)',   // sky-500
    shadowColor: 'rgba(14,165,233,0.35)',
    cap: 9
  },
  {
    label: 'Heavy',
    textClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-500',
    ringColor: 'rgb(245 158 11)',   // amber-500
    shadowColor: 'rgba(245,158,11,0.35)',
    cap: 14
  },
  {
    label: 'Overloaded',
    textClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-500',
    ringColor: 'rgb(239 68 68)',    // red-500
    shadowColor: 'rgba(239,68,68,0.40)',
    cap: Infinity
  }
]

export function tierForLoad(load: number): LoadTier {
  for (const t of LOAD_TIERS) if (load <= t.cap) return t
  return LOAD_TIERS[LOAD_TIERS.length - 1]
}

export function useCognitiveLoad(): {
  load: number
  tier: LoadTier
  visible: ReturnType<typeof useWidgetStore.getState>['widgets']
  archived: ReturnType<typeof useWidgetStore.getState>['widgets']
} {
  const widgets = useWidgetStore((s) => s.widgets)
  const visible = widgets.filter((w) => !w.archived)
  const archived = widgets.filter((w) => w.archived)
  const load = visible.reduce((sum, w) => sum + (KIND_WEIGHT[w.kind] ?? 1), 0)
  const tier = tierForLoad(load)
  return { load, tier, visible, archived }
}
