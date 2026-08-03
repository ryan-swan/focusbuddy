import { create } from 'zustand'
import type { FocusCluster, FocusClusterDraft, Pane, PaneSource, SplitRatios, SplitShape } from '@shared/types'
import { removePaneTransition } from '../lib/splitGeometry'

// Renderer store for Focus-Mode CLUSTERS (split "groups"), the persisted per-desk
// counterpart to the live focusSplit store. It owns the loaded list of clusters
// for the ACTIVE desk and the thin async CRUD that round-trips through
// window.api.clusters.* → IPC → SQLite. The dock reads this list to collapse
// grouped widgets into cluster tabs (C2); focus mode reads it to know which
// cluster to hydrate on entry (C3).
//
// Data flow is one-way per action: renderer intent → window.api.clusters.* →
// main CRUD → returned row → store list update. The store never writes SQLite
// directly; it mirrors what main returns so the dock and focus mode stay in sync.

// Does a PaneSource identify the same thing as another? (widget by id, chrome by
// tab, meet by room.) Used for exclusive-membership lookups (a widget lives in at
// most one cluster) without duplicating the geometry layer's comparison.
export function sameSource(a: PaneSource, b: PaneSource): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'widget' && b.kind === 'widget') return a.widgetId === b.widgetId
  if (a.kind === 'chrome' && b.kind === 'chrome') return a.tab === b.tab
  if (a.kind === 'meet' && b.kind === 'meet') return a.roomId === b.roomId
  return false
}

interface FocusClustersStore {
  // Clusters for the active desk, most-recently-updated first. Empty until loaded.
  clusters: FocusCluster[]
  // The desk (task node) the loaded list belongs to — guards against stale writes
  // when the active desk changes mid-flight.
  loadedFor: string | null

  // Load (or reload) all clusters for a desk. Called when the active desk changes
  // and after a focus-mode session that may have mutated a cluster.
  loadForTask: (taskId: string) => Promise<void>
  // Create or update a cluster and reflect the result in the list. Returns the
  // saved cluster (with its id) so the caller can remember which cluster is live.
  save: (draft: FocusClusterDraft) => Promise<FocusCluster | null>
  // Delete a cluster (it collapsed back to a single pane) and drop it from the list.
  remove: (id: string) => Promise<void>
  // Enforce EXCLUSIVE membership (C4): a source belongs to at most one cluster.
  // Before/when a source joins the cluster identified by `keepClusterId`, remove it
  // from every OTHER cluster that holds it. An other-cluster that drops below 2
  // members after eviction is deleted (a 1-pane "group" isn't a group). Returns
  // when all affected rows are persisted. taskId scopes the write.
  evictFromOtherClusters: (
    taskId: string,
    source: PaneSource,
    keepClusterId: string | null
  ) => Promise<void>
  // Prune dead WIDGET references (C4): a member widget deleted from the desk leaves
  // a dangling pane. Given the live widget ids, drop widget-panes whose widget is
  // gone; a cluster left with <2 resolvable members is deleted (not a group). Chrome
  // panes are never pruned (they don't depend on a widget). `liveClusterId` is left
  // untouched — pruning never touches the cluster currently open in a split (the
  // caller passes it so an in-use group isn't reshaped under the user).
  prunePlaceholders: (
    taskId: string,
    liveWidgetIds: Set<string>,
    liveClusterId: string | null
  ) => Promise<void>
  // Clear the list (leaving a desk / signing out).
  clear: () => void

  // ── Selectors (pure, over the loaded list) ─────────────────────────────────
  // Which cluster (if any) currently contains this source? Enforces exclusive
  // membership: a widget belongs to at most one cluster.
  clusterContaining: (source: PaneSource) => FocusCluster | null
  // Is this source a member of ANY cluster on this desk?
  isGrouped: (source: PaneSource) => boolean
}

