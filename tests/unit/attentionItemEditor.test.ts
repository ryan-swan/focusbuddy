import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// DEC-036 — the item editor, and the row gestures around it.
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8')

describe('DEC-036 — double-click opens the whole item for editing', () => {
  const editor = read('src/renderer/src/components/AttentionItemEditor.tsx')
  const view = read('src/renderer/src/components/views/AttentionView.tsx')

  it('edits every part of the item the operator named', () => {
    expect(editor).toContain('Title')
    expect(editor).toContain('Notes')
    expect(editor).toContain('Classification')
    expect(editor).toContain('CLASS_CHOICES.map')
    expect(editor).toContain("type=\"date\"")
    expect(editor).toContain('Desk')
  })

  it('sends ONLY changed fields — an edit must not restamp what was untouched', () => {
    expect(editor).toContain("if (trimmed !== (item.title ?? '')) patch.title = trimmed")
    expect(editor).toContain('if (cls !== queueOf(item)) patch.intentClass = cls')
    expect(editor).toContain('if (nextDue !== (item.dueAt ?? null)) patch.dueAt = nextDue')
    // Writes go through the one store seam, never a bespoke path.
    expect(editor).toContain('useWorkItemStore')
    expect(editor).toContain('updateFields(item.id, patch)')
    // The desk is a node MOVE, not a work-item field.
    expect(editor).toContain('window.api.nodes.move')
  })

  it('the row opens it on double-click, and only the ACTION cluster is exempt', () => {
    expect(view).toContain('onDoubleClick')
    expect(view).toContain("closest('[data-row-action]')")
    // Guarding on `button` blocked nearly the whole row (title + expander are
    // buttons) — that regression must not come back.
    expect(view).not.toContain("(e.target as HTMLElement).closest('button')) return")
    expect(view).toContain('data-row-action')
  })
})

describe('DEC-035 follow-ups — the drag gestures the operator asked for', () => {
  const view = read('src/renderer/src/components/views/AttentionView.tsx')

  it('drags the WHOLE ROW as its ghost, not a bare handle', () => {
    expect(view).toContain('setDragImage')
    expect(view).toContain("closest(\n                '[data-item-row]'\n              )")
  })

  it('resting on a row means ATTACH (dwell), edges mean place', () => {
    expect(view).toContain('GROUP_DWELL_MS')
    expect(view).toContain("setOver({ id: i.id, pos: 'into' })")
    expect(view).toContain('clearDwell')
  })

  it('a whole SECTION accepts a drop, so moving between classifications is easy to hit', () => {
    expect(view).toContain('moveToSection(q.queue, grouped ?? [])')
    // …and a row drop in another queue reclassifies via the same gesture.
    expect(view).toContain('crossQueue ? targetQueue : undefined')
  })
})

describe('DEC-037 — context at a glance, and the two doors back', () => {
  const view = read('src/renderer/src/components/views/AttentionView.tsx')
  const editor = read('src/renderer/src/components/AttentionItemEditor.tsx')

  it('rows show the desk, the plan, the marked source, urgency and tags', () => {
    expect(view).toContain('itemContext(i, nodesById)')
    expect(view).toContain('urgencyOf(i)')
    expect(view).toContain('parseTags(i.tags)')
    // The plan chip opens the plan; the desk chip opens the desk.
    expect(view).toContain('goProject(ctx.plan!.id)')
    expect(view).toContain('onClick={() => openSource(i)}')
  })

  it('offers BOTH doors: the object itself in Plexi, and the whole desk', () => {
    // Marking a Notion tool and pressing "desk" launched the external Notion
    // app. Focus Mode is the in-Plexi door; the desk button is the other.
    expect(view).toContain('function openHere')
    expect(view).toContain('setFocusedWidget')
    expect(view).toContain('Open it here')
    expect(view).toContain('Open the whole desk it came from')
    // Only offered when there IS a marked object to open.
    expect(view).toContain("i.sourceRef && i.sourceType !== 'note'")
  })

  it('tags filter the queue, and are editable — but never required', () => {
    expect(view).toContain('tagFilter')
    expect(view).toContain('hasTag(i, tagFilter)')
    expect(view).toContain('tagVocabulary(items)')
    expect(editor).toContain('URGENCY_LEVELS.map')
    // DEC-039 upgraded the plain input to the shared TagMentionInput.
    expect(editor).toContain('serializeTags(tagList)')
    expect(editor).toContain('serializeMentions(mentionList)')
  })
})

