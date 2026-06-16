import type { Widget } from '@shared/types'
import { summariseWidget } from './widgetSummary'
import { aggregatePortalContent } from './portalAggregate'

// Turn a wired-in widget into readable content a desk agent can actually reason
// over. Most kinds use the shared, network-free summariser; two are special:
// a browser is FETCHED (or uses its live page text) so a research agent has the
// real page, and a portal is AGGREGATED so an agent wired to it sees that whole
// desk (and any desks inherited into the portal).

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
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) PlexiDeskDeskAgent/1.0'
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

export interface AgentInput {
  kind: string
  title: string
  content: string
}

export async function describeWidgetForAgent(w: Widget, liveText?: string): Promise<AgentInput> {
  const base = { kind: w.kind, title: w.title ?? '' }
  // Browser: real page text (live or fetched), the one async case.
  if (w.kind === 'webview') {
    const raw = w.content ?? ''
    const page = liveText && liveText.trim() ? liveText : await fetchPageText(raw)
    return { ...base, content: `Browser tab at ${raw || '(no URL)'}\n\n${page}` }
  }
  // Portal: aggregate the whole desk it points at, plus anything inherited into
  // it (control room). Cycle + depth guards live in the aggregator.
  if (w.kind === 'portal') {
    return { ...base, content: aggregatePortalContent(w) }
  }
  // Everything else: the shared, network-free summary.
  return { ...base, content: summariseWidget(w) }
}
