import { describe, it, expect, beforeEach, vi } from 'vitest'
import { materializeDocFolder, countDocs } from '../../src/renderer/src/lib/officeShareImport'
import type { DocFolderSnapshot } from '../../src/renderer/src/lib/shareSnapshot'

// Verifies the Phase-2 folder import (the riskiest, server-independent part):
// materialize a shared snapshot back into a faked Drive. The build side is
// exercised by the office e2e (PO-8), since it renders previews through the
// editor stack that this unit context can't import.

function installApi() {
  const created: {
    folders: Array<{ parentId: string | null; name: string }>
    docs: unknown[]
    filed: Array<{ docId: string; parentId: string }>
  } = { folders: [], docs: [], filed: [] }
  let seq = 0
  ;(globalThis as unknown as { window: unknown }).window = {
    api: {
      fileManager: {
        createFolder: async (parentId: string | null, name: string) => {
          created.folders.push({ parentId, name })
          return { id: `f${++seq}`, kind: 'folder', name, parentId }
        },
        fileDocument: async (docId: string, parentId: string) => {
          created.filed.push({ docId, parentId })
          return null
        }
      },
      documents: {
        create: async (draft: unknown) => {
          created.docs.push(draft)
          return { id: `d${++seq}`, ...(draft as object) }
        }
      }
    }
  }
  return created
}

describe('officeShareImport — folder import round-trip', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('countDocs counts documents across nested folders', () => {
    expect(
      countDocs([
        { type: 'document', name: 'A' },
        { type: 'folder', name: 'F', items: [{ type: 'document', name: 'B' }, { type: 'document', name: 'C' }] }
      ])
    ).toBe(3)
  })

  it('materializes a snapshot into the Drive (folders + real document copies)', async () => {
    const created = installApi()
    const snap: DocFolderSnapshot = {
      _version: 1,
      kind: 'docfolder',
      fromHandle: 'tester',
      capturedAt: 0,
      name: 'Shared',
      items: [
        { type: 'document', name: 'A', docType: 'doc', html: '<p/>', body: { type: 'doc' } },
        {
          type: 'folder',
          name: 'Inner',
          items: [{ type: 'document', name: 'B', docType: 'sheet', html: '<table/>', body: { columns: [], rows: [] } }]
        }
      ]
    }
    await materializeDocFolder(snap, null)
    // Root folder + the inner folder were created.
    expect(created.folders.map((f) => f.name)).toEqual(['Shared', 'Inner'])
    // Both documents were created and filed.
    expect(created.docs).toHaveLength(2)
    expect(created.filed).toHaveLength(2)
  })
})
