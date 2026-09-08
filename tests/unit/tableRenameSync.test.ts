import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// "Object naming is inconsistent across surfaces. A renamed table continued to
// appear as 'Untitled table' in desk summaries and Gallery."
//
// A table widget stores the table id in `content`; the human name lives on the
// table record. Desk-level surfaces only have the widget, so they showed the
// kind label forever. The fix syncs at the single write point -- the rename --
// rather than making every surface join across two stores.

const ROOT = join(__dirname, '..', '..', 'src')
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

describe('renaming a table reaches the desk', () => {
  const widgets = read('main/db/widgets.ts')
  const body = widgets.slice(widgets.indexOf('export function syncTableWidgetTitles'))

  it('updates the widgets that represent that table', () => {
    expect(body.slice(0, 900)).toContain("kind = 'table' AND content = ?")
  })

  it('never overwrites a title the user chose deliberately', () => {
    // Only an empty title, or one still equal to the table's previous name, is
    // a default we are entitled to replace.
    expect(body.slice(0, 900)).toContain("title IS NULL OR title = '' OR title = ?")
  })

  it('leaves trashed widgets alone', () => {
    expect(body.slice(0, 900)).toContain('trashed_at IS NULL')
  })

  it('is wired into the rename, and only fires on an actual rename', () => {
    const ipc = read('main/ipc/index.ts')
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('tables:update'"))
    expect(handler.slice(0, 900)).toContain('syncTableWidgetTitles(id, before.title, patch.title)')
    expect(handler.slice(0, 900)).toContain("patch.title !== before.title")
    // The previous title must be read before the update, or the comparison is
    // against the value we just wrote.
    expect(handler.slice(0, 900)).toMatch(/const before[\s\S]{0,120}getTable\(id\)[\s\S]{0,120}updateTable/)
  })
})
