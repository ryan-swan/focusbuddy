# Cross-Member Org Sync — Design (Plexi3.0, test-accounts-only)

The next sync-ladder rung: two different accounts who are members of the same organisation see the same org-scoped data. Today workspace sync is per-account single-owner (each account syncs its own nodes/widgets/timeblocks across its own devices). This design adds an org-scoped path alongside it, leaving the personal path byte-for-byte unchanged. Developed and tested only against a local signal server with throwaway accounts; nothing deploys to production, and the preview build's sync guard keeps a production-pointed preview from ever doing cross-member sync.

## Rule

An item's `org_id` decides its scope and nothing else. `org_id === 'personal'` (PERSONAL_ORG_ID) stays strictly local/per-account on the existing path. A real server org id (one that appears in `org_members` for the account) makes the item org-shared and routes it down the new org path. Items are already stamped with the active org at create time (getActiveOrgId), so membership of the container org IS the sharing decision; there is no per-item share toggle in the first slice.

## Server (../focusbuddy-signal, local only)

New table `org_workspace_items` keyed by `(org_id, id)` plus `last_writer_account_id`, sibling to the per-account `workspace_items`. Keeping org data in its own table is the structural guard against a row ever leaking into a personal `changesSince`. New `OrgWorkspaceSyncStore` (orgWorkspaceSync.ts) mirrors WorkspaceSyncStore with org_id replacing account_id: `changesSince(orgId, since)`, `upsert(orgId, actorAccountId, {...})` with last-write-wins + rev-conflict, `remove(orgId, actorAccountId, id)` tombstones. Own monotonic tick() clock, per-org cursor. Three routes with an `/org` segment so they can never be confused with the personal ones: `GET /workspace/org/sync`, `PUT /workspace/org/items/:id`, `DELETE /workspace/org/items/:id`. Each resolves the account (cloudDocsAccount), resolves the org from the x-plexi-org header via the member-only `sharedOrgFor` (returns null for personal or non-member — refuse), and gates writes on org role >= member. Membership is always checked server-side from org_members, never trusted from the header.

## Client

Two independent loops selected by the active org. Personal loop unchanged. New org loop reuses the fetch shapes against `/workspace/org/*`, sends the active org in x-plexi-org. syncWorkspaceOnce reads the active org: personal -> run only the personal loop; a shared org -> run only the org loop (one at a time in the first slice to avoid double-push). Main-process collectPending gains org-scoped variants filtering by org_id (personal loop filters org_id='personal'); this is the client-side leak guard. applyRemote stamps org_id from the active org on pulled rows. Cursors become per-scope (`workspace_cursor` personal, `workspace_cursor:<orgId>` per org).

## First slice

Org-shared TIME BLOCKS only (single self-contained row, already has org_id + sync bookkeeping, calendar reload already wired). Nodes, widgets, documents deferred to the next rung. Server: org_workspace_items table + OrgWorkspaceSyncStore limited to itemType 'timeblock' + the three routes with member gating. Client: org branch in the loop + org-scoped collectPending/cursor for time_blocks.

## Two-account test plan (local server, accounts A+B members of org O)

1. A creates a time block in org O -> server org_workspace_items has (O,id) rev=1 last_writer=A.
2. B (member of O) pulls -> block appears on B's calendar, local org_id=O.
3. B edits -> A pulls the edit (rev=2).
4. A deletes -> tombstone propagates, disappears for B.
5. Negative/leak test: non-member C sets x-plexi-org: O by hand -> GET returns nothing, PUT refused; C's personal blocks untouched.
6. Regression: Personal active on A+B -> per-account loop still works, A's personal blocks never appear for B.

## Risks

Cross-org/non-member leak: contained by the separate server table, client collectPending org_id filter, and server membership checks (step 5 proves it). Migration: additive table only; existing rows default org_id='personal' and stay personal, no backfill. Regressing personal sync: personal path untouched; only collectPending/applyRemote gain strict org filters that are no-ops when active org is personal (step 6 proves it). Echo/double-push: one loop per interval + existing echo suppression.

Last-write-wins is the first-slice conflict policy (matches the ladder); a CRDT/field-merge is future work. Full design rationale with file:line refs is in the dispatch that produced this doc.
