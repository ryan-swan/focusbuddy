// Shared template-apply logic. This is the single implementation that spawns a
// template's saved widgets onto the currently-active task's canvas. It was
// previously inlined in the Sidebar's Templates section; that section has moved
// into Settings, so the logic lives here and both the (now removed) sidebar and
// the Settings Templates section call the same code path rather than each
// carrying their own copy.

import type { Template } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useTemplateStore } from '../stores/templates'
import { STARTER_TEMPLATES } from './starterTemplates'
import { chimeIn } from './audioBeep'

export interface ApplyTemplateResult {
  ok: boolean
  // Reason is set when ok is false so the caller can show an honest message
  // instead of failing silently.
  reason?: 'no-active-task' | 'template-not-found'
}

// Apply a template by id to the active task. Returns a result so the caller can
// react (for example, prompt the user to open a task first) rather than the
// function popping its own dialog. Behaviour otherwise matches the original
// sidebar path exactly: look up the template among the user's saved templates
// first, then the built-in starters; spawn each widget at its stored position;
// bump the layout version and play the chime.
export async function applyTemplateToActiveTask(
  templateId: string
): Promise<ApplyTemplateResult> {
  const activeTaskId = useNodeStore.getState().activeTaskId
  if (!activeTaskId) {
    return { ok: false, reason: 'no-active-task' }
  }
  const templates = useTemplateStore.getState().templates
  const tpl =
    templates.find((t) => t.id === templateId) ??
    STARTER_TEMPLATES.find((t) => t.id === templateId)
  if (!tpl) {
    return { ok: false, reason: 'template-not-found' }
  }
  const createWidget = useWidgetStore.getState().create
  const bumpLayout = useWidgetStore.getState().bumpLayoutVersion
  // Spawn each widget at its stored position. The template was saved from a
  // real task layout, so the relative coordinates already make sense as a
  // group.
  for (const w of tpl.widgets) {
    await createWidget({
      taskId: activeTaskId,
      kind: w.kind,
      title: w.title,
      content: w.content,
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
      color: w.color
    })
  }
  bumpLayout()
  chimeIn()
  return { ok: true }
}

// True when there is an active task to receive a template. The Settings
// Templates section uses this to decide whether applying is possible right now.
export function hasActiveTaskForTemplate(): boolean {
  return useNodeStore.getState().activeTaskId != null
}

// The full set of templates the user can apply: user-saved first, then the
// built-in starters. Real data only, no placeholders.
export function listApplicableTemplates(): Template[] {
  const templates = useTemplateStore.getState().templates
  return [...templates, ...STARTER_TEMPLATES]
}
