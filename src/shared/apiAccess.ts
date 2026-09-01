// Shared PlexiAPI types. The local REST API exposes workspace data and a few
// create actions to scripts and tools on the same machine, gated by scoped
// tokens. A token's raw value is returned exactly once at creation and only its
// hash is stored, so it can never be read back.

export type ApiScope = 'read' | 'write'

export interface ApiTokenPublic {
  id: string
  name: string
  scopes: ApiScope[]
  createdAt: number
  lastUsedAt: number | null
}

export interface ApiServerConfig {
  enabled: boolean
  port: number
  // Always 127.0.0.1; surfaced so the UI can show the base URL honestly.
  host: string
  // The live running state, which can differ from `enabled` if the port was busy.
  running: boolean
}

export interface CreateTokenResult {
  token: ApiTokenPublic
  // The raw bearer token, shown once and never stored in clear.
  secret: string
}

// One documented endpoint, for the in-app reference so the API is self-describing.
export interface ApiEndpointDoc {
  method: 'GET' | 'POST'
  path: string
  scope: ApiScope
  summary: string
}

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  { method: 'GET', path: '/api/tasks', scope: 'read', summary: 'List tasks.' },
  { method: 'POST', path: '/api/tasks', scope: 'write', summary: 'Create a task. Body: { "title": "..." }.' },
  { method: 'GET', path: '/api/tables', scope: 'read', summary: 'List tables.' },
  { method: 'GET', path: '/api/tables/:id/rows', scope: 'read', summary: 'List rows in a table.' },
  { method: 'POST', path: '/api/tables/:id/rows', scope: 'write', summary: 'Add a row. Body: { "cells": { ... } }.' },
  { method: 'GET', path: '/api/knowledge', scope: 'read', summary: 'List knowledge entries.' },
  { method: 'POST', path: '/api/knowledge', scope: 'write', summary: 'Create a knowledge entry. Body: { "title": "...", "body": "..." }.' },
  // Recall over MCP: point any MCP client (Claude Code, Claude Desktop) at
  // this endpoint with a read token. Read-only tools: recall_search,
  // recall_meeting, recall_recent_meetings — attributed answers, never audio.
  { method: 'POST', path: '/mcp', scope: 'read', summary: 'MCP endpoint — search meeting transcripts from AI tools (read-only).' }
]
