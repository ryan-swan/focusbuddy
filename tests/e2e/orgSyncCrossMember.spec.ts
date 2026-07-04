/**
 * E2E: cross-member org sync — first slice (org-shared TIME BLOCKS only).
 *
 * Backing contract: docs/CROSS-MEMBER-SYNC-DESIGN.md. Two independent server
 * tables/routes keep org-scoped rows structurally separate from personal ones:
 *   - focusbuddy-signal/src/orgWorkspaceSync.ts (org_workspace_items table)
 *   - GET /workspace/org/sync, PUT/DELETE /workspace/org/items/:id
 *   - membership resolved server-side via sharedOrgFor() from org_members —
 *     the x-plexi-org header is never trusted beyond what that check confirms.
 *
 * This spec drives the design doc's own two-account test plan (section
 * "Two-account test plan") exactly as written there — it is itself an
 * HTTP-only contract test (create two accounts, add both to one org, PUT/GET
 * against /workspace/org/*). No Electron instance is required to exercise it
 * because the first slice's own test plan operates at the HTTP layer; the
 * renderer-side network glue (src/renderer/src/lib/workspaceSync.ts
 * putItemOrg/pullChangesOrg/syncOrgWorkspaceOnce) and the main-process
 * collect/apply org variants (src/main/db/workspaceSync.ts collectPendingOrg/
 * applyRemoteOrg) that call these same endpoints were verified by code
 * inspection, not driven live here, for the same file:// vs http:// mixed
 * content reason documented in calendarSync.spec.ts.
 *
 * Steps mirror the design doc 1:1:
 *   1. A pushes a time block to org O -> server has it, rev 1.
 *   2. B (member of O) pulls -> sees A's block.
 *   3. B edits -> A pulls the edit (rev 2, last_writer flips to B).
 *   4. A deletes -> tombstone propagates to B.
 *   5. Negative/leak test: non-member C's x-plexi-org:O header is refused on
 *      both GET and PUT; C's own personal workspace is unaffected.
 *   6. Regression: personal sync (x-plexi-org unset or 'personal') stays
 *      per-account; A's personal blocks never reach B's personal pull, and an
 *      org item never leaks into anyone's personal pull.
 */

import { test, expect } from '@playwright/test'

const SIGNAL_BASE = process.env.E2E_SIGNAL_BASE ?? 'http://localhost:8790'

test.beforeAll(async () => {
  const res = await fetch(`${SIGNAL_BASE}/healthz`).catch(() => null)
  test.skip(!res || !res.ok, `Local signal server not reachable at ${SIGNAL_BASE} — start it before running this spec.`)
  test.skip(
    /focusbuddy-signal\.fly\.dev/.test(SIGNAL_BASE),
    'Refusing to run account/org-creating sync tests against the production signal server.'
  )
})

interface SignupResult {
  token: string
  accountId: string
  email: string
}

async function signup(email: string, password: string): Promise<SignupResult> {
  const res = await fetch(`${SIGNAL_BASE}/accounts/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error(`signup failed (${res.status}): ${await res.text()}`)
  const json = (await res.json()) as {
    ok: boolean
    sessionToken: string
    account: { id: string; email: string }
  }
  if (!json.ok) throw new Error('signup returned ok:false')
  return { token: json.sessionToken, accountId: json.account.id, email: json.account.email }
}

async function createOrg(token: string, name: string): Promise<string> {
  const res = await fetch(`${SIGNAL_BASE}/orgs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  const json = (await res.json()) as { ok: boolean; org: { id: string } }
  if (!res.ok || !json.ok) throw new Error(`org create failed (${res.status})`)
  return json.org.id
}

async function addMember(adminToken: string, orgId: string, email: string): Promise<void> {
  const res = await fetch(`${SIGNAL_BASE}/orgs/${orgId}/members`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role: 'member' })
  })
  const json = (await res.json()) as { ok: boolean; added: boolean }
  if (!res.ok || !json.ok || !json.added) throw new Error(`addMember failed (${res.status}): ${JSON.stringify(json)}`)
}

interface OrgItem {
  id: string
  itemType: string
  body: Record<string, unknown> | null
  rev: number
  deleted: boolean
  lastWriterAccountId: string | null
}

async function orgPut(
  token: string,
  orgId: string,
  id: string,
  body: Record<string, unknown>,
  baseRev?: number,
  itemType: 'timeblock' | 'document' | 'table' | 'row' = 'timeblock'
): Promise<{ status: number; json: { ok: boolean; item?: OrgItem; error?: string } }> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/org/items/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId, 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemType, body, baseRev })
  })
  return { status: res.status, json: await res.json() }
}

async function orgDelete(
  token: string,
  orgId: string,
  id: string
): Promise<{ status: number; json: { ok: boolean; item?: OrgItem; error?: string } }> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/org/items/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId }
  })
  return { status: res.status, json: await res.json() }
}

