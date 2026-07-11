import type { FbNode, NodeDraft, NodePatch, Widget, WidgetDraft } from '@shared/types'

export type DemoContext = {
  createNode: (draft: NodeDraft) => Promise<FbNode>
  updateNode: (id: string, patch: NodePatch) => Promise<void>
  createWidget: (draft: WidgetDraft) => Promise<Widget>
  updateWidgetContent: (id: string, content: string) => Promise<void>
  setActiveTask: (id: string) => void
  navigate: (deskId: string) => void
  typeInto: (setter: (text: string) => void, text: string, speedMs?: number) => Promise<void>
  delay: (ms: number) => Promise<void>
  deskId: string | null
  setDeskId: (id: string) => void
  isCancelled: () => boolean
}

export type DemoStep = {
  caption: string
  durationMs: number
  action: (ctx: DemoContext) => Promise<void>
}

export type DemoScenario = {
  id: 1 | 2
  title: string
  steps: DemoStep[]
}
