import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { verifyToken, getApiConfig } from './db/apiTokens'
import { listNodes, createNode } from './db/nodes'
import { listTables, listRows, createRow } from './db/tables'
import { listKnowledge, createKnowledge } from './db/knowledge'
import type { ApiScope } from '@shared/apiAccess'

// The PlexiAPI local server. A small REST surface over the workspace, bound only
// to 127.0.0.1 so it is never reachable off the machine, and gated by a bearer
// token whose scopes decide read versus write. It is started only when the user
// enables it; nothing here opens a port on its own. Every handler reads and
// writes the same real stores the app uses, so the API can never return invented
// data, and an unknown token gets a clean 401 rather than any data at all.

const HOST = '127.0.0.1'

let server: Server | null = null
let runningPort = 0

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(json)
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      // Guard against an oversized body on a local tool endpoint.
      if (raw.length > 1_000_000) raw = raw.slice(0, 1_000_000)
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(null) // signal malformed JSON
      }
    })
    req.on('error', () => resolve({}))
  })
}

function authScopes(req: IncomingMessage): ApiScope[] | null {
  const header = req.headers['authorization']
  if (!header || Array.isArray(header)) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const found = verifyToken(m[1].trim())
  return found ? found.scopes : null
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${HOST}`)
  const path = url.pathname
  const method = (req.method || 'GET').toUpperCase()

  if (path === '/api/health') return send(res, 200, { ok: true })

  const scopes = authScopes(req)
  if (!scopes) return send(res, 401, { error: 'Missing or invalid bearer token.' })

  const needWrite = method === 'POST'
  if (needWrite && !scopes.includes('write')) return send(res, 403, { error: 'This token is read-only.' })
  if (!needWrite && !scopes.includes('read') && !scopes.includes('write'))
    return send(res, 403, { error: 'This token has no read scope.' })

  // GET /api/tasks
  if (method === 'GET' && path === '/api/tasks') {
    const tasks = listNodes().filter((n) => n.kind === 'task').map((n) => ({ id: n.id, title: n.title, status: n.status }))
    return send(res, 200, { tasks })
  }
  // POST /api/tasks
  if (method === 'POST' && path === '/api/tasks') {
    const body = (await readBody(req)) as { title?: string } | null
    if (body === null) return send(res, 400, { error: 'Malformed JSON body.' })
    const node = createNode({ parentId: null, kind: 'task', title: (body.title || 'Untitled task').toString() })
    return send(res, 201, { task: { id: node.id, title: node.title } })
  }
  // GET /api/tables
  if (method === 'GET' && path === '/api/tables') {
    return send(res, 200, { tables: listTables().map((t) => ({ id: t.id, title: t.title })) })
  }
  // /api/tables/:id/rows
  const rowsMatch = path.match(/^\/api\/tables\/([^/]+)\/rows$/)
  if (rowsMatch) {
    const tableId = decodeURIComponent(rowsMatch[1])
    if (method === 'GET') return send(res, 200, { rows: listRows(tableId).map((r) => ({ id: r.id, cells: r.cells })) })
    if (method === 'POST') {
      const body = (await readBody(req)) as { cells?: Record<string, unknown> } | null
      if (body === null) return send(res, 400, { error: 'Malformed JSON body.' })
      const row = createRow({ tableId, cells: body.cells ?? {} })
      return send(res, 201, { row: { id: row.id, cells: row.cells } })
    }
  }
  // GET /api/knowledge
  if (method === 'GET' && path === '/api/knowledge') {
    return send(res, 200, { knowledge: listKnowledge().map((k) => ({ id: k.id, title: k.title, body: k.body })) })
  }
  // POST /api/knowledge
  if (method === 'POST' && path === '/api/knowledge') {
    const body = (await readBody(req)) as { title?: string; body?: string } | null
    if (body === null) return send(res, 400, { error: 'Malformed JSON body.' })
    const entry = createKnowledge({ title: (body.title || 'Untitled entry').toString(), body: (body.body || '').toString() })
    return send(res, 201, { knowledge: { id: entry.id, title: entry.title } })
  }

  return send(res, 404, { error: 'Unknown endpoint.' })
}

// Start the server on the given port, bound to localhost only. Resolves with the
// running state: ok false (and a reason) when the port is busy, so the UI can be
// honest rather than claim a server that is not actually listening.
export function startApiServer(port: number): Promise<{ ok: boolean; port: number; error?: string }> {
  return new Promise((resolve) => {
    if (server) {
      resolve({ ok: true, port: runningPort })
      return
    }
    const s = createServer((req, res) => {
      void handle(req, res).catch(() => send(res, 500, { error: 'Internal error.' }))
    })
    s.once('error', (err: NodeJS.ErrnoException) => {
      server = null
      resolve({ ok: false, port, error: err.code === 'EADDRINUSE' ? `Port ${port} is in use.` : err.message })
    })
    s.listen(port, HOST, () => {
      server = s
      runningPort = port
      resolve({ ok: true, port })
    })
  })
}

export function stopApiServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve()
    server.close(() => {
      server = null
      runningPort = 0
      resolve()
    })
  })
}

export function isApiServerRunning(): boolean {
  return server !== null
}

export function runningApiPort(): number {
  return runningPort
}

// On app start, bring the server up only if the user previously enabled it.
export async function initApiServer(): Promise<void> {
  const cfg = getApiConfig()
  if (cfg.enabled) await startApiServer(cfg.port)
}
