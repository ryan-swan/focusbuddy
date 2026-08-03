/**
 * E2E: cross-member Drive FILE sync — a file's metadata (fb_files row) AND its
 * bytes now replicate across members of the same org, and the receiving
 * member's PlexiBrain can ingest them.
 *
 * Backing contract:
 *  - focusbuddy-signal/src/orgWorkspaceSync.ts — 'file' added to ORG_ITEM_TYPES,
 *    so metadata rides the existing /workspace/org/items delta-sync loop.
 *  - focusbuddy-signal/src/orgFileBlobs.ts + new routes in server.ts — the BYTES
 *    move over a separate member-gated channel keyed by (org, fileId):
 *      PUT    /workspace/org/files/:id            (upload, octet-stream)
 *      GET    /workspace/org/files/:id[?meta=1]   (download, or existence-only)
 *      DELETE /workspace/org/files/:id            (tombstone cleanup)
 *  - src/main/db/workspaceSync.ts collectPendingOrg pushes fb_files rows WHERE
 *    org_id = orgId AND kind IN ('file','folder') — doc-pointer rows excluded
 *    (they travel as their own 'document' item). orderOrgItemsForApply topo-sorts
 *    'file' items by parent_id so a folder always applies before the files inside
 *    it, in the same batch.
 *  - src/renderer/src/lib/workspaceSync.ts ensureOrgBlobUploaded /
 *    fetchMissingOrgBlobs move the bytes after metadata push/pull (thin fetch
 *    wrappers around the same routes exercised directly below).
 *  - src/main/brainIngest.ts skips indexing a synced file until hasFileBytes()
 *    is true, so a file whose metadata landed before its bytes is never locked
 *    in as an empty entry.
 *
 * HARNESS NOTE — why this drives fixtures via window.api + direct HTTP rather
 * than two fully UI-driven windows (sign-up dialog, org-admin, header org
 * switcher): empirically, against this build, the header org-switcher's menu
 * (a separate store from OrgAdminView's own org list — stores/org.ts only
 * reloads its org list on mount/token-change) does not reliably show an org
 * created moments earlier in the same session even after the documented
 * reload-before-switch workaround from orgDocLiveRouting.spec.ts; the identical
 * failure reproduces verbatim against the EXISTING orgSyncTwoWindowLive.spec.ts
 * at the same line, confirming this is a pre-existing harness/UI-timing issue
 * in the reference template itself, not a regression from this diff.
 * Per the tester playbook's guidance to prefer a deterministic contract drive
 * over a flaky UI gesture: org/account creation is real (real HTTP signup,
 * real org, real membership, run against the plain-http backend directly —
 * a Node-side fetch is not subject to renderer CSP, matching the established
 * calendarSync.spec.ts fallback), and file/folder creation + the local halves
 * of push/pull (collectPendingOrg, applyRemoteOrg, hasFileBytes,
 * writeSyncedFileBytes, fileBytesForPush, brain.ingestWorkspace,
 * files.extractText) run through two REAL Electron app instances via
 * window.api — real main process, real SQLite, real IPC. The renderer's own
 * thin fetch wrappers (putItemOrg/pullChangesOrg/ensureOrgBlobUploaded/
 * fetchMissingOrgBlobs) are exercised via this test's own Node process making
 * the identical HTTP calls those wrappers make, the same fallback
 * calendarSync.spec.ts already documents and uses for the same CSP reason.
 *
 * Scenario (d) — non-member gating + personal-scope isolation — has its own
 * dedicated HTTP-only describe block below, using the same signup/createOrg/
 * addMember helpers as orgSyncCrossMember.spec.ts.
 */

import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// Plain-http backend. A Node-side fetch (this test's own process, not the
// renderer) is never subject to Chromium's CSP, so no TLS proxy is needed here.
const SIGNAL_BASE = process.env.ORGFILESYNC_SIGNAL_BASE ?? 'http://localhost:8792'

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
  const json = (await res.json()) as { ok: boolean; sessionToken: string; account: { id: string; email: string } }
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
}

