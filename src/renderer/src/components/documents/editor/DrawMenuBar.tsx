import { useState } from 'react'
import { openDocHistory } from '../DocHistoryPanel'
import { promptText } from '../../plexi/PromptDialog'
import type { MapShape } from '@shared/types'
import { useDocumentsStore } from '../../../stores/documents'
import { useViewStore } from '../../../stores/view'
import { launchMeeting } from '../../../lib/startMeeting'
import { MenuBarShell, MenuModal, type MenuDef } from './menuBarKit'

// A menu bar for PlexiDraw (the diagram / mind-map canvas). Draw is a lightweight
// React-Flow surface: you add shape nodes, connect them, and fit the view. It has
// no undo history or file export of its own, so this menu bar deliberately does
// NOT show Edit/Download/Format — only the actions the canvas can really do, plus
// the document-level File actions.

export interface DrawMenuActions {
  shapes: { shape: MapShape; label: string }[]
  addNode: (shape: MapShape) => void
  fitView: () => void
}

export default function DrawMenuBar({ actions }: { actions: DrawMenuActions }): JSX.Element {
  const a = actions
  const createBlank = useDocumentsStore((s) => s.createBlank)
  const active = useDocumentsStore((s) => s.active)
  const rename = useDocumentsStore((s) => s.rename)
  const remove = useDocumentsStore((s) => s.remove)
  const goDocument = useViewStore((s) => s.goDocument)
  const goDocuments = useViewStore((s) => s.goDocuments)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const title = active?.title ?? 'Untitled drawing'

  async function newDrawing(): Promise<void> {
    const doc = await createBlank('map')
    goDocument(doc.id)
  }
  async function makeCopy(): Promise<void> {
    const copy = await window.api.documents.create({
      docType: 'map',
      title: `Copy of ${title}`,
      body: active?.body
    })
    goDocument(copy.id)
  }
  async function doRename(): Promise<void> {
    const next = await promptText({ title: 'Rename drawing', initial: title, confirmLabel: 'Rename' })
    if (next != null && next.trim()) void rename(next.trim())
  }
  async function moveToTrash(): Promise<void> {
    if (!active) return
    if (!window.confirm(`Move "${title}" to trash?`)) return
    await remove(active.id)
    goDocuments()
  }

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      build: () => [
        { kind: 'item', label: 'New drawing', icon: 'note_add', run: () => void newDrawing() },
        { kind: 'item', label: 'Make a copy', icon: 'file_copy', run: () => void makeCopy() },
        { kind: 'sep' },
        { kind: 'item', label: 'Rename', icon: 'edit', run: doRename },
        { kind: 'item', label: 'Version history', icon: 'history', run: () => { if (active) openDocHistory(active.id) } },
        { kind: 'item', label: 'Move to trash', icon: 'delete', run: () => void moveToTrash() }
      ]
    },
    {
      id: 'insert',
      label: 'Insert',
      build: () => [
        ...a.shapes.map((s) => ({ kind: 'item' as const, label: s.label, run: () => a.addNode(s.shape) })),
        { kind: 'sep' as const },
        { kind: 'item' as const, label: 'Meeting', icon: 'videocam', run: () => void launchMeeting({ kind: 'draw', id: active?.id ?? '', title: title || 'Drawing meeting' }) }
      ]
    },
    {
      id: 'view',
      label: 'View',
      build: () => [{ kind: 'item', label: 'Fit to view', icon: 'fit_screen', run: a.fitView }]
    },
    {
      id: 'help',
      label: 'Help',
      build: () => [{ kind: 'item', label: 'How to draw', icon: 'help', run: () => setShortcutsOpen(true) }]
    }
  ]

  return (
    <>
      <MenuBarShell menus={menus} testid="draw-menubar" />
      {shortcutsOpen && (
        <MenuModal title="How to draw" onClose={() => setShortcutsOpen(false)}>
          <ul className="space-y-1.5 text-[13px] text-stone-600 dark:text-stone-300 list-disc pl-4">
            <li>Add a shape from the Insert menu or the toolbar.</li>
            <li>Double-click a node to rename it.</li>
            <li>Drag from a node&apos;s dot to connect it to another.</li>
            <li>Double-click a connector to label it.</li>
            <li>Press Delete or Backspace to remove the selection.</li>
          </ul>
        </MenuModal>
      )}
    </>
  )
}
