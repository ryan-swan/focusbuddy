import { getTable, listRows } from '../db/tables'
import type { Widget } from '@shared/types'

// Turn a wired-in widget into readable content a desk agent can actually reason
// over. The naive version handed the model whatever was in widget.content, which
// for a browser is just a URL and for a table is just an opaque id — so the
// agent would say "I only see a link, I can't browse the web". Here we resolve
// each kind to real content, and crucially we FETCH the page for a browser so a
// research agent has the actual text to work with (the fetch happens in the main
// process, which has network access and isn't bound by the renderer CSP).

function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s)?.[1]?.trim() ?? ''
  s = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return (title ? `Page title: ${title}\n\n` : '') + s
}

async function fetchPageText(url: string): Promise<string> {
  let target = url.trim()
  if (!target) return '(no URL)'
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // A real UA so sites don't serve a bot wall; identify ourselves too.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) FocusBuddyDeskAgent/1.0'
      }
    })
    clearTimeout(timer)
    if (!res.ok) return `(could not load ${target}: HTTP ${res.status})`
    const ctype = res.headers.get('content-type') ?? ''
    if (!/text|html|json|xml/i.test(ctype)) return `(${target} is ${ctype || 'a non-text resource'})`
    const body = await res.text()
    const text = /json/i.test(ctype) ? body : htmlToText(body)
    return text.slice(0, 7000)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `(could not load ${target}: ${msg})`
  }
}

function tiptapText(s: string): string {
  const out: string[] = []
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && out.length < 200) out.push(m[1])
  return out.join(' ').replace(/\\n/g, ' ')
}

function tableText(tableId: string): string {
  const table = getTable(tableId)
  if (!table) return '(table not found)'
  const cols = table.schema.columns
  const header = cols.map((c) => c.label).join(' | ')
  const rows = listRows(tableId)
    .slice(0, 40)
    .map((r) => cols.map((c) => r.cells[c.id] ?? '').join(' | '))
  return [`Table "${table.title}"`, header, ...rows].join('\n')
}

export interface AgentInput {
  kind: string
  title: string
  content: string
}

export async function describeWidgetForAgent(w: Widget, liveText?: string): Promise<AgentInput> {
  const base = { kind: w.kind, title: w.title ?? '' }
  const raw = w.content ?? ''
  switch (w.kind) {
    case 'webview': {
      // Prefer the live, authenticated, rendered page text captured from the
      // mounted webview; only fall back to a server-side fetch when it wasn't
      // available (page not mounted).
      const page = liveText && liveText.trim() ? liveText : await fetchPageText(raw)
      return { ...base, content: `Browser tab at ${raw || '(no URL)'}\n\n${page}` }
    }
    case 'table':
      return { ...base, content: raw ? tableText(raw) : '(empty table)' }
    case 'page':
      return { ...base, content: tiptapText(raw) || '(empty document)' }
    case 'field':
      try {
        const p = JSON.parse(raw || '{}') as { def?: { label?: string }; value?: unknown }
        return { ...base, content: `${p.def?.label ?? 'Field'}: ${JSON.stringify(p.value ?? '')}` }
      } catch {
        return { ...base, content: raw }
      }
    case 'card':
      try {
        const p = JSON.parse(raw || '{}') as { title?: string; body?: string }
        return { ...base, content: `${p.title ?? ''}\n${p.body ?? ''}`.trim() }
      } catch {
        return { ...base, content: raw }
      }
    case 'agent':
      try {
        return { ...base, content: (JSON.parse(raw || '{}') as { lastOutput?: string }).lastOutput ?? '' }
      } catch {
        return { ...base, content: '' }
      }
    case 'file':
    case 'image':
      return { ...base, content: raw ? `File/link: ${raw}` : '(empty file)' }
    default:
      return { ...base, content: raw }
  }
}
