import { useEffect } from 'react'
import { create } from 'zustand'

// A registry the active rich editor (Document, Slides) publishes its own
// commands into, so the global command palette (Cmd+K) can drive the editor
// without the palette needing to know anything about Tiptap or slide elements.
//
// The editor calls setCommands(scope, [...]) when it mounts and whenever its
// command closures change, and clear(scope) on unmount. The palette reads
// `commands` and merges them in at the top whenever the user is inside that
// editor. Keeping the registry in a store, rather than React context, is what
// lets the palette — which lives at the app root inside a portal, nowhere near
// the editor in the tree — still see and run the editor's own commands.

export interface EditorCommand {
  id: string
  label: string
  // Material icon name, shown on the left of the row.
  icon?: string
  // Faint right-aligned key hint, display only (e.g. '⌘B').
  shortcut?: string
  // Grouping label surfaced as the row hint, e.g. 'Format', 'Insert', 'AI'.
  group?: string
  // Extra words the fuzzy match should consider beyond the label.
  keywords?: string
  // When true the palette stays open after running, for rapid repeated toggles.
  keepOpen?: boolean
  run: () => void
}

interface EditorCommandStore {
  // Human label for the active editor surface, e.g. 'Document' or 'Slides'.
  scope: string | null
  commands: EditorCommand[]
  setCommands: (scope: string, commands: EditorCommand[]) => void
  // Clear only if the given scope still owns the registry, so a late unmount of
  // a previous editor cannot wipe the commands a newly-mounted one just set.
  clear: (scope: string) => void
}

export const useEditorCommandStore = create<EditorCommandStore>((set, get) => ({
  scope: null,
  commands: [],
  setCommands: (scope, commands) => set({ scope, commands }),
  clear: (scope) => {
    if (get().scope === scope) set({ scope: null, commands: [] })
  }
}))

// Convenience hook for an editor component: register its commands while mounted,
// rebuild them when `deps` change, and clear them on unmount. `build` is called
// fresh on every dep change so the closures always capture current state.
export function useRegisterEditorCommands(
  scope: string,
  build: () => EditorCommand[],
  deps: unknown[]
): void {
  const setCommands = useEditorCommandStore((s) => s.setCommands)
  const clear = useEditorCommandStore((s) => s.clear)
  useEffect(() => {
    setCommands(scope, build())
    return () => clear(scope)
    // build/scope/setCommands/clear are stable enough; the editor passes the
    // real reactive inputs through deps so the command closures stay current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