// Mirrors src/renderer/src/lib/workspaceSync.ts putItemOrg exactly (same
// method, path, headers, body shape).
async function putItemMeta(
  token: string,
  orgId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ status: number; json: { ok: boolean; item?: OrgItem; error?: string } }> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/org/items/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId, 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemType: 'file', body })
  })
  return { status: res.status, json: await res.json() }
}

// Mirrors pullChangesOrg exactly.
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

// Mirrors uploadOrgBlob exactly.
async function uploadBlob(
  token: string,
  orgId: string,
  id: string,
  ext: string,
  mime: string,
  bytes: Uint8Array
): Promise<boolean> {
  const qs = `?ext=${encodeURIComponent(ext || '')}&mime=${encodeURIComponent(mime || 'application/octet-stream')}`
  const res = await fetch(`${SIGNAL_BASE}/workspace/org/files/${id}${qs}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId, 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(bytes)
  })
  return res.ok
}

// Mirrors downloadOrgBlob exactly.
async function downloadBlob(token: string, orgId: string, id: string): Promise<Uint8Array | null> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/org/files/${id}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId }
  })
  if (!res.ok) return null
  return new Uint8Array(await res.arrayBuffer())
}

interface FbFileLike {
  id: string
}
interface FileEntryLike {
  id: string
  parentId: string | null
  kind: 'folder' | 'file' | 'doc'
  name: string
}
interface KnowledgeEntryLike {
  id: string
  title: string
  body: string
}
interface PendingUpsertLike {
  id: string
  itemType: string
  body: Record<string, unknown>
}
interface PendingOrgResult {
  upserts: PendingUpsertLike[]
}

test.describe('cross-member Drive file sync: metadata + bytes + folder nesting + Brain ingest', () => {
  let A: LaunchedApp | null = null
  let B: LaunchedApp | null = null

  test.afterEach(async () => {
    if (A) {
      await A.dispose()
      A = null
    }
    if (B) {
      await B.dispose()
      B = null
    }
  })

  test("cross-member Drive file sync: metadata + bytes propagate A -> B, nest under a folder, and feed B's Brain; a personal-scope file never leaves A", async () => {
    test.setTimeout(60_000)
    const rand = Date.now()

    // ── Real accounts + real org + real membership, over real HTTP ────────────
    const owner = await signup(`orgfilesync.a.${rand}@example.com`, 'Test-Account-123!')
    const member = await signup(`orgfilesync.b.${rand}@example.com`, 'Test-Account-123!')
    const orgId = await createOrg(owner.token, `File Sync Org ${rand}`)
    await addMember(owner.token, orgId, member.email)

    // ── Two REAL Electron app instances — real main process, real SQLite ──────
    A = await launchApp()
    B = await launchApp()
    await A.window.waitForFunction(() => typeof (window as unknown as { api?: unknown }).api === 'object', null, {
      timeout: 10_000
    })
    await B.window.waitForFunction(() => typeof (window as unknown as { api?: unknown }).api === 'object', null, {
      timeout: 10_000
    })

    // Set each app's LOCAL active-org tenancy boundary to the real org id
    // (main-process-only bookkeeping via session:setActiveOrg — no account
    // sign-in needed for this local call, same IPC the header org switcher
    // calls when a real user clicks it).
    await A.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg(id)
    }, orgId)
    await B.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg(id)
    }, orgId)

    // ── A creates the fixtures via IPC while its local active org is O ────────
    const ROOT_CONTENT = 'cross member file alpha'
    const NESTED_CONTENT = 'nested file bravo'
    const PERSONAL_LEAK_CONTENT = 'personal leak guard content'

    const rootFile = await A.window.evaluate(async (content) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const bytes = new TextEncoder().encode(content)
      return api.files.ingestBuffer({
        buffer: bytes.buffer,
        originalName: 'org-file-sync-root.txt',
        mimeType: 'text/plain',
        parentId: null
      })
    }, ROOT_CONTENT)
    const rootFileId = (rootFile as unknown as FbFileLike).id
    expect(rootFileId, 'root file must be created').toBeTruthy()

    const folder = await A.window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.fileManager.createFolder(null, 'Shared Folder (org sync)')
    })
    const folderId = (folder as unknown as FileEntryLike).id
    expect(folderId, 'folder must be created').toBeTruthy()

    const nestedFile = await A.window.evaluate(
      async ({ content, parentId }) => {
        const api = (window as unknown as { api: typeof window.api }).api
        const bytes = new TextEncoder().encode(content)
        return api.files.ingestBuffer({
          buffer: bytes.buffer,
          originalName: 'org-file-sync-nested.txt',
          mimeType: 'text/plain',
          parentId
        })
      },
      { content: NESTED_CONTENT, parentId: folderId }
    )
    const nestedFileId = (nestedFile as unknown as FbFileLike).id
    expect(nestedFileId, 'nested file must be created').toBeTruthy()

    // Sanity, on A itself, before any sync: the nested file really is parented
    // under the folder.
    const nestedEntryOnA = await A.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.fileManager.get(id)
    }, nestedFileId)
    expect((nestedEntryOnA as unknown as FileEntryLike).parentId).toBe(folderId)

    // ── Leak-guard proof: a PERSONAL-scope file on A must never even be a
    // candidate for the org push — collectPending() (the personal loop) does
    // not query fb_files at all, so this holds with zero network dependency. ──
    await A.window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('personal')
    })
    const personalFile = await A.window.evaluate(async (content) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const bytes = new TextEncoder().encode(content)
      return api.files.ingestBuffer({
        buffer: bytes.buffer,
        originalName: 'personal-leak-guard.txt',
        mimeType: 'text/plain',
        parentId: null
      })
    }, PERSONAL_LEAK_CONTENT)
    expect((personalFile as unknown as FbFileLike).id, 'personal file must be created').toBeTruthy()

    const personalPending = (await A.window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.workspaceSync.pending()
    })) as unknown as PendingOrgResult
    expect(
      personalPending.upserts.some((u) => u.itemType === 'file'),
      'the personal sync loop must never carry a file item at all (files only ever sync via the org loop)'
    ).toBe(false)

    await A.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg(id)
    }, orgId)

    // ── Direct-IPC proof of collectPendingOrg: A's main process correctly
    // identifies all 3 org fixtures as pending 'file' upserts. ────────────────
    const pendingOrg = (await A.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.workspaceSync.pendingOrg(id)
    }, orgId)) as unknown as PendingOrgResult
    const pendingIds = pendingOrg.upserts.map((u) => u.id)
    expect(pendingIds, 'collectPendingOrg must surface the root file').toContain(rootFileId)
    expect(pendingIds, 'collectPendingOrg must surface the folder').toContain(folderId)
    expect(pendingIds, 'collectPendingOrg must surface the nested file').toContain(nestedFileId)
    expect(
      pendingOrg.upserts.every((u) => u.itemType === 'file'),
      'every Drive fixture must be typed file'
    ).toBe(true)
    expect(pendingIds, 'the personal-scope file must NEVER be in the org-scoped pending set').not.toContain(
      (personalFile as unknown as FbFileLike).id
    )

    // ── Push each pending item's METADATA to the real server (mirrors
    // putItemOrg exactly — same route, method, headers, body shape). ─────────
    for (const u of pendingOrg.upserts) {
      const put = await putItemMeta(owner.token, orgId, u.id, u.body)
      expect(put.status, `metadata PUT for ${u.id} must succeed`).toBe(200)
      expect(put.json.ok).toBe(true)
    }

    // ── Push BYTES for the two real files (mirrors ensureOrgBlobUploaded
    // exactly — fileBytesForPush then PUT octet-stream). ─────────────────────
    for (const fileId of [rootFileId, nestedFileId]) {
      const local = await A.window.evaluate(async (id) => {
        const api = (window as unknown as { api: typeof window.api }).api
        return api.workspaceSync.fileBytesForPush(id)
      }, fileId)
      const l = local as unknown as { ext: string; mimeType: string; bytes: Uint8Array } | null
      expect(l, `A must have local bytes for ${fileId} to push`).toBeTruthy()
      const uploaded = await uploadBlob(owner.token, orgId, fileId, l!.ext, l!.mimeType, new Uint8Array(Object.values(l!.bytes)))
      expect(uploaded, `blob upload for ${fileId} must succeed`).toBe(true)
    }

    // ── B pulls the delta sync (mirrors pullChangesOrg exactly) ───────────────
    const pulled = await orgSync(member.token, orgId, 0)
    expect(pulled.status).toBe(200)
    expect(pulled.json.ok).toBe(true)
    const pulledIds = (pulled.json.items ?? []).map((i) => i.id)
    expect(pulledIds, 'B must receive the root file item').toContain(rootFileId)
    expect(pulledIds, 'B must receive the folder item').toContain(folderId)
    expect(pulledIds, 'B must receive the nested file item').toContain(nestedFileId)
    expect(pulledIds, "A's personal-scope file must never appear in the org sync response").not.toContain(
      (personalFile as unknown as FbFileLike).id
    )

    // ── (a)+(b) B applies the pulled batch (mirrors applyRemoteOrg exactly,
    // including the parent-before-child topo-sort for fb_files). ─────────────
    const applyResult = await B.window.evaluate(
      async ({ items, id }) => {
        const api = (window as unknown as { api: typeof window.api }).api
        return api.workspaceSync.applyRemoteOrg(
          items.map((i) => ({
            id: i.id,
            itemType: i.itemType as 'file',
            body: i.body,
            rev: i.rev,
            deleted: i.deleted
          })),
          id
        )
      },
      { items: pulled.json.items ?? [], id: orgId }
    )
    expect((applyResult as unknown as { applied: number }).applied, 'applyRemoteOrg must apply all 3 fixtures').toBe(3)

    const bFolderEntry = await B.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.fileManager.get(id)
    }, folderId)
    expect((bFolderEntry as unknown as FileEntryLike)?.kind, 'B must have the folder itself').toBe('folder')

    const bRootEntry = await B.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.fileManager.get(id)
    }, rootFileId)
    expect((bRootEntry as unknown as FileEntryLike)?.parentId, "root file's parentId on B must be null (root)").toBeNull()

    const bNestedEntry = await B.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.fileManager.get(id)
    }, nestedFileId)
    expect(
      (bNestedEntry as unknown as FileEntryLike)?.parentId,
      "the nested file's parentId on B must be the folder, not orphaned"
    ).toBe(folderId)

    const bFolderChildren = await B.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.fileManager.list(id)
    }, folderId)
    expect(
      (bFolderChildren as unknown as FileEntryLike[]).some((e) => e.id === nestedFileId),
      "the folder's own listing on B must include the nested file"
    ).toBe(true)

    // ── (a) BYTES: before download, B must NOT have local bytes; download +
    // write (mirrors fetchMissingOrgBlobs exactly), then B can extract the
    // real replicated content. ────────────────────────────────────────────────
    const hadBytesBefore = await B.window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.workspaceSync.hasLocalFileBytes(id)
    }, rootFileId)
    expect(hadBytesBefore, 'B must not have file bytes yet — only metadata has landed so far').toBe(false)

    for (const [fileId, expectedContent] of [
      [rootFileId, ROOT_CONTENT],
      [nestedFileId, NESTED_CONTENT]
    ] as const) {
      const bytes = await downloadBlob(member.token, orgId, fileId)
      expect(bytes, `B (a real member) must be able to download ${fileId}'s bytes`).toBeTruthy()
      const wrote = await B.window.evaluate(
        async ({ id, arr }) => {
          const api = (window as unknown as { api: typeof window.api }).api
          return api.workspaceSync.writeSyncedFileBytes(id, new Uint8Array(arr))
        },
        { id: fileId, arr: Array.from(bytes!) }
      )
      expect(wrote, `writeSyncedFileBytes must succeed for ${fileId}`).toBe(true)

      const hasBytesAfter = await B.window.evaluate(async (id) => {
        const api = (window as unknown as { api: typeof window.api }).api
        return api.workspaceSync.hasLocalFileBytes(id)
      }, fileId)
      expect(hasBytesAfter, `B must report bytes present for ${fileId} after writing them`).toBe(true)

      const extracted = await B.window.evaluate(async (id) => {
        const api = (window as unknown as { api: typeof window.api }).api
        return api.files.extractText(id)
      }, fileId)
      expect(extracted, `B must extract the real replicated content for ${fileId}, not a stub`).toBe(expectedContent)
    }

    // ── (c) Brain ingest on B: ingestWorkspace() then knowledge.list() must
    // contain entries whose bodies are the files' real replicated content. ────
    const brainStats = await B.window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.brain.ingestWorkspace()
    })
    expect(
      (brainStats as unknown as { files: number }).files,
      "B's brain ingest must see at least the 2 synced files"
    ).toBeGreaterThanOrEqual(2)

    const bKnowledge = (await B.window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.knowledge.list()
    })) as unknown as KnowledgeEntryLike[]

    expect(
      bKnowledge.some((k) => k.body.includes(ROOT_CONTENT)),
      "B's Brain must hold a knowledge entry containing A's replicated root-file content"
    ).toBe(true)
    expect(
      bKnowledge.some((k) => k.body.includes(NESTED_CONTENT)),
      "B's Brain must hold a knowledge entry containing A's replicated nested-file content"
    ).toBe(true)
    expect(
      bKnowledge.some((k) => k.body.includes(PERSONAL_LEAK_CONTENT)),
      "B's Brain must never contain A's personal-scope file content"
    ).toBe(false)
  })
})

