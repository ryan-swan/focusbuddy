// AI image generation for PlexiDesign, via OpenAI's gpt-image-1.
//
// Honest by construction: image generation only happens when the user has a real
// OpenAI key set (the same encrypted key the transcription pipeline uses). With
// no key we return needsKey:true so the editor shows an "add a key" affordance,
// never a fake or placeholder image. A real generated image comes back as a PNG
// data URI, ready to drop onto the canvas as an image element.

import { resolveOpenAIKey } from './settingsStore'

export interface ImageGenResult {
  ok: boolean
  dataUrl?: string
  error?: string
  // True when the only thing missing is an API key, so the UI can prompt for one
  // rather than showing a generic failure.
  needsKey?: boolean
}

// gpt-image-1 supports a fixed set of sizes. Pick the one whose aspect ratio is
// closest to the design canvas so the generated image fills the frame well.
function pickSize(w: number, h: number): '1024x1024' | '1024x1536' | '1536x1024' {
  const ratio = w / h
  if (ratio > 1.2) return '1536x1024' // landscape
  if (ratio < 0.83) return '1024x1536' // portrait
  return '1024x1024' // square-ish
}

function shorten(s: string, n = 200): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

export async function generateImage(input: { prompt: string; width?: number; height?: number }): Promise<ImageGenResult> {
  const prompt = (input.prompt || '').trim()
  if (!prompt) return { ok: false, error: 'Describe the image you want before generating.' }

  const key = resolveOpenAIKey()
  if (!key) {
    return {
      ok: false,
      needsKey: true,
      error: 'Add your OpenAI API key in Settings → API Keys to generate images.'
    }
  }

  const size = pickSize(input.width ?? 1024, input.height ?? 1024)
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 })
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      // 401 means the key is present but rejected; surface that clearly.
      if (res.status === 401) return { ok: false, needsKey: true, error: 'Your OpenAI key was rejected. Check it in Settings → API Keys.' }
      return { ok: false, error: `Image generation failed (${res.status}): ${shorten(txt)}` }
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
    const item = json.data?.[0]
    if (item?.b64_json) return { ok: true, dataUrl: `data:image/png;base64,${item.b64_json}` }
    if (item?.url) return { ok: true, dataUrl: item.url }
    return { ok: false, error: 'The image service returned no image.' }
  } catch (e) {
    return { ok: false, error: `Could not reach the image service: ${(e as Error).message}` }
  }
}
