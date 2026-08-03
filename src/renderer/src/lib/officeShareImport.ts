import type { FbDocument } from '@shared/types'
import type { DocFolderEntry, DocFolderSnapshot } from './shareSnapshot'

// Import side of folder sharing. Deliberately free of any editor / HTML-render
// imports (unlike officeShareSnapshot, which renders previews) so it stays light
// and unit-testable: it only reads a snapshot and writes through window.api.

// Count the documents in a folder tree (for "N documents" UI + sanity checks).
export function countDocs(items: DocFolderEntry[]): number {
  return items.reduce((n, it) => n + (it.type === 'document' ? 1 : countDocs(it.items ?? [])), 0)
}

// Import a shared folder tree into the recipient's Drive under parentId, creating
// real, editable copies of each document. Returns the new root folder id.
export async function materializeDocFolder(
  snapshot: DocFolderSnapshot,
  parentId: string | null
): Promise<string> {
  const root = await window.api.fileManager.createFolder(parentId, snapshot.name)
  await materializeEntries(snapshot.items, root.id)
  return root.id
}

async function materializeEntries(items: DocFolderEntry[], parentId: string): Promise<void> {
  for (const it of items) {
    if (it.type === 'folder') {
      const f = await window.api.fileManager.createFolder(parentId, it.name)
      await materializeEntries(it.items ?? [], f.id)
    } else if (it.type === 'document' && it.body !== undefined && it.docType) {
      const doc = await window.api.documents.create({
        docType: it.docType,
        title: it.name,
        body: it.body as FbDocument['body']
      })
      await window.api.fileManager.fileDocument(doc.id, parentId)
    }
  }
}
