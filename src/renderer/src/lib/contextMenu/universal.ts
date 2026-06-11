// Universal-section providers. AI Assist lives in aiAssist.ts; this file builds
// Create, Convert, Organise, Share, Advanced, and Destructive. Each returns the
// contributions for its section given the context, or an empty array when the
// section does not apply, so the resolver can collapse empty sections to
// nothing rather than show a greyed parent.

import type { WidgetKind } from '@shared/types'
import { MenuSection, type MenuContribution, type MenuContext } from './types'
import { CREATE_AND_CONNECT_MENU } from '../createConnectedTool'
import {
  createWidget,
  convertWidget,
  bringToFront,
  ejectFromSection,
  copyText,
  duplicateWidget,
  archiveWidget,
  deleteWidget,
  sourceWidget,
  workingText
} from './actions'

// Kinds the Convert / Turn-into menu offers. Only kinds that actually exist as
// widgets, gated per the critic: no Calendar event, no Desk, until those
// receiving surfaces exist.
const CONVERT_TARGETS: Array<{ kind: WidgetKind; label: string; icon: string }> = [
  { kind: 'sticky', label: 'Sticky', icon: 'sticky_note_2' },
  { kind: 'note', label: 'Note', icon: 'description' },
  { kind: 'markdown', label: 'Markdown', icon: 'subject' },
  { kind: 'page', label: 'Page', icon: 'article' },
  { kind: 'table', label: 'Table', icon: 'table_chart' },
  { kind: 'mindmap', label: 'Mind map', icon: 'account_tree' },
  { kind: 'diagram', label: 'Diagram', icon: 'schema' }
]

const seedText = (ctx: MenuContext): string => workingText(ctx).text

export function buildCreate(ctx: MenuContext): MenuContribution[] {
  const seed = seedText(ctx)
  return [
    {
      id: 'core/create',
      section: MenuSection.Create,
      priority: 0,
      label: 'Create',
      icon: 'add',
      children: CREATE_AND_CONNECT_MENU.map<MenuContribution>((entry) => ({
        id: `core/create/${entry.kind}`,
        section: MenuSection.Create,
        priority: 0,
        label: entry.label,
        icon: entry.icon,
        onSelect: (c) => createWidget(c, entry.kind, entry.seedContent ?? seed)
      }))
    }
  ]
}

// Convert only makes sense from an existing object with content to reinterpret.
export function buildConvert(ctx: MenuContext): MenuContribution[] {
  if (ctx.object.type === 'empty-canvas') return []
  const src = sourceWidget(ctx)
  return [
    {
      id: 'core/convert',
      section: MenuSection.Convert,
      priority: 0,
      label: 'Convert',
      icon: 'sync_alt',
      children: CONVERT_TARGETS.filter((t) => t.kind !== src?.kind).map<MenuContribution>((t) => ({
        id: `core/convert/${t.kind}`,
        section: MenuSection.Convert,
        priority: 0,
        label: t.label,
        icon: t.icon,
        onSelect: (c) => convertWidget(c, t.kind)
      }))
    }
  ]
}

export function buildOrganise(ctx: MenuContext): MenuContribution[] {
  if (ctx.object.type === 'multi') {
    return [
      {
        id: 'core/organise/front-many',
        section: MenuSection.Organise,
        priority: 0,
        label: 'Bring all to front',
        icon: 'flip_to_front',
        onSelect: (c) => bringToFront(c)
      }
    ]
  }
  if (ctx.object.type !== 'widget') return []
  const w = ctx.object.widget
  const out: MenuContribution[] = [
    {
      id: 'core/organise/front',
      section: MenuSection.Organise,
      priority: 0,
      label: 'Bring to front',
      icon: 'flip_to_front',
      onSelect: (c) => bringToFront(c)
    }
  ]
  if (w.parentSectionId) {
    out.push({
      id: 'core/organise/eject',
      section: MenuSection.Organise,
      priority: 1,
      label: 'Remove from section',
      icon: 'logout',
      onSelect: (c) => ejectFromSection(c)
    })
  }
  return out
}

export function buildShare(ctx: MenuContext): MenuContribution[] {
  const multiHasText =
    ctx.object.type === 'multi' && ctx.object.widgets.some((w) => w.content.trim())
  if (!multiHasText && !workingText(ctx).text.trim()) return []
  return [
    {
      id: 'core/share/copy',
      section: MenuSection.Share,
      priority: 0,
      label: ctx.object.type === 'multi' ? 'Copy all text' : 'Copy text',
      icon: 'content_copy',
      shortcut: '⌘C',
      onSelect: (c) => copyText(c)
    }
  ]
}

export function buildAdvanced(ctx: MenuContext): MenuContribution[] {
  if (ctx.object.type !== 'widget') return []
  return [
    {
      id: 'core/advanced/duplicate',
      section: MenuSection.Advanced,
      priority: 0,
      label: 'Duplicate',
      icon: 'content_copy',
      onSelect: (c) => duplicateWidget(c)
    }
  ]
}

export function buildDestructive(ctx: MenuContext): MenuContribution[] {
  if (ctx.object.type === 'empty-canvas') return []
  if (ctx.object.type === 'multi') {
    const n = ctx.object.widgets.length
    return [
      {
        id: 'core/destructive/delete-many',
        section: MenuSection.Destructive,
        priority: 1,
        label: `Delete ${n} widgets`,
        icon: 'delete',
        danger: true,
        onSelect: (c) => deleteWidget(c)
      }
    ]
  }
  return [
    {
      id: 'core/destructive/archive',
      section: MenuSection.Destructive,
      priority: 0,
      label: 'Archive',
      icon: 'archive',
      danger: true,
      onSelect: (c) => archiveWidget(c)
    },
    {
      id: 'core/destructive/delete',
      section: MenuSection.Destructive,
      priority: 1,
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onSelect: (c) => deleteWidget(c)
    }
  ]
}