describe('DEC-040 — notes exist on EVERY capture path, not only the bare console', () => {
  it('the preview card itself carries an editable notes area', () => {
    // The chat inline card and every prefilled console open render the card
    // DIRECTLY — the console's notes stage never appears there, which is
    // where the operator "lost the ability to add a note".
    const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')
    expect(card).toContain('Add notes — context worth keeping with it')
    expect(card).toContain('setNotesEdited(true)')
    // Enter inside the notes makes a NEWLINE, never files the item.
    expect(card).toContain("if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) e.stopPropagation()")
    // Card-typed notes are the operator's words: the tidy must not clobber
    // them, and "Enter as is" keeps them too.
    expect(card).toContain('notesEdited ? prev.notes : p.note || prev.notes')
    expect(card).toContain('(notesEdited ? confirm.notes : ownNotes)')
  })

  it('the bare manual form has notes too (it never did)', () => {
    const view = read('src/renderer/src/components/views/AttentionView.tsx')
    expect(view).toContain("placeholder=\"Notes (optional)\"")
    expect(view).toContain('notes: newNotes.trim() || undefined')
  })
})

describe('DEC-039 — capture-time context + the one input everywhere', () => {
  it('the confirm card carries urgency and tags/mentions on the preview screen', () => {
    const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')
    expect(card).toContain('URGENCY_LEVELS.map')
    expect(card).toContain('TagMentionInput')
    // …and they ride the create, not a follow-up patch.
    expect(card).toContain('serializeTags(capTags)')
    expect(card).toContain('serializeMentions(capMentions)')
    expect(card).toContain("wiUrgency: urgency === 'normal' ? null : urgency")
  })

  it('all three surfaces share ONE input, so the @ grammar cannot fork', () => {
    for (const f of [
      'src/renderer/src/components/AttentionConfirmCard.tsx',
      'src/renderer/src/components/AttentionItemEditor.tsx',
      'src/renderer/src/components/views/AttentionView.tsx'
    ])
      expect(read(f)).toContain('TagMentionInput')
  })

  it('mention chips render on rows; desk/room/plan navigate, person is honest', () => {
    const view = read('src/renderer/src/components/views/AttentionView.tsx')
    expect(view).toContain('parseMentions(i.mentions)')
    expect(view).toContain('goRoom(m.id)')
    expect(view).toContain('goProject(m.id)')
    // A person mention must SAY routing is not here yet, not imply a ping.
    expect(view).toContain('notifications arrive with routing')
    const input = read('src/renderer/src/components/TagMentionInput.tsx')
    expect(input).toContain("text.startsWith('@')")
    expect(input).toContain('usePeopleStore')
  })
})

describe('DEC-043 — queue tabs, class colors, drag-only reclassify', () => {
  const view = read('src/renderer/src/components/views/AttentionView.tsx')

  it('every class is a tab; All is the full-list view; tabs take drops', () => {
    expect(view).toContain("(['all', ...QUEUE_ORDER] as string[])")
    expect(view).toContain("localStorage.getItem('attention.queueTab')")
    // A class tab narrows to its one queue…
    expect(view).toContain("allQueues.filter((q) => q.queue === queueTab)")
    // …and dragging an item onto a tab reclassifies it into that class.
    expect(view).toContain('void moveToSection(t, [])')
  })

  it('colors come from the ONE palette, subtly applied', () => {
    const lib = read('src/renderer/src/lib/attentionQueues.ts')
    // Every class has a hue, from the PlexiSuite brand family.
    for (const c of ['to_do','to_review','to_decide','to_respond','to_meet','to_discuss','to_remember','to_know'])
      expect(lib).toContain(`${c}: '#`)
    // Subtle by construction: low-alpha washes, not colored panels.
    expect(view).toContain('queueTint(hue, 0.1)')
    expect(view).toContain('QUEUE_COLOR[q.queue]')
  })

  it('the row reclassify button is GONE — drag or the editor are the two paths', () => {
    expect(view).not.toContain('This isn’t right — reclassify')
    expect(view).not.toContain('swap_horiz')
    // The editor path still exists (class chips in the edit dialog).
    expect(read('src/renderer/src/components/AttentionItemEditor.tsx')).toContain('Classification')
  })
})

