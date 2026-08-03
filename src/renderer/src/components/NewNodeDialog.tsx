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
import { fieldInputClass, FieldLabel, FormField } from './plexi/forms'

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

  const dialogTitle = `${isEdit ? 'Edit' : 'New'} ${effectiveKind === 'folder' ? 'Room' : 'Desk'}${
    isEdit || parentId ? '' : ' (top level)'
  }`
  const submitLabel = isEdit ? 'Save changes' : 'Create'
  const submitIcon = isEdit ? 'save' : 'check'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_oklab,var(--ink-100)_40%,transparent)] backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        className="fb-glass-pillow rounded-xl w-full max-w-xl mx-4 overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-[var(--edge-soft)] flex items-center gap-2 shrink-0">
          <Icon
            name={
              isEdit
                ? 'edit'
                : effectiveKind === 'folder'
                  ? 'create_new_folder'
                  : 'add_task'
            }
            size={20}
            className="text-[var(--ink-70)]"
          />
          <h3 className="text-base font-semibold text-[var(--ink-100)]">
            {dialogTitle}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {!isEdit && effectiveKind === 'task' && existingTasks.length > 0 && (
            <div ref={jumpRef}>
              <FieldLabel className="flex items-center gap-1.5">
                <Icon name="bolt" size={12} />
                Jump to an existing Desk
                <span className="normal-case text-[var(--ink-40)]">or fill in a new one below</span>
              </FieldLabel>
              <input
                value={jumpQuery}
                onChange={(e) => setJumpQuery(e.target.value)}
                placeholder="Search your Desks…"
                className={fieldInputClass()}
              />
              {jumpQuery.trim() && (
                <div className="mt-1 max-h-44 overflow-auto rounded-md border border-[var(--edge-soft)]">
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
                          className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]"
                        >
                          <span className="truncate">{t.title || '(untitled Desk)'}</span>
                          {folder && (
                            <span className="text-[10px] text-[var(--ink-50)] shrink-0 truncate max-w-[140px]">
                              {folder.title}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  {existingTasks.filter((t) =>
                    (t.title || '').toLowerCase().includes(jumpQuery.trim().toLowerCase())
                  ).length === 0 && (
                    <div className="px-3 py-1.5 text-[11px] text-[var(--ink-50)]">No Desks match.</div>
                  )}
                </div>
              )}
            </div>
          )}
          <FormField label={effectiveKind === 'folder' ? 'Room name' : 'Desk title'}>
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
              className={fieldInputClass()}
            />
          </FormField>

          <FormField label="Notes" hint="(optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything to remember about this…"
              className={`${fieldInputClass()} resize-none`}
            />
          </FormField>

          {effectiveKind === 'task' && !isEdit && (
            <div>
              <FieldLabel>Room</FieldLabel>
              {!folderPickerOpen ? (
                <button
                  type="button"
                  onClick={() => setFolderPickerOpen(true)}
                  className={`${fieldInputClass()} flex items-center justify-between gap-2 text-left hover:border-[var(--edge-firm)]`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <Icon name="folder" size={14} className="text-[var(--ink-50)]" />
                    {destParent === NEW_FOLDER
                      ? newFolderName.trim() || 'New Room…'
                      : destParent
                        ? folders.find((f) => f.id === destParent)?.title || '(Room)'
                        : 'Top level (no Room)'}
                  </span>
                  <span className="text-[11px] text-[var(--ink-50)] shrink-0">Change</span>
                </button>
              ) : (
                <div className="rounded-md border border-[var(--edge-soft)] overflow-hidden">
                  <input
                    autoFocus
                    value={folderQuery}
                    onChange={(e) => setFolderQuery(e.target.value)}
                    placeholder="Search Rooms…"
                    className="w-full bg-[var(--surface-sunken)] border-b border-[var(--edge-soft)] px-3 py-2 text-sm text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none"
                  />
                  <div className="max-h-40 overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setDestParent(null)
                        setFolderPickerOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]"
                    >
                      Top level (no Room)
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
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-sunken)] ${
                            destParent === f.id
                              ? 'text-accent bg-accent/[0.06]'
                              : 'text-[var(--ink-90)]'
                          }`}
                        >
                          {f.title || '(untitled Room)'}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => {
                        setDestParent(NEW_FOLDER)
                        if (folderQuery.trim()) setNewFolderName(folderQuery.trim())
                        setFolderPickerOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-accent border-t border-[var(--edge-soft)] hover:bg-accent/5"
                    >
                      + Create new Room{folderQuery.trim() ? ` "${folderQuery.trim()}"` : '…'}
                    </button>
                  </div>
                </div>
              )}
              {destParent === NEW_FOLDER && !folderPickerOpen && (
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New Room name"
                  className={`${fieldInputClass()} mt-1.5`}
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
                <FormField label="Duration" hint="(minutes)">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={estimateMinutes}
                    onChange={(e) => setEstimateMinutes(e.target.value)}
                    placeholder="e.g. 30"
                    className={fieldInputClass()}
                  />
                </FormField>
                <FormField label="Due date" hint="(optional)">
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`${fieldInputClass()} flex-1 [color-scheme:light] dark:[color-scheme:dark]`}
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
                </FormField>
              </div>

              {velocity && (
                <div className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-[var(--ink-90)] flex items-start gap-1.5">
                  <Icon name="insights" size={13} className="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div>
                      <strong>Your history:</strong>{' '}
                      {Math.round(velocity.ratio * 100)}% of estimates
                      <span className="text-[var(--ink-50)]"> (n={velocity.sampleCount})</span>
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
                        Median Desk takes{' '}
                        <strong>{Math.round(velocity.medianActualMin)} min</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isEdit && (
                <div>
                  <FieldLabel>
                    Start from a template <span className="normal-case text-[var(--ink-40)]">(optional)</span>
                  </FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedTemplate(null)}
                      className={`chip-btn ${
                        !selectedTemplate
                          ? 'border-[var(--ink-100)] bg-[var(--ink-100)] text-[var(--surface-raised)]'
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
                              ? 'border-[var(--ink-100)] bg-[var(--ink-100)] text-[var(--surface-raised)]'
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
                    <div className="mt-1.5 text-[11px] text-[var(--ink-50)]">
                      {selectedTemplate.description || `${selectedTemplate.widgets.length} widgets`}
                    </div>
                  )}
                </div>
              )}

              {!isEdit && !selectedTemplate && recentPages.length > 0 && (
                <div>
                  <FieldLabel className="flex items-center gap-1.5">
                    <Icon name="history" size={12} />
                    Recent pages
                    <span className="normal-case text-[var(--ink-40)]">click to add</span>
                  </FieldLabel>
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
                            <span className="text-[9px] text-[var(--ink-40)] font-mono shrink-0">
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
                <FormField
                  label="Tools & tabs"
                  hint="(one per line, URLs become browser windows, plain text becomes stickies)"
                >
                  {/* The important text-xs keeps this textarea at its original
                      mono 12px; fieldInputClass carries text-sm by default. */}
                  <textarea
                    value={toolsInput}
                    onChange={(e) => setToolsInput(e.target.value)}
                    rows={3}
                    placeholder={'https://docs.google.com/...\nhttps://github.com/...\nRemember: due Friday'}
                    className={`${fieldInputClass()} !text-xs font-mono resize-none`}
                  />
                </FormField>
              )}

              {/* AI Setup integration — gated by the ai_task_setup capability.
                  On Free it renders locked + opens the upgrade prompt. */}
              {onRequestAISetup && !aiSetupEnabled && (
                <button
                  type="button"
                  onClick={() => promptUpgrade('AI task setup is a Pro feature.')}
                  className="w-full rounded-md border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-3 py-2.5 text-left"
                  data-testid="ai-setup-locked"
                >
                  <div className="text-xs font-medium text-[var(--ink-70)] flex items-center gap-1.5">
                    <Icon name="lock" size={13} className="text-accent" />
                    Have AI suggest the setup
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-accent">Pro</span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-50)] mt-0.5">
                    Upgrade to let the assistant propose widgets, browsers and notes for this Desk.
                  </div>
                </button>
              )}
              {onRequestAISetup && aiSetupEnabled && (
                <div className="rounded-md border border-violet-500/20 bg-violet-500/10 px-3 py-2.5">
                  {!isEdit ? (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSuggestAI}
                        onChange={(e) => setAutoSuggestAI(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-violet-600 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-medium text-[var(--ink-100)] flex items-center gap-1.5">
                          <Icon name="auto_awesome" size={14} className="text-violet-600 dark:text-violet-400" />
                          Have AI suggest the setup
                        </div>
                        <div className="text-[11px] text-[var(--ink-70)] mt-0.5">
                          After creating, the assistant will propose widgets, browsers and notes that fit this Desk.
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

        <div className="px-5 py-3 border-t border-[var(--edge-soft)] bg-[var(--surface-sunken)] flex justify-end gap-2 shrink-0">
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
