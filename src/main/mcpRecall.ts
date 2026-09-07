// Recall over MCP — the G3 round (deferred at DEC-103, built here).
//
// External AI tools (Claude Code, Claude Desktop, anything speaking MCP over
// Streamable HTTP) get a READ-ONLY door into the meeting corpus: search the
// attributed segments, read a meeting's record, list what exists. Every
// answer carries its attribution — a speaker, a timestamp, a meeting —
// because a Recall answer without provenance is just a rumour with an API.
//
// Transport and auth are NOT this module's problem, on purpose: the endpoint
// mounts as POST /mcp on the existing PlexiAPI server (apiServer.ts) behind
// everything it already enforces — 127.0.0.1 binding, bearer tokens, the
// Origin rejection and the DNS-rebind host guard, user-enabled only. MCP
// speaks POST for reads, so the route requires the READ scope explicitly
// rather than riding the server's method-based write gate.
//
// The refusals, stated where they are enforced:
//   - READ-ONLY forever: no tool on this surface writes, files, or sends.
//   - No audio: bytes never leave the machine (CR-11/CR-13); MCP gets text.
//   - No reach: loopback only, token required — both inherited, both real.
//
// The protocol layer is hand-rolled JSON-RPC 2.0 (initialize, ping,
// tools/list, tools/call, notifications) — the full SDK would be a
// dependency for three read-only tools. Stateless by design: the spec lets
// a Streamable HTTP server skip session ids, and every reply is plain JSON.

import { searchMeetingSegments, attributedLine } from './segmentRecall'
import { getMeeting, listMeetings } from './db/meetings'
import { listTranscriptSegments } from './db/transcripts'

// Protocol versions we can honestly speak. The client's offer is echoed when
// known; otherwise we answer with our newest and let the client decide.
const KNOWN_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const DEFAULT_VERSION = '2025-03-26'

export interface McpDeps {
  searchSegments: typeof searchMeetingSegments
  getMeeting: typeof getMeeting
  listMeetings: typeof listMeetings
  listSegments: typeof listTranscriptSegments
  serverVersion: string
}

interface RpcMessage {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

type RpcReply = Record<string, unknown> | null

const TOOLS = [
  {
    name: 'recall_search',
    description:
      'Search everything said across recorded Plexii meetings. Returns attributed lines — ' +
      'speaker, timestamp, meeting — never a paraphrase. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for (free text).' },
        limit: { type: 'number', description: 'Max hits (default 12).' }
      },
      required: ['query']
    }
  },
  {
    name: 'recall_meeting',
    description:
      'Read one meeting: title, date, summary, action items, and its attributed transcript. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        meetingId: { type: 'string', description: 'The meeting id (from recall_search or recall_recent_meetings).' }
      },
      required: ['meetingId']
    }
  },
  {
    name: 'recall_recent_meetings',
    description: 'List recent Plexii meetings (id, title, date) so a meeting can be picked. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max meetings (default 20).' } }
    }
  }
]

function text(s: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: s }] }
}

function toolError(s: string): Record<string, unknown> {
  return { ...text(s), isError: true }
}

const TRANSCRIPT_CHAR_CAP = 24_000

function runTool(name: string, args: Record<string, unknown>, deps: McpDeps): Record<string, unknown> {
  if (name === 'recall_search') {
    const query = String(args.query ?? '').trim()
    if (!query) return toolError('recall_search needs a query.')
    const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 50) : 12
    const hits = deps.searchSegments(query, limit)
    if (hits.length === 0) return text('No spoken lines match that query — an honest zero, not a failure.')
    const lines = hits.map(
      (h) =>
        `${attributedLine(h)}\n    — in “${h.meetingTitle}” (meetingId: ${h.meetingId})`
    )
    return text(lines.join('\n'))
  }
  if (name === 'recall_meeting') {
    const id = String(args.meetingId ?? '').trim()
    const m = id ? deps.getMeeting(id) : null
    if (!m) return toolError('No meeting with that id.')
    const segs = deps.listSegments(m.id)
    let transcript = segs.map((s) => attributedLine(s)).join('\n')
    let truncated = false
    if (transcript.length > TRANSCRIPT_CHAR_CAP) {
      transcript = transcript.slice(0, TRANSCRIPT_CHAR_CAP)
      truncated = true
    }
    const parts = [
      `# ${m.title}`,
      `Date: ${new Date(m.createdAt).toISOString()}`,
      m.summary ? `\n## Summary\n${m.summary}` : '',
      m.actionItems.length ? `\n## Action items\n${m.actionItems.map((a) => `- ${a}`).join('\n')}` : '',
      segs.length
        ? `\n## Transcript (attributed)\n${transcript}${truncated ? '\n[… truncated — the full transcript lives in Plexii]' : ''}`
        : '\n(No attributed transcript for this meeting.)'
    ]
    return text(parts.filter(Boolean).join('\n'))
  }
  if (name === 'recall_recent_meetings') {
    const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 100) : 20
    const rows = deps.listMeetings().slice(0, limit)
    if (rows.length === 0) return text('No meetings recorded yet.')
    return text(
      rows
        .map((m) => `${m.id} · ${m.title} · ${new Date(m.createdAt).toISOString().slice(0, 10)}`)
        .join('\n')
    )
  }
  return toolError(`Unknown tool: ${name}`)
}

/** One JSON-RPC message in, one reply out (null = notification, no body). */
export function handleMcpMessage(msg: RpcMessage, deps: McpDeps): RpcReply {
  const id = msg.id ?? null
  const reply = (result: unknown): RpcReply => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string): RpcReply => ({ jsonrpc: '2.0', id, error: { code, message } })

  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return fail(-32600, 'Invalid JSON-RPC 2.0 request.')
  }
  // Notifications carry no id and get no reply body.
  if (msg.method.startsWith('notifications/')) return null

  switch (msg.method) {
    case 'initialize': {
      const offered = String((msg.params?.protocolVersion as string) ?? '')
      return reply({
        protocolVersion: KNOWN_VERSIONS.includes(offered) ? offered : DEFAULT_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'plexii-recall', version: deps.serverVersion }
      })
    }
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>
      try {
        return reply(runTool(name, args, deps))
      } catch (err) {
        return reply(toolError(`Tool failed: ${err instanceof Error ? err.message : 'unknown error'}`))
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`)
  }
}

/** The HTTP body handler the PlexiAPI route calls: single message or (older
 *  clients) a batch array. Returns null when nothing needs a body (202). */
export function handleMcpBody(body: unknown, deps: McpDeps): RpcReply | RpcReply[] {
  if (Array.isArray(body)) {
    const replies = body
      .map((m) => handleMcpMessage((m ?? {}) as RpcMessage, deps))
      .filter((r): r is Record<string, unknown> => r !== null)
    return replies.length ? replies : null
  }
  return handleMcpMessage((body ?? {}) as RpcMessage, deps)
}

/** Real-store deps for the live route. */
export function liveMcpDeps(serverVersion: string): McpDeps {
  return {
    searchSegments: searchMeetingSegments,
    getMeeting,
    listMeetings,
    listSegments: listTranscriptSegments,
    serverVersion
  }
}