describe('DEC-044 — the highlight travels the WHOLE path to the notes', () => {
  it('menu → seam → console → card: notes at every hop', () => {
    // The desk-page path: a selection leads with its own text + notes.
    const universal = read('src/renderer/src/lib/contextMenu/universal.ts')
    expect(universal).toContain('presetForSelection(w.kind, sel)')
    expect(universal).toContain('p.notes || undefined')
    // The seam and store carry them…
    expect(read('src/renderer/src/components/Sidebar.tsx')).toContain('detail?.notes ?? ')
    expect(read('src/renderer/src/stores/captureConsole.ts')).toContain('initialNotes')
    // …and the console seeds its notes field from them.
    expect(read('src/renderer/src/components/CaptureConsole.tsx')).toContain(
      'useCaptureConsole.getState().initialNotes'
    )
  })

  it('the AI chat selection menu offers Add to Attention — FIRST', () => {
    const chat = read('src/renderer/src/components/ChatPanel.tsx')
    const menu = chat.slice(chat.indexOf('function ctxMenuItems'), chat.indexOf('Save selection as sticky'))
    expect(menu).toContain('Add to Attention…')
    expect(chat).toContain("presetForSelection('ai-chat', text)")
    // Standalone-friendly: filing must NOT require an open desk.
    expect(menu).not.toContain('disabled: noTask')
  })
})

describe('DEC-045 — the Attention widget on any desk', () => {
  it('is a real canvas kind: union, catalog, renderer case', () => {
    expect(read('src/shared/types.ts')).toContain("| 'attention'")
    const cat = read('src/renderer/src/lib/widgetCatalog.ts')
    expect(cat).toContain("kind: 'attention'")
    expect(cat).toContain('{"scope":"desk"}') // desk is the DEFAULT
    expect(read('src/renderer/src/components/Canvas.tsx')).toContain('<DeskAttentionWidget widget={w} />')
  })

  it('it is a REAL widget: framed, draggable, layered like every other kind', () => {
    // Live QA: the first cut rendered bare divs — "just text on the screen
    // with an invisible background… nothing I can grab". Every canvas kind
    // renders its OWN WidgetFrame; this one must too, or it has no header to
    // drag, no background, and no z-order.
    const w = read('src/renderer/src/components/views/attentionWidgets.tsx')
    expect(w).toContain('<WidgetFrame widget={widget} headerLabel="attention"')
    expect(w).toContain('bg-[var(--surface-raised)]')
  })

  it('same look as home (one component), scope persisted per widget', () => {
    const w = read('src/renderer/src/components/views/attentionWidgets.tsx')
    // The desk variant WRAPS the home widget rather than forking it.
    expect(w).toContain('itemsOverride={effective}')
    expect(w).toContain("storageKey={`attention.widget.section:${widget.id}`}")
    // Scope round-trips through widget.content.
    expect(w).toContain("content: JSON.stringify({ scope: next })")
    // Stale desks (a global feeder) hide in desk scope.
    expect(w).toContain("showStale={scope === 'all'}")
    // The fallback is honest, not silent.
    expect(w).toContain('nothing here yet — showing all')
  })
})

