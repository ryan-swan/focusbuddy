import { useState } from 'react'
import { openDocHistory } from '../DocHistoryPanel'
import { confirmDialog, promptText } from '../../plexi/PromptDialog'
import { useDocumentsStore } from '../../../stores/documents'
import { useViewStore } from '../../../stores/view'
import { launchMeeting } from '../../../lib/startMeeting'
import { MenuBarShell, MenuModal, type MenuDef } from './menuBarKit'

// A menu bar for PlexiDesign (the freeform canvas / poster editor). Its menus fit
// what a design canvas does: place text, shapes, lines and images, arrange them,
// remove an image background, and export the artwork as PNG or PDF. Every item is
// wired to a real DesignEditor op or a documents-store action.

export interface DesignMenuActions {
  title: string
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  addText: () => void
  addShape: (shape: 'rect' | 'ellipse' | 'roundRect' | 'triangle') => void
  addLine: () => void
  addImageFromFile: () => void
  addWidget: () => void
  removeBgSelected: () => void
  exportAs: (format: 'png' | 'pdf') => void
}

export default function DesignMenuBar({ actions }: { actions: DesignMenuActions }): JSX.Element {
  const a = actions
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const active = useDocumentsStore((s) => s.active)
  const rename = useDocumentsStore((s) => s.rename)
  const remove = useDocumentsStore((s) => s.remove)
  const goDocument = useViewStore((s) => s.goDocument)
  const goDocuments = useViewStore((s) => s.goDocuments)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  async function newDesign(): Promise<void> {
    const doc = await createBlank('design')
    goDocument(doc.id)
  }
  async function makeCopy(): Promise<void> {
    const copy = await window.api.documents.create({
      docType: 'design',
      title: `Copy of ${a.title || 'Untitled design'}`,
      body: active?.body
    })
    goDocument(copy.id)
  }
  async function doRename(): Promise<void> {
    const next = await promptText({ title: 'Rename design', initial: a.title, confirmLabel: 'Rename' })
    if (next != null && next.trim()) void rename(next.trim())
  }
  async function moveToTrash(): Promise<void> {
    if (!active) return
    const ok = await confirmDialog({
      title: `Move "${a.title || 'Untitled design'}" to trash?`,
      body: 'You can restore it from the Documents trash.',
      confirmLabel: 'Move to trash'
    })
    if (!ok) return
    await remove(active.id)
    goDocuments()
  }

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      build: () => [
        { kind: 'item', label: 'New design', icon: 'note_add', run: () => void newDesign() },
        { kind: 'item', label: 'Make a copy', icon: 'file_copy', run: () => void makeCopy() },
        { kind: 'sep' },
        { kind: 'item', label: 'Rename', icon: 'edit', run: doRename },
        { kind: 'item', label: 'Version history', icon: 'history', run: () => { if (active) openDocHistory(active.id) } },
        {
          kind: 'submenu',
          label: 'Download',
          icon: 'download',
          items: [
            { kind: 'item', label: 'Image (.png)', run: () => a.exportAs('png') },
            { kind: 'item', label: 'PDF document (.pdf)', run: () => a.exportAs('pdf') }
          ]
        },
        { kind: 'sep' },
        { kind: 'item', label: 'Move to trash', icon: 'delete', run: () => void moveToTrash() }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      build: () => [
        { kind: 'item', label: 'Undo', shortcut: '⌘Z', icon: 'undo', run: a.undo },
        { kind: 'item', label: 'Redo', shortcut: '⌘⇧Z', icon: 'redo', run: a.redo },
        { kind: 'sep' },
        { kind: 'item', label: 'Delete selection', shortcut: '⌫', icon: 'delete', run: a.deleteSelected }
      ]
    },
    {
      id: 'insert',
      label: 'Insert',
      build: () => [
        { kind: 'item', label: 'Text', icon: 'title', run: a.addText },
        { kind: 'item', label: 'Image', icon: 'image', run: a.addImageFromFile },
        {
          kind: 'submenu',
          label: 'Shape',
          icon: 'category',
          items: [
            { kind: 'item', label: 'Rectangle', run: () => a.addShape('rect') },
            { kind: 'item', label: 'Rounded rectangle', run: () => a.addShape('roundRect') },
            { kind: 'item', label: 'Ellipse', run: () => a.addShape('ellipse') },
            { kind: 'item', label: 'Triangle', run: () => a.addShape('triangle') }
          ]
        },
        { kind: 'item', label: 'Line', icon: 'horizontal_rule', run: a.addLine },
        { kind: 'item', label: 'Widget from a desk', icon: 'widgets', run: a.addWidget },
        { kind: 'sep' },
        { kind: 'item', label: 'Meeting', icon: 'videocam', run: () => void launchMeeting({ kind: 'design', id: active?.id ?? '', title: a.title || 'Design meeting' }) }
      ]
    },
    {
      id: 'tools',
      label: 'Tools',
      build: () => [{ kind: 'item', label: 'Remove image background', icon: 'auto_awesome', run: a.removeBgSelected }]
    },
    {
      id: 'help',
      label: 'Help',
      build: () => [{ kind: 'item', label: 'Keyboard shortcuts', shortcut: '⌘/', icon: 'keyboard', run: () => setShortcutsOpen(true) }]
    }
  ]

  return (
    <>
      <MenuBarShell menus={menus} testid="design-menubar" />
      {shortcutsOpen && (
        <MenuModal title="Keyboard shortcuts" onClose={() => setShortcutsOpen(false)}>
          <div className="space-y-1.5">
            {([
              ['Undo', '⌘Z'],
              ['Redo', '⌘⇧Z'],
              ['Delete selection', '⌫']
            ] as [string, string][]).map(([label, keys]) => (
              <div key={label} className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--ink-70)]">{label}</span>
                <span className="text-[var(--ink-40)] fb-tabular">{keys}</span>
              </div>
            ))}
          </div>
        </MenuModal>
      )}
    </>
  )
}
