import { useViewStore } from '../../stores/view'

// The onboarding module registry. Adding a new feature tour is a matter of
// appending an entry here: give it an id, bump-able version, a time estimate,
// and a few short steps. A step can jump to the real surface (`go`) and point at
// a real element (`spotlight` = a data-testid), so a tour teaches on the live
// app instead of showing screenshots. Keep modules SMALL — the operator called
// out ADHD monotony as a real abandonment risk, so every module states how long
// it takes and every step is one glance plus one optional action.

export interface OnboardingStep {
  icon: string
  title: string
  body: string
  // Jump to the surface this step is about (runs on entering the step).
  go?: () => void
  // A data-testid to highlight on screen once we are on the right surface.
  spotlight?: string
  // Override the primary button label (defaults to Next / Done).
  cta?: string
}

export interface OnboardingModule {
  id: string
  version: number
  title: string
  subtitle?: string
  icon: string
  // Shown to set expectations ("~40 sec") so a tour never feels open-ended.
  estSeconds: number
  // 'first-run' is the core flow shown once to a fresh install; 'feature' tours
  // are offered as a login popup when new and are always replayable.
  trigger: 'first-run' | 'feature'
  // 'custom' modules render their own component (the core flow); 'steps' modules
  // are driven by the generic step overlay using `steps` below.
  kind: 'custom' | 'steps'
  steps: OnboardingStep[]
}

const go = (): ReturnType<typeof useViewStore.getState> => useViewStore.getState()

export const ONBOARDING_MODULES: OnboardingModule[] = [
  {
    id: 'core',
    version: 1,
    title: 'Welcome to PlexiDesk',
    subtitle: 'Set up in under a minute',
    icon: 'auto_awesome',
    estSeconds: 60,
    trigger: 'first-run',
    kind: 'custom',
    steps: []
  },
  {
    id: 'rooms-desks',
    version: 1,
    title: 'Rooms, Desks and Plans',
    subtitle: 'How your workspace is organised',
    icon: 'meeting_room',
    estSeconds: 40,
    trigger: 'feature',
    kind: 'steps',
    steps: [
      {
        icon: 'meeting_room',
        title: 'Rooms hold your work',
        body: 'A Room is a place your desks live. Open All rooms to see them as cards, or as a list, board, table or timeline.',
        go: () => go().goRooms(),
        spotlight: 'rooms-index-view'
      },
      {
        icon: 'desk',
        title: 'Desks are your canvases',
        body: 'A Desk is a canvas you fill with notes, files, tables and tools. All desks shows every desk across your rooms.',
        go: () => go().goDesks(),
        spotlight: 'desks-index-view'
      },
      {
        icon: 'account_tree',
        title: 'Plans stay separate',
        body: 'Timelines and milestones live in Plans, independent of your desks. Make any Room a Plan when you want a schedule.',
        go: () => go().goProjects(),
        cta: 'Got it'
      }
    ]
  },
  {
    id: 'office-connect',
    version: 1,
    title: 'Connected office files',
    subtitle: 'Link and embed your documents',
    icon: 'description',
    estSeconds: 45,
    trigger: 'feature',
    kind: 'steps',
    steps: [
      {
        icon: 'table_chart',
        title: 'Reference files in a table',
        body: 'Add an "Office file" column to any table, then pick or drag a document into a cell to link it. Click the chip to open it.',
        go: () => go().goDocuments(),
        spotlight: 'documents-view'
      },
      {
        icon: 'description',
        title: 'Embed a doc inside a doc',
        body: 'In a document, type "/" and choose Insert office file to embed another doc, sheet or slides as a live card.',
        cta: 'Got it'
      },
      {
        icon: 'folder',
        title: 'Everything says where it is filed',
        body: 'Open any office file and the header shows where it lives, with one-click filing if it is not filed yet.',
        cta: 'Done'
      }
    ]
  }
]

export function moduleById(id: string): OnboardingModule | undefined {
  return ONBOARDING_MODULES.find((m) => m.id === id)
}

export function featureModules(): OnboardingModule[] {
  return ONBOARDING_MODULES.filter((m) => m.trigger === 'feature')
}
