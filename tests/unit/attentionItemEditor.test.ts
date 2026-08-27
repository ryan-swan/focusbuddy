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
