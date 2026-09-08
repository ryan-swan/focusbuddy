import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Clicking an object in the desk's List, Table, Gallery or Compact view sent
// the user to "All desks" instead of opening the object.
//
// The cause was a store mix-up rather than anything to do with the gallery:
// `open()` called useNodeStore.setActive -- the ACTIVE DESK setter -- with a
// WIDGET id. No node has that id, so the app had no resolvable active desk and
// fell back to the collection. It also recorded a `task_switched` trail entry
// naming a widget id with a null title.
//
// Two tests: the mechanism, so the failure is documented rather than asserted
// by folklore, and the call site, so the specific regression cannot return.

const SRC = readFileSync(
  join(__dirname, '..', '..', 'src', 'renderer', 'src', 'components', 'views', 'DeskDataViews.tsx'),
  'utf8'
)

describe('desk data views — opening an object', () => {
  it('activates the desk that owns the widget, not the widget', () => {
    const openFn = SRC.slice(SRC.indexOf('function open(w: Widget)'))
    const body = openFn.slice(0, openFn.indexOf('\n  }') + 4)
    expect(body).toContain('setActive(w.taskId)')
    expect(
      body,
      'setActive is the active-desk setter; a widget id there navigates to All desks'
    ).not.toMatch(/setActive\(\s*w\.id\s*\)/)
    expect(body).toContain('setFocused(w.id)')
  })

  it('every layout routes through the same handler', () => {
    // Gallery was the layout reported, but list, table and compact shared the
    // defect. Keeping them on one handler is what makes one fix cover all four.
    const handlers = SRC.match(/onClick=\{\(\) => open\(w\)\}/g) ?? []
    expect(handlers.length).toBeGreaterThanOrEqual(4)
  })

  it('an id that belongs to no node leaves no active desk — the failure mechanism', () => {
    const nodes = [{ id: 'desk_1', title: 'QA desk' }]
    const widget = { id: 'w_1', taskId: 'desk_1' }
    // What the bug did:
    expect(nodes.find((n) => n.id === widget.id)).toBeUndefined()
    // What the fix does:
    expect(nodes.find((n) => n.id === widget.taskId)).toEqual(nodes[0])
  })
})
