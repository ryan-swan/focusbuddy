import { net } from 'electron'
import { resolveTenorKey } from './settingsStore'

// GIF search via Google's Tenor API. The key lives in the encrypted settings
// store and never reaches the renderer; the renderer asks main to search. Without
// a key the picker shows an honest "add a key" state rather than fabricating GIFs.

export interface GifResult {
  id: string
  // A small preview to show in the grid.
  previewUrl: string
  // The full gif to actually send (downloaded + uploaded as an attachment).
  url: string
  width: number
  height: number
  description: string
}

export type GifSearchResult =
  | { ok: true; results: GifResult[] }
  | { ok: false; needsKey: true }
  | { ok: false; error: string }

interface TenorMediaFormat {
  url: string
  dims?: [number, number]
}
interface TenorObject {
  id: string
  content_description?: string
  media_formats?: Record<string, TenorMediaFormat>
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    let body = ''
    request.on('response', (response) => {
      response.on('data', (chunk) => (body += chunk.toString()))
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

// Search Tenor for `query`. An empty query returns the featured/trending set so
// the picker has something to show on open.
export async function searchGifs(query: string, limit = 24): Promise<GifSearchResult> {
  const key = resolveTenorKey()
  if (!key) return { ok: false, needsKey: true }
  const trimmed = query.trim()
  const base = trimmed
    ? 'https://tenor.googleapis.com/v2/search'
    : 'https://tenor.googleapis.com/v2/featured'
  const params = new URLSearchParams({
    key,
    client_key: 'plexidesk',
    limit: String(Math.min(50, Math.max(1, limit))),
    media_filter: 'tinygif,gif',
    contentfilter: 'medium'
  })
  if (trimmed) params.set('q', trimmed)
  try {
    const json = (await fetchJson(`${base}?${params.toString()}`)) as { results?: TenorObject[] }
    const results: GifResult[] = (json.results ?? [])
      .map((r) => {
        const tiny = r.media_formats?.tinygif ?? r.media_formats?.gif
        const full = r.media_formats?.gif ?? r.media_formats?.tinygif
        if (!tiny || !full) return null
        return {
          id: r.id,
          previewUrl: tiny.url,
          url: full.url,
          width: full.dims?.[0] ?? 0,
          height: full.dims?.[1] ?? 0,
          description: r.content_description ?? 'GIF'
        }
      })
      .filter((g): g is GifResult => g !== null)
    return { ok: true, results }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'GIF search failed.' }
  }
}
