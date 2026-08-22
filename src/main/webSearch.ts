// Web search for the chat's grounding pass (facelift F4 — commissioned by
// Caleb: the assistant's credibility must extend to the web, with the same
// trace-of-links grammar the workspace sources carry).
//
// Same engine the desk agents already drive (html.duckduckgo.com — keyless,
// account-free), but fetched directly in the main process instead of through
// a wired webview, so the CHAT can search without any browser widget on the
// canvas. Best-effort by design: a timeout, a parse miss, or an offline
// machine yields [] and the chat proceeds on workspace grounding alone —
// web search must never block or break an answer.
//
// The parser is exported pure so the result-extraction rules are unit-locked.

export interface WebResult {
  title: string
  url: string
  domain: string
  snippet: string
}

// DuckDuckGo's html endpoint wraps result links as
//   <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=<enc>&…">Title</a>
// with a sibling  <a class="result__snippet">…</a>. Hrefs are redirect links;
// the real target rides in the uddg param.
export function parseDdgHtml(html: string, limit = 5): WebResult[] {
  const out: WebResult[] = []
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  const strip = (s: string): string =>
    s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  const snippets: string[] = []
  for (let m = snippetRe.exec(html); m; m = snippetRe.exec(html)) snippets.push(strip(m[1]))
  let i = 0
  for (let m = linkRe.exec(html); m && out.length < limit; m = linkRe.exec(html), i++) {
    const raw = m[1]
    let url = raw
    const uddg = /[?&]uddg=([^&]+)/.exec(raw)
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1])
      } catch {
        /* keep raw */
      }
    }
    if (url.startsWith('//')) url = `https:${url}`
    if (!/^https?:\/\//i.test(url)) continue
    // DuckDuckGo's own ad/redirect rows are not sources.
    let domain = ''
    try {
      domain = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (domain.endsWith('duckduckgo.com')) continue
    const title = strip(m[2])
    if (!title) continue
    out.push({ title, url, domain, snippet: snippets[i] ?? '' })
  }
  return out
}

// Queries this short are follow-ups ("yes", "do it"), not research questions;
// searching the web for them is noise wearing a trenchcoat.
export const WEB_SEARCH_MIN_QUERY = 15

export async function searchWeb(query: string, limit = 5): Promise<WebResult[]> {
  const q = query.trim()
  if (q.length < WEB_SEARCH_MIN_QUERY) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: {
        // The html endpoint serves plain results to anything that looks like a
        // browser; the default undici UA gets a captcha page instead.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
      }
    })
    if (!res.ok) return []
    return parseDdgHtml(await res.text(), limit)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
