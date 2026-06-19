import { useEffect, useMemo, useRef, useState } from 'react'
import type { AxisValue, BrowsingHistoryEntry, FbNode, NodeKind, Template } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useCapabilityEnabled } from '../stores/capabilities'
import { promptUpgrade } from '../stores/upgradePrompt'
import { useWidgetStore } from '../stores/widgets'
import { useTemplateStore } from '../stores/templates'
import { computeVelocity, predictForEstimate } from '../lib/velocityStats'
import { STARTER_TEMPLATES } from '../lib/starterTemplates'
import AxisPicker from './AxisPicker'
import Icon from './Icon'

interface Props {
  // Create mode: pass parentId + kind. Edit mode: pass node.
  parentId?: string | null
  kind?: NodeKind
  node?: FbNode | null
  onClose: () => void
  // When provided, parent renders the AI Setup dialog for the given task after this dialog closes.
  onRequestAISetup?: (task: FbNode) => void
}

function toDateInputValue(ms: number | null | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromDateInputValue(s: string): number | null {
  if (!s) return null
  // Interpret the date as end-of-day local time so "due 2026-05-25" doesn't pass at midnight.
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 23, 59, 59).getTime()
}

export default function NewNodeDialog({
  parentId: parentIdProp,
  kind: kindProp,
  node,
  onClose,
  onRequestAISetup
}: Props): JSX.Element {
  const isEdit = !!node
  const effectiveKind: NodeKind = node ? node.kind : kindProp ?? 'task'
  const parentId = node ? node.parentId : parentIdProp ?? null

  const create = useNodeStore((s) => s.create)
  const aiSetupEnabled = useCapabilityEnabled('ai_task_setup')
  const updateNode = useNodeStore((s) => s.update)
  const setActive = useNodeStore((s) => s.setActive)
  const allNodes = useNodeStore((s) => s.nodes)
  const createWidget = useWidgetStore((s) => s.create)
  const templates = useTemplateStore((s) => s.templates)
  const refreshTemplates = useTemplateStore((s) => s.refresh)
  const velocity = useMemo(() => computeVelocity(allNodes), [allNodes])

  // Folders the new task can live in, and existing tasks the user might want to
  // jump to instead of creating a new one. Both drive the destination controls
  // we add below for the "+add" flow.
  const folders = useMemo(() => allNodes.filter((n) => n.kind === 'folder' && !n.archived), [allNodes])
  const existingTasks = useMemo(
    () => allNodes.filter((n) => n.kind === 'task' && !n.archived),
    [allNodes]
  )
  const NEW_FOLDER = '__new_folder__'
  // Where the new task lands. Defaults to the parent we were opened with; for a
  // top-level "+add" (parentId null) we default to the first folder if one
  // exists so a stray task does not get orphaned at the root.
  const [destParent, setDestParent] = useState<string | null>(() => {
    if (parentId && allNodes.some((n) => n.id === parentId && n.kind === 'folder')) return parentId
    return null
  })
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [folderQuery, setFolderQuery] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  // Quick-jump: search existing tasks and switch to one for fast navigation,
  // instead of creating a new task at all.
  const [jumpQuery, setJumpQuery] = useState('')
  const jumpRef = useRef<HTMLDivElement | null>(null)

  const [title, setTitle] = useState(node?.title ?? '')
  const [description, setDescription] = useState(node?.description ?? '')
  const [priority, setPriority] = useState<AxisValue>(node?.priority ?? 3)
  // Interest is no longer surfaced in the UI (two-axis model — see POSITIONING.md §11.5),
  // but we still write it to the DB so existing tasks aren't disrupted. Defaulted to 3
  // for new tasks; preserved from existing tasks on edit.
  const interest = node?.interest ?? 3
  const [importance, setImportance] = useState<AxisValue>(node?.importance ?? 3)
  const [estimateMinutes, setEstimateMinutes] = useState<string>(
    node?.estimateMinutes != null ? String(node.estimateMinutes) : ''
  )
  const [dueDate, setDueDate] = useState<string>(toDateInputValue(node?.dueDate))
  const [toolsInput, setToolsInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [autoSuggestAI, setAutoSuggestAI] = useState(false)
  const [recentPages, setRecentPages] = useState<BrowsingHistoryEntry[]>([])
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (effectiveKind === 'task' && !isEdit) void refreshTemplates()
  }, [effectiveKind, isEdit, refreshTemplates])

  useEffect(() => {
    if (effectiveKind !== 'task' || isEdit) return
    let cancelled = false
    void (async () => {
      const entries = await window.api.history.recent(10, null)
      if (!cancelled) setRecentPages(entries)
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveKind, isEdit])

  function appendRecentPage(entry: BrowsingHistoryEntry): void {
    if (addedUrls.has(entry.url)) return
    setToolsInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n${entry.url}` : entry.url))
    setAddedUrls((prev) => new Set(prev).add(entry.url))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const estimate = estimateMinutes.trim() === '' ? null : parseInt(estimateMinutes, 10)
      const dueDateMs = effectiveKind === 'task' ? fromDateInputValue(dueDate) : null

      if (isEdit && node) {
        await updateNode(node.id, {
          title: title.trim(),
          description: description.trim(),
          priority,
          interest,
          importance,
          estimateMinutes:
            effectiveKind === 'task' && typeof estimate === 'number' && !isNaN(estimate) && estimate > 0
              ? estimate
              : null,
          dueDate: dueDateMs
        })
        onClose()
        return
      }

      // Resolve where a new task lands. Folders keep the parent they were
      // opened with; a task uses the destination the user picked, creating a
      // new folder first when they asked for one.
      let resolvedParent = parentId
      if (effectiveKind === 'task') {
        if (destParent === NEW_FOLDER) {
          const name = newFolderName.trim()
          if (!name) {
            setBusy(false)
            // Reopen the picker so the missing name is obvious.
            setFolderPickerOpen(true)
            return
          }
          const folder = await create({
            parentId: null,
            kind: 'folder',
            title: name
          } as Parameters<typeof create>[0])
          resolvedParent = folder.id
        } else {
          resolvedParent = destParent
        }
      }

      const created = await create({
        parentId: resolvedParent,
        kind: effectiveKind,
        title: title.trim(),
        description: description.trim(),
        priority,
        interest,
        importance,
        estimateMinutes:
          effectiveKind === 'task' && typeof estimate === 'number' && !isNaN(estimate) && estimate > 0
            ? estimate
            : null,
        dueDate: dueDateMs
      })
      if (effectiveKind === 'task') {
        if (selectedTemplate) {
          for (const w of selectedTemplate.widgets) {
            await createWidget({
              taskId: created.id,
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
        } else {
          const lines = toolsInput
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
          let x = 60
          let y = 60
          for (const line of lines) {
            const isUrl = /^https?:\/\//i.test(line)
            await createWidget({
              taskId: created.id,
              kind: isUrl ? 'webview' : 'sticky',
              title: isUrl ? new URL(line).hostname.replace(/^www\./, '') : '',
              content: line,
              x,
              y,
              color: isUrl ? null : '#fef08a'
            })
            x += isUrl ? 60 : 40
            y += isUrl ? 40 : 30
          }
        }
        setActive(created.id)
        if (autoSuggestAI && onRequestAISetup) {
          // Close this dialog and hand off to parent so the AI Setup modal opens cleanly.
          onClose()
          onRequestAISetup(created)
          return
        }
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const dialogTitle = `${isEdit ? 'Edit' : 'New'} ${effectiveKind === 'folder' ? 'project' : 'task'}${
    isEdit || parentId ? '' : ' (top level)'
  }`
  const submitLabel = isEdit ? 'Save changes' : 'Create'
  const submitIcon = isEdit ? 'save' : 'check'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-stone-900 w-full max-w-xl mx-4 rounded-lg shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700 flex items-center gap-2 shrink-0">
          <Icon
            name={
              isEdit
                ? 'edit'
                : effectiveKind === 'folder'
                  ? 'create_new_folder'
                  : 'add_task'
            }
            size={20}
            className="text-stone-600 dark:text-stone-300"
          />
          <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            {dialogTitle}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {!isEdit && effectiveKind === 'task' && existingTasks.length > 0 && (
            <div ref={jumpRef}>
              <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5 flex items-center gap-1.5">
                <Icon name="bolt" size={12} />
                Jump to an existing task
                <span className="normal-case text-stone-400">— or fill in a new one below</span>
              </label>
              <input
                value={jumpQuery}
                onChange={(e) => setJumpQuery(e.target.value)}
                placeholder="Search your tasks…"
                className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
              />
              {jumpQuery.trim() && (
                <div className="mt-1 max-h-44 overflow-auto rounded-md border border-stone-200 dark:border-stone-700">
                  {existingTasks
                    .filter((t) =>
                      (t.title || '').toLowerCase().includes(jumpQuery.trim().toLowerCase())
                    )
                    .slice(0, 30)
                    .map((t) => {
                      const folder = allNodes.find((n) => n.id === t.parentId)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setActive(t.id)
                            onClose()
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800"
                        >
                          <span className="truncate">{t.title || '(untitled task)'}</span>
                          {folder && (
                            <span className="text-[10px] text-stone-400 shrink-0 truncate max-w-[140px]">
                              {folder.title}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  {existingTasks.filter((t) =>
                    (t.title || '').toLowerCase().includes(jumpQuery.trim().toLowerCase())
                  ).length === 0 && (
                    <div className="px-3 py-1.5 text-[11px] text-stone-400">No tasks match.</div>
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
              {effectiveKind === 'folder' ? 'Project name' : 'Task title'}
            </label>
            <input
              autoFocus
              data-testid="newnode-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                effectiveKind === 'folder'
                  ? 'e.g. Client X, Marketing, Q3 plans…'
                  : 'What needs to happen?'
              }
              className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
              Notes <span className="normal-case text-stone-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything to remember about this…"
              className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 resize-none"
            />
          </div>

          {effectiveKind === 'task' && !isEdit && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
                Folder
              </label>
              {!folderPickerOpen ? (
                <button
                  type="button"
                  onClick={() => setFolderPickerOpen(true)}
                  className="w-full flex items-center justify-between gap-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-800 dark:text-stone-100 hover:border-stone-400"
                >
                  <span className="truncate flex items-center gap-1.5">
                    <Icon name="folder" size={14} className="text-stone-400" />
                    {destParent === NEW_FOLDER
                      ? newFolderName.trim() || 'New folder…'
                      : destParent
                        ? folders.find((f) => f.id === destParent)?.title || '(folder)'
                        : 'Top level (no folder)'}
                  </span>
                  <span className="text-[11px] text-stone-400 shrink-0">Change</span>
                </button>
              ) : (
                <div className="rounded-md border border-stone-200 dark:border-stone-700 overflow-hidden">
                  <input
                    autoFocus
                    value={folderQuery}
                    onChange={(e) => setFolderQuery(e.target.value)}
                    placeholder="Search folders…"
                    className="w-full bg-white dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                  <div className="max-h-40 overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setDestParent(null)
                        setFolderPickerOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      Top level (no folder)
                    </button>
                    {folders
                      .filter((f) =>
                        (f.title || '').toLowerCase().includes(folderQuery.trim().toLowerCase())
                      )
                      .map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setDestParent(f.id)
                            setFolderPickerOpen(false)
                          }}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 ${
                            destParent === f.id
                              ? 'text-accent bg-accent/[0.06]'
                              : 'text-stone-800 dark:text-stone-100'
                          }`}
                        >
                          {f.title || '(untitled folder)'}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => {
                        setDestParent(NEW_FOLDER)
                        if (folderQuery.trim()) setNewFolderName(folderQuery.trim())
                        setFolderPickerOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-accent border-t border-stone-200 dark:border-stone-700 hover:bg-accent/5"
                    >
                      + Create new folder{folderQuery.trim() ? ` "${folderQuery.trim()}"` : '…'}
                    </button>
                  </div>
                </div>
              )}
              {destParent === NEW_FOLDER && !folderPickerOpen && (
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  className="mt-1.5 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          {effectiveKind === 'task' && (
            <>
              {/* Two-axis model: Interest dropped from UI (see POSITIONING.md §11.5).
                  The state + DB field stay defaulted to 3 so existing tasks aren't disrupted. */}
              <div className="grid grid-cols-2 gap-4">
                <AxisPicker label="Urgency" hint="whenever → urgent" value={priority} onChange={setPriority} />
                <AxisPicker label="Importance" hint="low → high stakes" value={importance} onChange={setImportance} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
                    Duration <span className="normal-case text-stone-400">(minutes)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={estimateMinutes}
                    onChange={(e) => setEstimateMinutes(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
                    Due date <span className="normal-case text-stone-400">(optional)</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="flex-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 [color-scheme:light] dark:[color-scheme:dark]"
                    />
                    {dueDate && (
                      <button
                        type="button"
                        onClick={() => setDueDate('')}
                        className="icon-btn"
                        title="Clear due date"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {velocity && (
                <div className="px-2.5 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-stone-700 dark:text-stone-300 flex items-start gap-1.5">
                  <Icon name="insights" size={13} className="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div>
                      <strong>Your history:</strong>{' '}
                      {Math.round(velocity.ratio * 100)}% of estimates
                      <span className="text-stone-500 dark:text-stone-400"> (n={velocity.sampleCount})</span>
                    </div>
                    {estimateMinutes.trim() !== '' &&
                      parseInt(estimateMinutes, 10) > 0 && (
                        <div className="mt-0.5">
                          Predicted real time:{' '}
                          <strong>
                            {predictForEstimate(velocity, parseInt(estimateMinutes, 10))} min
                          </strong>
                        </div>
                      )}
                    {estimateMinutes.trim() === '' && (
                      <div className="mt-0.5">
                        Median task takes{' '}
                        <strong>{Math.round(velocity.medianActualMin)} min</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isEdit && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
                    Start from a template <span className="normal-case text-stone-400">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedTemplate(null)}
                      className={`chip-btn ${
                        !selectedTemplate
                          ? 'border-stone-900 dark:border-stone-200 bg-stone-900 dark:bg-stone-200 text-stone-50 dark:text-stone-900'
                          : 'chip-active'
                      }`}
                    >
                      <Icon name="add" size={14} />
                      <span>Empty</span>
                    </button>
                    {/* Built-in starters first (always available), then the
                        user's own saved templates. Picking one pre-fills the
                        title if it's still blank. */}
                    {[...STARTER_TEMPLATES, ...templates].map((t) => {
                      const isStarter = t.id.startsWith('starter-')
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTemplate(t)
                            if (!title.trim()) setTitle(t.name)
                          }}
                          title={t.description || `${t.widgets.length} widget(s)`}
                          className={`chip-btn ${
                            selectedTemplate?.id === t.id
                              ? 'border-stone-900 dark:border-stone-200 bg-stone-900 dark:bg-stone-200 text-stone-50 dark:text-stone-900'
                              : 'chip-active'
                          }`}
                        >
                          <Icon name={isStarter ? 'dashboard' : 'layers'} size={14} />
                          <span>{t.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  {selectedTemplate && (
                    <div className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                      {selectedTemplate.description || `${selectedTemplate.widgets.length} widgets`}
                    </div>
                  )}
                </div>
              )}

              {!isEdit && !selectedTemplate && recentPages.length > 0 && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5 flex items-center gap-1.5">
                    <Icon name="history" size={12} />
                    Recent pages
                    <span className="normal-case text-stone-400">— click to add</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {recentPages.map((entry) => {
                      const added = addedUrls.has(entry.url)
                      const label = entry.title || entry.host || entry.url
                      return (
                        <button
                          key={entry.url}
                          type="button"
                          onClick={() => appendRecentPage(entry)}
                          disabled={added}
                          title={`${entry.url}\n${entry.visitCount} visit${entry.visitCount === 1 ? '' : 's'}`}
                          className={`chip-btn max-w-[220px] ${
                            added
                              ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                              : 'chip-active'
                          }`}
                        >
                          <Icon name={added ? 'check' : 'public'} size={12} />
                          <span className="truncate">{label}</span>
                          {!added && entry.visitCount > 1 && (
                            <span className="text-[9px] text-stone-400 dark:text-stone-500 font-mono shrink-0">
                              {entry.visitCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {!isEdit && !selectedTemplate && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium mb-1.5">
                    Tools & tabs <span className="normal-case text-stone-400">(one per line — URLs become browser windows, plain text becomes stickies)</span>
                  </label>
                  <textarea
                    value={toolsInput}
                    onChange={(e) => setToolsInput(e.target.value)}
                    rows={3}
                    placeholder={'https://docs.google.com/...\nhttps://github.com/...\nRemember: due Friday'}
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md px-3 py-2 text-xs font-mono text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 resize-none"
                  />
                </div>
              )}

              {/* AI Setup integration — gated by the ai_task_setup capability.
                  On Free it renders locked + opens the upgrade prompt. */}
              {onRequestAISetup && !aiSetupEnabled && (
                <button
                  type="button"
                  onClick={() => promptUpgrade('AI task setup is a Pro feature.')}
                  className="w-full rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-3 py-2.5 text-left"
                  data-testid="ai-setup-locked"
                >
                  <div className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                    <Icon name="lock" size={13} className="text-accent" />
                    Have AI suggest the setup
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-accent">Pro</span>
                  </div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                    Upgrade to let the assistant propose widgets, browsers and notes for this task.
                  </div>
                </button>
              )}
              {onRequestAISetup && aiSetupEnabled && (
                <div className="rounded-md border border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/20 px-3 py-2.5">
                  {!isEdit ? (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSuggestAI}
                        onChange={(e) => setAutoSuggestAI(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-violet-600 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-medium text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                          <Icon name="auto_awesome" size={14} className="text-violet-600 dark:text-violet-400" />
                          Have AI suggest the setup
                        </div>
                        <div className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5">
                          After creating, the assistant will propose widgets, browsers and notes that fit this task.
                        </div>
                      </div>
                    </label>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!node) return
                        onClose()
                        onRequestAISetup(node)
                      }}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors rounded py-1.5"
                    >
                      <Icon name="auto_awesome" size={14} />
                      <span>Suggest more setup with AI</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!title.trim() || busy} className="btn-primary">
            {busy ? (
              <>
                <Icon name="hourglass_top" size={14} />
                <span>{isEdit ? 'Saving…' : 'Creating…'}</span>
              </>
            ) : (
              <>
                <Icon name={submitIcon} size={14} />
                <span>{submitLabel}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