describe('DEC-046 — a highlighted list becomes several items, previewed first', () => {
  const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')

  it('the split happens on the CARD as pre-checked chips — never silently', () => {
    expect(card).toContain('parseSelectionList(rawNotes.trim() || text)')
    expect(card).toContain('listDerived: true')
    // Headers → primaries; sub-bullets carry parentIdx into the grouping.
    expect(card).toContain("const parentIdx = l.depth === 1 ? lastPrimary : undefined")
  })

  it('filing preserves the previewed structure via DEC-035 grouping', () => {
    expect(card).toContain('createdBySecIdx')
    expect(card).toContain("updateFieldsStore(child.id, { groupId: parentId })")
    // A child whose header was unchecked STANDS ALONE — never vanishes.
    expect(card).toContain('(createdBySecIdx.get(s.parentIdx) ?? null)')
    // List rows inherit the primary's class chip and the marked source.
    expect(card).toContain('s.listDerived ? confirm.picked : s.intentClass')
    expect(card).toContain("s.listDerived ? (source?.sourceType ?? 'note') : 'note'")
  })

  it('notes are whitespace-normalized, and prose notes get the FORMATTING tidy', () => {
    expect(card).toContain('normalizeSelectionText(rawNotes)')
    // The chat-summary case: substantial prose notes request a tidy whose
    // NOTE lands (bullets), while the preset title stands.
    expect(card).toContain('if (prose.length >= 80)')
    expect(card).toContain('prev && !notesEdited ? { ...prev, notes: p.note } : prev')
    const cleanup = read('src/main/ai/cleanupRewrite.ts')
    expect(cleanup).toContain('FORMATTING MATTERS AS MUCH AS WORDING')
    expect(cleanup).toContain('short "- " bullet lines')
  })
})

describe('DEC-047 — desk ⇄ attention, the derived shape (analysis/23 executed)', () => {
  const view = read('src/renderer/src/components/views/AttentionView.tsx')

  it('D-1/D-2: desk headers are DERIVED in the render — no stored grouping anywhere', () => {
    expect(view).toContain('clusterByDesk(grouped)')
    // Header anatomy: title, "Desk:"-prefixed status (the naming caution),
    // due, count, click-opens-desk.
    expect(view).toContain('Desk: {DESK_STATUS_LABEL[desk.status]')
    expect(view).toContain('cluster.rows.length')
    // The trap analysis/23 rejected must stay rejected: clustering never
    // writes groupId.
    const clusterFn = read('src/renderer/src/lib/attentionQueues.ts')
    const body = clusterFn.slice(clusterFn.indexOf('export function clusterByDesk'))
    expect(body.slice(0, body.indexOf('\n}\n'))).not.toContain('groupId')
  })

  it('D-3: closing the last item OFFERS desk-done — a suggestion, never an auto-write', () => {
    expect(view).toContain('closeWithOffer')
    expect(view).toContain('Mark the desk done')
    // Only fires on a still-open desk with nothing else active.
    expect(view).toContain("desk.status === 'done' || desk.status === 'parked'")
    expect(view).toContain('if (remaining.length > 0) return')
    // Accepting uses the ordinary user-owned node update.
    expect(view).toContain("updateNode(desk.id, { status: 'done' })")
  })

  it('D-4: All-Desks cards carry the attention signal; status groups untouched', () => {
    const desks = read('src/renderer/src/components/views/DesksView.tsx')
    expect(desks).toContain('attentionByDesk')
    expect(desks).toContain('open${attn.due ?')
    expect(desks).toContain("(['open', 'in_progress', 'done', 'parked']")
  })

  it('D-5: capture-time status on card AND form — ACTIVE states only', () => {
    const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')
    expect(card).toContain('CAPTURE_STATES.map')
    expect(card).toContain("state: birthState === 'open' ? undefined : birthState")
    expect(view).toContain('CAPTURE_STATES.map')
    const shared = read('src/shared/workItems.ts')
    expect(shared).toContain("['open', 'in_progress', 'waiting', 'blocked'] as const")
  })
})