export const useFocusClustersStore = create<FocusClustersStore>((set, get) => ({
  clusters: [],
  loadedFor: null,

  loadForTask: async (taskId) => {
    set({ loadedFor: taskId })
    const clusters = await window.api.clusters.list(taskId)
    // Only apply if the active desk hasn't changed since we started.
    if (get().loadedFor === taskId) set({ clusters })
  },

  save: async (draft) => {
    const saved = await window.api.clusters.save(draft)
    set((s) => {
      const rest = s.clusters.filter((c) => c.id !== saved.id)
      // Keep most-recently-updated first, matching the SQL ORDER BY.
      return { clusters: [saved, ...rest] }
    })
    return saved
  },

  remove: async (id) => {
    await window.api.clusters.delete(id)
    set((s) => ({ clusters: s.clusters.filter((c) => c.id !== id) }))
  },

  evictFromOtherClusters: async (taskId, source, keepClusterId) => {
    // The other clusters that currently hold this source (never the one we keep).
    const affected = get().clusters.filter(
      (c) => c.id !== keepClusterId && c.panes.some((p) => sameSource(p.source, source))
    )
    for (const c of affected) {
      // Find the pane holding the source and reshape the cluster without it, reusing
      // the geometry layer's remove transition so the surviving panes re-tile
      // deterministically (same math the live split uses).
      const doomed = c.panes.find((p) => sameSource(p.source, source))
      if (!doomed) continue
      const next = removePaneTransition(
        { shape: c.shape, panes: c.panes, ratios: c.ratios, activePaneId: c.activePaneId },
        doomed.id
      )
      if (next.panes.length < 2) {
        // Not a group anymore → delete the other cluster outright.
        await get().remove(c.id)
      } else {
        // Persist the shrunken other cluster in place.
        await get().save({
          id: c.id,
          taskId,
          shape: next.shape,
          panes: next.panes,
          ratios: next.ratios,
          activePaneId: next.activePaneId
        })
      }
    }
  },

  prunePlaceholders: async (taskId, liveWidgetIds, liveClusterId) => {
    // A pane is "dead" if it references a widget that no longer exists. Chrome/meet
    // panes are always alive (no widget dependency).
    const isDead = (p: Pane): boolean =>
      p.source.kind === 'widget' && !liveWidgetIds.has(p.source.widgetId)

    // Never prune the cluster currently open in a split — reshaping it under the
    // user would yank panes mid-session. It'll reconcile normally when they act.
    const candidates = get().clusters.filter(
      (c) => c.id !== liveClusterId && c.panes.some(isDead)
    )
    for (const c of candidates) {
      // Remove every dead pane, reshaping deterministically each time.
      let state = { shape: c.shape, panes: c.panes, ratios: c.ratios, activePaneId: c.activePaneId }
      for (const dead of c.panes.filter(isDead)) {
        if (!state.panes.some((p) => p.id === dead.id)) continue
        state = removePaneTransition(state, dead.id)
      }
      if (state.panes.length < 2) {
        await get().remove(c.id)
      } else {
        await get().save({
          id: c.id,
          taskId,
          shape: state.shape,
          panes: state.panes,
          ratios: state.ratios,
          activePaneId: state.activePaneId
        })
      }
    }
  },

  clear: () => set({ clusters: [], loadedFor: null }),

  clusterContaining: (source) => {
    return (
      get().clusters.find((c) => c.panes.some((p) => sameSource(p.source, source))) ?? null
    )
  },

  isGrouped: (source) => get().clusterContaining(source) !== null
}))

// Build a save draft from a live SplitState + the desk it belongs to. Kept here
// (not in the component) so the "what gets persisted" shape has one home.
export function clusterDraftFrom(
  taskId: string,
  shape: SplitShape,
  panes: Pane[],
  ratios: SplitRatios,
  activePaneId: string,
  id?: string
): FocusClusterDraft {
  return { id, taskId, shape, panes, ratios, activePaneId }
}
