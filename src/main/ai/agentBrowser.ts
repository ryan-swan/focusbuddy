import { webContents } from 'electron'

// Browser control for desk agents. When an agent is wired to a browser, we give
// the model a small set of tools to DRIVE that browser — read the current page,
// open a URL, or run a web search — executed against the live webview's
// webContents in the main process (reliable, authenticated, post-JS). This is
// what turns "summarize what's on screen" into "go and research this".

export const BROWSER_TOOLS = [
  {
    name: 'read_current_page',
    description: 'Read the visible text of the page currently open in the wired browser.',
    input_schema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'open_url',
    description: 'Navigate the wired browser to a URL and read the resulting page text.',
    input_schema: {
      type: 'object' as const,
      properties: { url: { type: 'string', description: 'The absolute URL to open.' } },
      required: ['url']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web and read the results page. Use to find sources for a topic.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'The search query.' } },
      required: ['query']
    }
  }
]

function wcFor(wcId: number): Electron.WebContents | null {
  const wc = webContents.fromId(wcId)
  return wc && !wc.isDestroyed() ? wc : null
}

async function readPage(wcId: number): Promise<string> {
  const wc = wcFor(wcId)
  if (!wc) return '(the wired browser is no longer available)'
  try {
    const text = (await wc.executeJavaScript(
      'document.body ? document.body.innerText : ""',
      true
    )) as unknown
    const url = wc.getURL()
    const body = typeof text === 'string' ? text.replace(/\n{3,}/g, '\n\n').slice(0, 9000) : ''
    return `URL: ${url}\n\n${body || '(the page has no readable text yet)'}`
  } catch (e) {
    return `(could not read the page: ${(e as Error).message})`
  }
}

async function navigate(wcId: number, rawUrl: string): Promise<string> {
  const wc = wcFor(wcId)
  if (!wc) return '(the wired browser is no longer available)'
  let target = rawUrl.trim()
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`
  try {
    await wc.loadURL(target)
    // Let client-rendered pages settle before reading.
    await new Promise((r) => setTimeout(r, 1000))
    return readPage(wcId)
  } catch (e) {
    return `(could not open ${target}: ${(e as Error).message})`
  }
}

export async function runBrowserTool(
  wcId: number,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'read_current_page':
      return readPage(wcId)
    case 'open_url':
      return navigate(wcId, String(input.url ?? ''))
    case 'web_search':
      return navigate(
        wcId,
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(input.query ?? ''))}`
      )
    default:
      return `(unknown tool: ${name})`
  }
}