async function orgSync(
  token: string,
  orgId: string,
  since = 0
): Promise<{ status: number; json: { ok: boolean; items?: OrgItem[]; error?: string } }> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/org/sync?since=${since}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId }
  })
  return { status: res.status, json: await res.json() }
}

interface PersonalItem {
  id: string
  itemType: string
  body: Record<string, unknown> | null
  rev: number
  deleted: boolean
}

async function personalPut(
  token: string,
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: { ok: boolean; item?: PersonalItem } }> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/items/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ itemType: 'timeblock', body })
  })
  return { status: res.status, json: await res.json() }
}

async function personalSync(
  token: string,
  since = 0,
  orgHeader?: string
): Promise<{ status: number; json: { ok: boolean; items?: PersonalItem[] } }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (orgHeader !== undefined) headers['x-plexi-org'] = orgHeader
  const res = await fetch(`${SIGNAL_BASE}/workspace/sync?since=${since}`, { headers })
  return { status: res.status, json: await res.json() }
}

test.describe.configure({ mode: 'serial' })

test('cross-member org sync: push/pull/edit/delete propagate; non-members are refused; personal sync stays isolated', async () => {
  const rand = Date.now()

  // ── Setup: A creates org O, invites B as a member. C is a bystander, never invited. ──
  const A = await signup(`orgsync.a.${rand}@example.com`, 'Test-Account-123!')
  const B = await signup(`orgsync.b.${rand}@example.com`, 'Test-Account-123!')
  const C = await signup(`orgsync.c.${rand}@example.com`, 'Test-Account-123!')

  const orgId = await createOrg(A.token, `OrgSync Test ${rand}`)
  await addMember(A.token, orgId, B.email)

  const blockId = `tb-orgsync-${rand}`

  // ── Step 1: A pushes a time block to org O ──
  const put1 = await orgPut(A.token, orgId, blockId, { title: 'Standup', start: 1000, end: 2000 })
  expect(put1.status).toBe(200)
  expect(put1.json.ok).toBe(true)
  expect(put1.json.item?.rev).toBe(1)

  // ── Step 2: B (member) pulls -> sees A's block ──
  const syncB1 = await orgSync(B.token, orgId, 0)
  expect(syncB1.status).toBe(200)
  const seenByB1 = syncB1.json.items?.find((i) => i.id === blockId)
  expect(seenByB1).toBeTruthy()
  expect(seenByB1?.body?.title).toBe('Standup')
  expect(seenByB1?.rev).toBe(1)

  // ── Step 3: B edits -> A pulls the edit, rev increments, last writer flips ──
  const put2 = await orgPut(B.token, orgId, blockId, { title: 'Standup (moved)', start: 1500, end: 2500 }, 1)
  expect(put2.status).toBe(200)
  expect(put2.json.item?.rev).toBe(2)
  expect(put2.json.item?.lastWriterAccountId).toBe(B.accountId)

  const syncA1 = await orgSync(A.token, orgId, 0)
  const seenByA1 = syncA1.json.items?.find((i) => i.id === blockId)
  expect(seenByA1?.rev).toBe(2)
  expect(seenByA1?.body?.title).toBe('Standup (moved)')
  expect(seenByA1?.lastWriterAccountId).toBe(B.accountId)

  // ── Step 4: A deletes -> tombstone propagates to B ──
  const del1 = await orgDelete(A.token, orgId, blockId)
  expect(del1.status).toBe(200)
  expect(del1.json.item?.deleted).toBe(true)

  const syncB2 = await orgSync(B.token, orgId, 0)
  const seenByB2 = syncB2.json.items?.find((i) => i.id === blockId)
  expect(seenByB2?.deleted).toBe(true)

  // ── Step 5: negative/leak test — non-member C sets x-plexi-org: O by hand ──
  const leakBlockId = `tb-orgsync-leak-${rand}`
  // Seed a real org item so there's something for C to potentially leak.
  await orgPut(A.token, orgId, leakBlockId, { title: 'Org-only content' })

  const cGet = await orgSync(C.token, orgId, 0)
  expect(cGet.json.ok).toBe(false) // refused, not merely empty-but-ok
  expect(cGet.status).toBeGreaterThanOrEqual(400)
  // Whether refused outright or returned empty, C must never see the org's item.
  expect((cGet.json.items ?? []).some((i) => i.id === leakBlockId)).toBe(false)

  const cPut = await orgPut(C.token, orgId, `tb-leak-attempt-${rand}`, { title: 'leak attempt' })
  expect(cPut.json.ok).toBe(false)
  expect(cPut.status).toBeGreaterThanOrEqual(400)

  // C's own personal workspace is unaffected by the refused attempt.
  const cPersonalId = `tb-c-personal-${rand}`
  const cPersonalPut = await personalPut(C.token, cPersonalId, { title: 'C personal block' })
  expect(cPersonalPut.status).toBe(200)
  expect(cPersonalPut.json.ok).toBe(true)

  // ── Step 6: regression — personal sync unaffected, org data never leaks into it ──
  const aPersonalId = `tb-a-personal-${rand}`
  await personalPut(A.token, aPersonalId, { title: 'A personal-only block' })

  // B's personal sync must never contain A's personal block (per-account isolation).
  const bPersonalSync = await personalSync(B.token, 0)
  expect((bPersonalSync.json.items ?? []).map((i) => i.id)).not.toContain(aPersonalId)

  // A's own personal sync must never contain the org-scoped item.
  const aPersonalSync = await personalSync(A.token, 0)
  const aPersonalIds = (aPersonalSync.json.items ?? []).map((i) => i.id)
  expect(aPersonalIds).not.toContain(leakBlockId)
  expect(aPersonalIds).toContain(aPersonalId)

  // Explicit x-plexi-org: personal behaves identically to the header being unset.
  const aPersonalSyncExplicit = await personalSync(A.token, 0, 'personal')
  expect((aPersonalSyncExplicit.json.items ?? []).map((i) => i.id)).toContain(aPersonalId)
})

