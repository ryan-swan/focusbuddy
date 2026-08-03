import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Universal SpeedDeck config storage.
//
// Two kinds of decks exist:
//   - Task deck: scoped to a single canvas task, stored inline in the
//     SpeedDeck widget's `widget.content` JSON. (Unchanged.)
//   - Universal deck: ONE deck that persists across every task, every
//     folder, every workspace. The user can pin this version of the
//     widget to any corner and it's the same set of buttons no matter
//     which task is currently open.
//
// The universal config lives at userData/speeddeck-universal.json so
// it's tied to the user's machine, not to a specific task or widget.
// Multiple SpeedDeck widgets on multiple canvases can all read/write
// the same universal deck — they're literally the same data.

const FILE_NAME = 'speeddeck-universal.json'

function fileFor(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

export function loadUniversalDeck(): string | null {
  const path = fileFor()
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function saveUniversalDeck(json: string): void {
  const path = fileFor()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, json, 'utf8')
}
