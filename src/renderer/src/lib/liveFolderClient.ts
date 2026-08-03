// REST client for live-folder file blobs on the signal server. Pure fetch in
// the renderer (main doesn't proxy network), Bearer-authed like docCollabClient.
// Upload sends the raw bytes as an octet-stream body with metadata in the query
// string; download returns the raw bytes. These are what move real files
// between members of a shared folder.

import { signalConfig } from './signalConfig'

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

// Upload one file's bytes to a live folder. Returns the server blob id to store
// in the folder body, or null on failure (caller records the file with no
// blobId, which the UI surfaces honestly as "not uploaded").
export async function uploadLiveFile(
  token: string,
  liveId: string,
  input: { bytes: ArrayBuffer; name: string; mime: string; ext: string }
): Promise<string | null> {
  const qs = new URLSearchParams({
    name: input.name.slice(0, 400),
    mime: input.mime || 'application/octet-stream',
    ext: input.ext || ''
  }).toString()
  try {
    const res = await fetch(urlFor(`/livedocs/${liveId}/files?${qs}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: input.bytes
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; file?: { id: string } }
    return json?.ok ? json.file?.id ?? null : null
  } catch {
    return null
  }
}

// Download one file's bytes from a live folder by its server blob id. Returns
// null on any failure (not a member, missing, network) so the caller shows an
// honest error rather than a corrupt file.
export async function downloadLiveFile(
  token: string,
  liveId: string,
  blobId: string
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(urlFor(`/livedocs/${liveId}/files/${blobId}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}