// Rung 2: documents, tables and rows also propagate cross-member. Same store,
// same membership gating, same tombstone semantics; only the itemType differs.
test('cross-member org sync: documents, tables and rows propagate and tombstone; non-members refused', async () => {
  const rand = Math.random().toString(36).slice(2, 8)
  const A = await signup(`rung2.a.${rand}@example.com`, 'Test-Account-123!')
  const B = await signup(`rung2.b.${rand}@example.com`, 'Test-Account-123!')
  const O = await createOrg(A.token, 'Rung2 Org')
  await addMember(A.token, O, B.email)

  // A creates an org document; B pulls it.
  const docId = `doc_${Date.now()}`
  const docBody = { id: docId, doc_type: 'doc', title: 'Shared brief', body: '{}', org_id: O }
  const putDoc = await orgPut(A.token, O, docId, docBody, undefined, 'document')
  expect(putDoc.status).toBe(200)
  expect(putDoc.json.ok).toBe(true)
  let bSync = await orgSync(B.token, O, 0)
  const bDoc = (bSync.json.items ?? []).find((i) => i.id === docId)
  expect(bDoc, 'B receives A org document').toBeTruthy()
  expect((bDoc?.body as Record<string, unknown>)?.title).toBe('Shared brief')

  // A creates an org table and a row under it; B pulls both.
  const tableId = `tbl_${Date.now()}`
  const rowId = `row_${Date.now()}`
  const putTable = await orgPut(A.token, O, tableId, { id: tableId, title: 'Episodes', schema_json: '{"columns":[]}', org_id: O }, undefined, 'table')
  expect(putTable.status).toBe(200)
  const putRow = await orgPut(A.token, O, rowId, { id: rowId, table_id: tableId, cells_json: '{"Title":"Pilot"}', sort_order: 0 }, undefined, 'row')
  expect(putRow.status).toBe(200)
  bSync = await orgSync(B.token, O, 0)
  const ids = (bSync.json.items ?? []).map((i) => i.id)
  expect(ids, 'B receives table').toContain(tableId)
  expect(ids, 'B receives row').toContain(rowId)

  // B edits the row (rev bump), A pulls the edit.
  const rowRev = (bSync.json.items ?? []).find((i) => i.id === rowId)!.rev
  const editRow = await orgPut(B.token, O, rowId, { id: rowId, table_id: tableId, cells_json: '{"Title":"Recorded"}', sort_order: 0 }, rowRev, 'row')
  expect(editRow.status).toBe(200)
  const aSync = await orgSync(A.token, O, 0)
  const aRow = (aSync.json.items ?? []).find((i) => i.id === rowId)
  expect((aRow?.body as Record<string, unknown>)?.cells_json).toBe('{"Title":"Recorded"}')

  // A deletes the document; tombstone propagates to B.
  const delDoc = await orgDelete(A.token, O, docId)
  expect(delDoc.status).toBe(200)
  bSync = await orgSync(B.token, O, 0)
  const bDocAfter = (bSync.json.items ?? []).find((i) => i.id === docId)
  expect(bDocAfter?.deleted, 'doc tombstone reaches B').toBe(true)

  // Non-member C cannot read or write org docs/tables.
  const C = await signup(`rung2.c.${rand}@example.com`, 'Test-Account-123!')
  const cSync = await orgSync(C.token, O, 0)
  expect(cSync.status).not.toBe(200)
  const cPut = await orgPut(C.token, O, `evil_${Date.now()}`, { id: 'x', org_id: O }, undefined, 'document')
  // A non-member cannot write: the org will not even resolve for them
  // (sharedOrgFor returns null -> 400 No shared org active), which is a
  // stronger refusal than 403 since it does not confirm the org exists.
  expect(cPut.status).not.toBe(200)
  expect(cPut.json.ok).not.toBe(true)
})
