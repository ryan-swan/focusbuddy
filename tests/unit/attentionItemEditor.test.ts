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
    expect(editor).toContain('serializeTags(tagText.split')
    expect(editor).toContain('optional, comma separated')
  })
})
