// Persisted workspace path override for the agent resolver.
//
// When the user explicitly points Haptyx at their workspace via
// Settings, that path takes priority over all the auto-detected
// candidates. Lives in `<userData>/workspace.json` as a tiny JSON
// blob — same pattern as voiceProviderPref.
//
// Empty string / missing file = no override. The resolver falls
// through to its other probes.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface PrefShape {
  workspacePath: string
  v: 1
}

let cache: PrefShape | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'workspace.json')
}

function load(): PrefShape {
  if (cache) return cache
  try {
    if (!existsSync(filePath())) {
      cache = { workspacePath: '', v: 1 }
      return cache
    }
    const raw = readFileSync(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PrefShape>
    const workspacePath =
      typeof parsed.workspacePath === 'string' ? parsed.workspacePath : ''
    cache = { workspacePath, v: 1 }
    return cache
  } catch {
    cache = { workspacePath: '', v: 1 }
    return cache
  }
}

/**
 * Returns the user-set workspace override, or null if none is set.
 * The resolver pushes this to the front of its probe list when
 * present.
 */
export function getWorkspaceOverride(): string | null {
  const p = load().workspacePath.trim()
  return p ? p : null
}

export function setWorkspaceOverride(path: string): void {
  cache = { workspacePath: path.trim(), v: 1 }
  try {
    writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[workspacePref] save failed:', err)
  }
}