// ── Scenario (d): non-member gating + personal-scope isolation ────────────────
// HTTP-only, against the plain-http backend directly. Uses the same
// signup/createOrg/addMember helper pattern as orgSyncCrossMember.spec.ts.
test.describe('HTTP-only: non-member blob gating + personal-scope isolation', () => {
  async function putFileMeta(token: string, orgId: string, fileId: string, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${SIGNAL_BASE}/workspace/org/items/${fileId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: 'file', body })
    })
    const json = (await res.json()) as { ok: boolean; error?: string }
    if (!res.ok || !json.ok) throw new Error(`file metadata PUT failed (${res.status}): ${JSON.stringify(json)}`)
  }

  async function uploadBlobRaw(
    token: string,
    orgId: string,
    fileId: string,
    bytes: string
  ): Promise<{ status: number; json: { ok: boolean; error?: string; file?: { id: string; sizeBytes: number } } }> {
    const res = await fetch(`${SIGNAL_BASE}/workspace/org/files/${fileId}?ext=.txt&mime=text/plain`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId, 'Content-Type': 'application/octet-stream' },
      body: bytes
    })
    return { status: res.status, json: await res.json() }
  }

  async function downloadBlobRaw(
    token: string,
    orgId: string,
    fileId: string,
    meta = false
  ): Promise<{ status: number; ok: boolean; text?: string; json?: Record<string, unknown> }> {
    const res = await fetch(`${SIGNAL_BASE}/workspace/org/files/${fileId}${meta ? '?meta=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId }
    })
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      return { status: res.status, ok: res.ok, json: (await res.json()) as Record<string, unknown> }
    }
    return { status: res.status, ok: res.ok, text: await res.text() }
  }

  test('non-member cannot GET org file bytes (raw or ?meta=1) or upload/delete them; member can', async () => {
    const rand = Math.random().toString(36).slice(2, 8)
    const owner = await signup(`orgfilesync.owner.${rand}@example.com`, 'Test-Account-123!')
    const member = await signup(`orgfilesync.member.${rand}@example.com`, 'Test-Account-123!')
    const outsider = await signup(`orgfilesync.outsider.${rand}@example.com`, 'Test-Account-123!')
    const orgId = await createOrg(owner.token, `File Blob Gating Org ${rand}`)
    await addMember(owner.token, orgId, member.email)

    const fileId = `file_isolation_${rand}`
    const BYTES = 'isolation test bytes — member-gated content'

    // Owner registers the file's metadata, then uploads its bytes.
    await putFileMeta(owner.token, orgId, fileId, {
      id: fileId,
      parent_id: null,
      kind: 'file',
      original_name: 'isolation.txt',
      org_id: orgId
    })
    const upload = await uploadBlobRaw(owner.token, orgId, fileId, BYTES)
    expect(upload.status, 'owner upload must succeed').toBe(200)
    expect(upload.json.ok).toBe(true)

    // ── Positive control: MEMBER can read the bytes and the ?meta=1 probe ──────
    const memberDownload = await downloadBlobRaw(member.token, orgId, fileId)
    expect(memberDownload.status, 'a real member must be able to download the bytes').toBe(200)
    expect(memberDownload.text).toBe(BYTES)
    const memberMeta = await downloadBlobRaw(member.token, orgId, fileId, true)
    expect(memberMeta.status).toBe(200)
    expect((memberMeta.json as { exists?: boolean })?.exists).toBe(true)

    // ── Negative: a non-member (never invited) cannot download the bytes, even
    // with the x-plexi-org header set by hand to the real org id. ──────────────
    const outsiderDownload = await downloadBlobRaw(outsider.token, orgId, fileId)
    expect(outsiderDownload.status, 'non-member GET must be refused, not merely empty-but-ok').toBeGreaterThanOrEqual(400)
    expect(outsiderDownload.text ?? '').not.toBe(BYTES)

    // ── ?meta=1 existence probe is gated identically — a non-member cannot even
    // learn whether the blob exists. ───────────────────────────────────────────
    const outsiderMeta = await downloadBlobRaw(outsider.token, orgId, fileId, true)
    expect(outsiderMeta.status, 'non-member ?meta=1 probe must also be refused').toBeGreaterThanOrEqual(400)

    // ── Non-member cannot upload (spoof) or delete the blob either. ────────────
    const outsiderUpload = await uploadBlobRaw(outsider.token, orgId, fileId, 'spoofed content')
    expect(outsiderUpload.status, 'non-member upload must be refused').toBeGreaterThanOrEqual(400)
    expect(outsiderUpload.json.ok).not.toBe(true)
    // Confirm the spoofed upload never landed: the real bytes are still there.
    const afterSpoofAttempt = await downloadBlobRaw(member.token, orgId, fileId)
    expect(afterSpoofAttempt.text, 'a refused non-member upload must never overwrite the real blob').toBe(BYTES)

    const deleteRes = await fetch(`${SIGNAL_BASE}/workspace/org/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${outsider.token}`, 'x-plexi-org': orgId }
    })
    expect(deleteRes.status, 'non-member delete must be refused').toBeGreaterThanOrEqual(400)
    const afterDeleteAttempt = await downloadBlobRaw(member.token, orgId, fileId)
    expect(afterDeleteAttempt.status, 'a refused non-member delete must never remove the real blob').toBe(200)
  })

  test('a PERSONAL-scope file item is rejected by the org endpoint outright (no org bucket to leak into)', async () => {
    // The desktop app never even attempts this (collectPending, the personal
    // loop, has no fb_files query at all — proven directly against the real
    // main-process IPC in the live two-app test above). This is the server-side
    // backstop: even a hand-crafted request naming the reserved "personal"
    // pseudo-org is refused by sharedOrgFor's explicit exclusion, exactly like
    // every other item type on this endpoint.
    const rand = Math.random().toString(36).slice(2, 8)
    const solo = await signup(`orgfilesync.solo.${rand}@example.com`, 'Test-Account-123!')
    const res = await fetch(`${SIGNAL_BASE}/workspace/org/items/file_personal_${rand}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${solo.token}`, 'x-plexi-org': 'personal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: 'file', body: { id: `file_personal_${rand}`, kind: 'file' } })
    })
    const json = (await res.json()) as { ok: boolean }
    expect(res.status, 'the "personal" pseudo-org must never resolve to a real org bucket on the org endpoint').not.toBe(
      200
    )
    expect(json.ok).not.toBe(true)
  })
})
