import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'task')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 3,
  interest INTEGER NOT NULL DEFAULT 3,
  importance INTEGER NOT NULL DEFAULT 3,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  x INTEGER NOT NULL DEFAULT 50,
  y INTEGER NOT NULL DEFAULT 50,
  width INTEGER NOT NULL DEFAULT 320,
  height INTEGER NOT NULL DEFAULT 240,
  z_index INTEGER NOT NULL DEFAULT 1,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_task_id TEXT,
  widgets_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS browsing_history (
  url TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  task_id TEXT,
  first_visited_at INTEGER NOT NULL,
  last_visited_at INTEGER NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT '5min',
  planned_seconds INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  actual_seconds INTEGER,
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS connected_apps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'apps',
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  dashboard_key TEXT PRIMARY KEY,
  card_ids TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  verifier_iv TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  username TEXT,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('low', 'medium', 'high'))
);

-- ── Uploaded files (attachments, image/PDF/video/audio widgets) ──────────────
-- We copy any file the user drops onto PlexiDesk into userData/files/<id>.<ext>
-- so it survives moves of the original. fb_files holds the metadata; the
-- on-disk path is reconstructed from id + ext at read time.
CREATE TABLE IF NOT EXISTS fb_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  ext TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ── Notion/Airtable-style database tables ────────────────────────────────────
-- Each fb_table is a logical "database": user-named, scoped to a task or
-- global. Schema (columns) lives as JSON in schema_json so we don't need a
-- migration per column-type change. Rows live in fb_rows, one row per record,
-- with cells_json mapping columnId → value.
CREATE TABLE IF NOT EXISTS fb_tables (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled',
  schema_json TEXT NOT NULL DEFAULT '{"columns":[]}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fb_rows (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES fb_tables(id) ON DELETE CASCADE,
  cells_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_rows_table_sort ON fb_rows(table_id, sort_order ASC);

-- ── PlexiBrain knowledge base ────────────────────────────────────────────────
-- Curated company knowledge that both people and the AI read from. tags_json is
-- a JSON string array; pinned entries sort first and are surfaced first to the
-- assistant's grounding.
CREATE TABLE IF NOT EXISTS fb_knowledge (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled entry',
  body TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_knowledge_updated ON fb_knowledge(pinned DESC, updated_at DESC);

-- ── PlexiMeet meetings ───────────────────────────────────────────────────────
-- Recorded or noted meetings with transcript, AI summary and extracted action
-- items (action_items_json is a JSON string array).
CREATE TABLE IF NOT EXISTS fb_meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled meeting',
  transcript TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  action_items_json TEXT NOT NULL DEFAULT '[]',
  duration_sec INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_meetings_created ON fb_meetings(created_at DESC);

-- ── PlexiBuild apps ──────────────────────────────────────────────────────────
-- No-code apps: a named component stack (components_json) built and run in-app.
CREATE TABLE IF NOT EXISTS fb_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled app',
  icon TEXT NOT NULL DEFAULT 'widgets',
  components_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_apps_updated ON fb_apps(updated_at DESC);

-- ── PlexiForms forms ─────────────────────────────────────────────────────────
-- A form points at a backing fb_tables table (fields = columns, responses =
-- rows). table_id references that table.
CREATE TABLE IF NOT EXISTS fb_forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled form',
  description TEXT NOT NULL DEFAULT '',
  table_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_forms_updated ON fb_forms(updated_at DESC);

-- ── PlexiSign signature requests ─────────────────────────────────────────────
-- One signature request ("envelope"): the agreement body, an ordered set of
-- signers (JSON), an append-ordered audit trail (JSON, ordering maintained by the
-- engine, not a cryptographic chain), and a completion certificate (sha256 over
-- body + signatures). Self-contained, local-first.
CREATE TABLE IF NOT EXISTS fb_sign_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled agreement',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  signers TEXT NOT NULL DEFAULT '[]',
  audit TEXT NOT NULL DEFAULT '[]',
  certificate TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fb_sign_updated ON fb_sign_requests(updated_at DESC);

-- ── Semantic-retrieval embeddings ────────────────────────────────────────────
-- A vector store keyed by (item_type, item_id): one table for knowledge,
-- document and future embeddings. vector_json is a JSON float array; dim + model
-- are recorded so a model change can be reindexed. Powers semantic search and AI
-- grounding; populated only when an embedding key is configured.
CREATE TABLE IF NOT EXISTS fb_embeddings (
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_type, item_id)
);

-- ── PlexiProjects task dependencies ──────────────────────────────────────────
-- Finish-to-start links between task nodes that drive the Gantt schedule and the
-- critical path. pred_id must finish before succ_id can start. Both reference
-- nodes; the row is removed when either task is deleted. UNIQUE prevents a
-- duplicate edge in the same direction.
CREATE TABLE IF NOT EXISTS fb_task_deps (
  id TEXT PRIMARY KEY,
  pred_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  succ_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (pred_id, succ_id)
);
CREATE INDEX IF NOT EXISTS idx_fb_task_deps_succ ON fb_task_deps(succ_id);
CREATE INDEX IF NOT EXISTS idx_fb_task_deps_pred ON fb_task_deps(pred_id);

-- ── PlexiReports ─────────────────────────────────────────────────────────────
-- A report is a saved selection of tables plus a schedule and recipients. Its
-- last generated output (Markdown) is cached with a flag recording whether it was
-- an AI narrative or the plain data summary, so a deterministic summary is never
-- shown as a written narrative. next_run_at advances when the report is generated.
CREATE TABLE IF NOT EXISTS fb_reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_table_ids TEXT NOT NULL DEFAULT '[]',
  schedule TEXT NOT NULL DEFAULT 'manual',
  recipients TEXT NOT NULL DEFAULT '[]',
  last_run_at INTEGER,
  last_output TEXT,
  last_output_is_ai INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── PlexiFlow ────────────────────────────────────────────────────────────────
-- A flow is a trigger plus an ordered list of actions (create task, add table
-- row, send email, write knowledge, run an AI step). trigger_json and actions_json
-- hold the typed shapes; last_log caches the most recent honest per-step result.
-- next_run_at advances when a scheduled flow runs.
CREATE TABLE IF NOT EXISTS fb_flows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger_json TEXT NOT NULL DEFAULT '{"kind":"manual"}',
  actions_json TEXT NOT NULL DEFAULT '[]',
  last_run_at INTEGER,
  last_status TEXT,
  last_log TEXT,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── PlexiAPI ─────────────────────────────────────────────────────────────────
-- Local REST API access. Tokens are stored only as a sha256 hash, so the raw
-- token is shown once at creation and never persisted. scopes_json is a JSON
-- array, e.g. ["read","write"]. fb_api_config is a single row holding whether the
-- local server is enabled and on which port; it is off by default and only ever
-- binds to 127.0.0.1.
CREATE TABLE IF NOT EXISTS fb_api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '["read"]',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE TABLE IF NOT EXISTS fb_api_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  port INTEGER NOT NULL DEFAULT 8787
);

-- ── Inter-widget spatial links ───────────────────────────────────────────────
-- Obsidian-style backlinks but drawn as lines on the canvas. Each row is a
-- directed link (source → target). UNIQUE constraint prevents duplicates in
-- the same direction. Reverse direction (B → A) is allowed and treated as a
-- separate link so users can express asymmetric relationships. Cascade
-- delete on either endpoint drops the link automatically.
CREATE TABLE IF NOT EXISTS widget_links (
  id TEXT PRIMARY KEY,
  source_widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  target_widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(source_widget_id, target_widget_id)
);
CREATE INDEX IF NOT EXISTS idx_widget_links_task ON widget_links(task_id);
CREATE INDEX IF NOT EXISTS idx_widget_links_source ON widget_links(source_widget_id);
CREATE INDEX IF NOT EXISTS idx_widget_links_target ON widget_links(target_widget_id);

-- ── Desk time-travel snapshots ──────────────────────────────────────────────
-- A compact history of a task's canvas. Each row is the full widget set for the
-- task at a moment in time (payload = JSON Widget[]). Written debounced as the
-- desk changes; capped + pruned per task. Lets the user scrub the desk's
-- evolution, restore a past state, or branch a new task from one.
CREATE TABLE IF NOT EXISTS canvas_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  widget_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_snapshots_task ON canvas_snapshots(task_id, at DESC);

-- ── Outgoing share links ────────────────────────────────────────────────────
-- Each row is a link the local user minted to share one of their folders /
-- tasks / widgets. Tokens are opaque and URL-safe. revoked=1 soft-deletes
-- (server stops resolving but the row stays so the share-manager UI can
-- still surface the audit trail).
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  -- No kind CHECK: the ShareableKind TS union is the guard, so new share kinds
  -- (document, docfolder, …) never need a DB migration.
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'view' CHECK (scope IN ('view', 'copy')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_links_entity ON share_links(kind, entity_id);
CREATE INDEX IF NOT EXISTS idx_share_links_created ON share_links(created_at DESC);

-- ── Incoming shared items (Shared with me) ──────────────────────────────────
-- v1 these get inserted when the user accepts a share invite. Production
-- will sync from the server. snapshot is the read-only view of the
-- entity at acceptance time so the user can browse it even offline.
CREATE TABLE IF NOT EXISTS shared_with_me (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  from_handle TEXT NOT NULL DEFAULT '',
  accepted_at INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'view' CHECK (scope IN ('view', 'copy'))
);
CREATE INDEX IF NOT EXISTS idx_shared_with_me_accepted ON shared_with_me(accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_widgets_task ON widgets(task_id);
CREATE INDEX IF NOT EXISTS idx_templates_created ON templates(created_at);
CREATE INDEX IF NOT EXISTS idx_history_last_visited ON browsing_history(last_visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_host ON browsing_history(host);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_completed ON focus_sessions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_task ON activity_log(task_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_connected_apps_sort ON connected_apps(sort_order ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_vault_entries_sort ON vault_entries(sort_order ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_energy_log_ts ON energy_log(ts DESC);
`

function ensureColumn(
  d: Database.Database,
  table: string,
  col: string,
  ddl: string
): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.find((c) => c.name === col)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`)
  }
}

// The on-disk path of the live database. Single source of truth so the backup
// module and getDb never drift on where the data actually lives.
export function databaseFilePath(): string {
  return join(app.getPath('userData'), 'focusbuddy.db')
}

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = databaseFilePath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  // Forward-compatible migrations for previously-created DBs
  // File/folder manager: fb_files grows from a flat attachment store into a
  // foldered library. parent_id nests entries (null = root), kind tells folder
  // vs file vs doc-reference, display_name is the editable name (falls back to
  // original_name), updated_at is the modified time, doc_id/doc_type link an
  // internal document filed into a folder. Existing rows default to a root-level
  // file, which is exactly what they were.
  ensureColumn(db, 'fb_files', 'parent_id', 'TEXT')
  ensureColumn(db, 'fb_files', 'kind', "TEXT NOT NULL DEFAULT 'file'")
  ensureColumn(db, 'fb_files', 'display_name', 'TEXT')
  ensureColumn(db, 'fb_files', 'updated_at', 'INTEGER')
  ensureColumn(db, 'fb_files', 'doc_id', 'TEXT')
  ensureColumn(db, 'fb_files', 'doc_type', 'TEXT')
  ensureColumn(db, 'fb_files', 'sort_order', 'INTEGER')
  // Soft-delete for the file manager: a trashed entry is hidden from listings
  // but recoverable (undo / within a grace window), then purged after 7 days.
  ensureColumn(db, 'fb_files', 'trashed_at', 'INTEGER')
  // Soft-delete for undoable task/folder deletion. Deleting a node hard-cascades
  // its whole subtree + every widget on those tasks, so we trash instead (hide +
  // recoverable), and purge old trash on launch. trashed_at null = live.
  ensureColumn(db, 'nodes', 'trashed_at', 'INTEGER')
  ensureColumn(db, 'nodes', 'estimate_minutes', 'INTEGER')
  ensureColumn(db, 'nodes', 'extensions_minutes', 'INTEGER NOT NULL DEFAULT 0')
  // Soft-delete for undoable widget removal. Deleting a widget hard-cascades its
  // connector links; we trash instead (hidden + recoverable, links survive and
  // the overlay skips trashed endpoints), purged after 7 days.
  ensureColumn(db, 'widgets', 'trashed_at', 'INTEGER')
  ensureColumn(db, 'widgets', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'widgets', 'pinned_screen_x', 'INTEGER')
  ensureColumn(db, 'widgets', 'pinned_screen_y', 'INTEGER')
  ensureColumn(db, 'widgets', 'parent_section_id', 'TEXT')
  ensureColumn(db, 'widgets', 'layout', 'TEXT')
  ensureColumn(db, 'nodes', 'resume_markdown', 'TEXT')
  ensureColumn(db, 'nodes', 'resume_updated_at', 'INTEGER')
  ensureColumn(db, 'nodes', 'due_date', 'INTEGER')
  // PlexiProjects planning fields. plan_start is the planned start date (due_date
  // is reused as the planned finish); is_milestone marks a zero-duration marker.
  ensureColumn(db, 'nodes', 'plan_start', 'INTEGER')
  ensureColumn(db, 'nodes', 'is_milestone', 'INTEGER NOT NULL DEFAULT 0')
  // Set on nodes reconstructed from a share someone sent you. Drives the
  // "Shared by <handle>" badge + avatar in the sidebar. Null = your own node.
  ensureColumn(db, 'nodes', 'shared_from_handle', 'TEXT')
  // Soft-archive flag for nodes — separate from task `status` so folders
  // can be put away without messing with the work-state of their tasks.
  ensureColumn(db, 'nodes', 'archived', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'widgets', 'archived', 'INTEGER NOT NULL DEFAULT 0')
  // Connected-app linkage: when a Connected App is dragged to the canvas, the
  // resulting webview widget shares that app's session partition + auto-fill binding.
  ensureColumn(db, 'widgets', 'source_app_id', 'TEXT')
  // Live-wire fields on widget links. Existing links become passive 'context'
  // wires; type/verb/enabled let a wire become reactive (transform / mirror).
  ensureColumn(db, 'widget_links', 'type', "TEXT NOT NULL DEFAULT 'context'")
  ensureColumn(db, 'widget_links', 'verb', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'widget_links', 'enabled', 'INTEGER NOT NULL DEFAULT 1')
  // Render mode for local-app-launcher widgets: 'launcher' (icon + click-to-open)
  // vs 'mirror' (punch-through live view of the real native app window). Null for
  // any other widget kind.
  ensureColumn(db, 'widgets', 'mode', 'TEXT')
  // Pin zone — tl/tr/bl/br for auto-docked pinned widgets. Legacy pinned
  // widgets without a zone fall back to pinnedScreenX/Y free positioning.
  ensureColumn(db, 'widgets', 'pinned_zone', 'TEXT')
  // Living-page fields. Only meaningful for kind='page'. When living_query
  // is non-null the page auto-regenerates its `content` (Tiptap JSON) from
  // the rest of the task's widgets. living_paused stops the auto loop
  // without losing the query string. living_generated_at drives the
  // freshness badge in the UI.
  ensureColumn(db, 'widgets', 'living_query', 'TEXT')
  ensureColumn(db, 'widgets', 'living_generated_at', 'INTEGER')
  ensureColumn(db, 'widgets', 'living_paused', 'INTEGER NOT NULL DEFAULT 0')
  // Linked duplicates: widgets sharing a sync_group_id mirror content/title/colour.
  ensureColumn(db, 'widgets', 'sync_group_id', 'TEXT')
  // Usage telemetry + favourites for Connected Apps. `use_count` and `last_used_at`
  // feed the recency × frequency sort that promotes apps into the Favourites strip;
  // `pinned` lets the user override. `vault_entry_id` binds an app to a vault entry
  // for auto-fill; `autofill_enabled` lets the user turn it off per app.
  ensureColumn(db, 'connected_apps', 'use_count', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'connected_apps', 'last_used_at', 'INTEGER')
  ensureColumn(db, 'connected_apps', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'connected_apps', 'vault_entry_id', 'TEXT')
  ensureColumn(db, 'connected_apps', 'autofill_enabled', 'INTEGER NOT NULL DEFAULT 1')
  // Local-app support: kind discriminator + macOS bundle path/id + cached real
  // icon (base64 PNG so the sidebar can render it without a per-paint IPC hit).
  ensureColumn(db, 'connected_apps', 'kind', "TEXT NOT NULL DEFAULT 'web'")
  ensureColumn(db, 'connected_apps', 'app_path', 'TEXT')
  ensureColumn(db, 'connected_apps', 'bundle_id', 'TEXT')
  ensureColumn(db, 'connected_apps', 'icon_png_base64', 'TEXT')
  // Agent invocation history + outcomes. Drives Phase 2 polish:
  // per-agent applied/refused stats, invocation log, "undo last
  // apply". One row per invocation; one row per outcome event
  // (proposal applied / dismissed / undone). Outcomes reference
  // invocations by id; deleting an invocation cascades.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_invocations (
      id TEXT PRIMARY KEY,
      agent_slug TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      node_id TEXT,
      node_label TEXT NOT NULL DEFAULT '',
      root_path TEXT NOT NULL DEFAULT '[]',
      reply TEXT NOT NULL DEFAULT '',
      proposals TEXT NOT NULL DEFAULT '[]',
      conversation_turn INTEGER NOT NULL DEFAULT 1,
      conversation_key TEXT NOT NULL DEFAULT '',
      invoked_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_slug
      ON agent_invocations (agent_slug);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_node
      ON agent_invocations (node_id);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_conv
      ON agent_invocations (conversation_key);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_invoked_at
      ON agent_invocations (invoked_at DESC);

    CREATE TABLE IF NOT EXISTS agent_outcomes (
      id TEXT PRIMARY KEY,
      invocation_id TEXT NOT NULL
        REFERENCES agent_invocations(id) ON DELETE CASCADE,
      agent_slug TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      proposal_kind TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('applied', 'dismissed', 'undone')),
      -- Pointer to the entity created by an applied proposal so undo
      -- knows what to delete. Format: "<kind>:<id>" e.g. "task:abc",
      -- "widget:xyz". Null for dismissed/undone outcomes.
      created_entity_ref TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_outcomes_inv
      ON agent_outcomes (invocation_id);
    CREATE INDEX IF NOT EXISTS idx_agent_outcomes_slug
      ON agent_outcomes (agent_slug);
    CREATE INDEX IF NOT EXISTS idx_agent_outcomes_action
      ON agent_outcomes (action);
    CREATE INDEX IF NOT EXISTS idx_agent_outcomes_at
      ON agent_outcomes (at DESC);

    -- Small key/value counters for local usage telemetry (e.g. cumulative AI
    -- call count). Aggregate numbers only, never content.
    CREATE TABLE IF NOT EXISTS usage_counters (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    -- Calendar time blocks — a booked stretch of time, optionally tied to a
    -- task. Deleting a task removes its blocks (ON DELETE CASCADE).
    CREATE TABLE IF NOT EXISTS time_blocks (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      start_ms INTEGER NOT NULL,
      duration_min INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_time_blocks_start ON time_blocks (start_ms);
    CREATE INDEX IF NOT EXISTS idx_time_blocks_task ON time_blocks (task_id);

    -- Office documents — standalone doc / sheet / slides files, each created
    -- and edited as a first-class artifact (not a canvas widget). The body is
    -- a JSON blob whose shape depends on doc_type: a Tiptap document for
    -- 'doc', a { columns, rows } grid for 'sheet', a { slides[] } deck for
    -- 'slides'. Keeping one table for all three keeps the Documents list,
    -- sharing and AI-create flow uniform.
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('doc', 'sheet', 'slides', 'map')),
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '{}',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents (updated_at DESC);

    -- Facets: a file/doc can carry many tags, so it lives in every matching view
    -- at once instead of one folder. The folder hierarchy (fb_files.parent_id) is
    -- untouched and still works; tags are an additive layer. The source column
    -- records whether a tag was applied by a person or proposed by the AI.
    CREATE TABLE IF NOT EXISTS fb_file_tags (
      file_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (file_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON fb_file_tags (tag);
    CREATE INDEX IF NOT EXISTS idx_file_tags_file ON fb_file_tags (file_id);

    -- Smart folders: a saved query (a set of tags AND-ed together) that always
    -- shows the matching files live, wherever they sit. A folder you never have
    -- to refile, the payoff of facets over folders.
    CREATE TABLE IF NOT EXISTS fb_smart_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      search TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `)
  // A smart folder can also carry a free-text search alongside its tags. Added
  // after the table shipped tags-only, so back-fill the column on existing DBs.
  ensureColumn(db, 'fb_smart_folders', 'search', "TEXT NOT NULL DEFAULT ''")
  migrateDocumentsDocTypeCheck(db)
  migrateShareKindChecks(db)
  return db
}

// The documents table shipped with a CHECK constraint listing only the original
// doc types. SQLite can't ALTER a CHECK in place, so when PlexiMaps added the
// 'map' type, existing databases reject `INSERT ... doc_type='map'`. This rebuilds
// the table (copying every row) whenever the live CHECK predates 'map'. Idempotent
// and a no-op once migrated or on a fresh DB created with the updated schema above.
function migrateDocumentsDocTypeCheck(d: Database.Database): void {
  const row = d
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")
    .get() as { sql?: string } | undefined
  if (!row?.sql || !row.sql.includes('CHECK') || row.sql.includes("'map'")) return
  d.exec(`
    PRAGMA foreign_keys=off;
    BEGIN;
    CREATE TABLE documents_new (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('doc', 'sheet', 'slides', 'map')),
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '{}',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO documents_new (id, doc_type, title, body, archived, created_at, updated_at)
      SELECT id, doc_type, title, body, archived, created_at, updated_at FROM documents;
    DROP TABLE documents;
    ALTER TABLE documents_new RENAME TO documents;
    CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents (updated_at DESC);
    COMMIT;
    PRAGMA foreign_keys=on;
  `)
}

// The share tables shipped with a CHECK on `kind` (folder/task/widget). Office
// sharing keeps adding kinds (document, docfolder, …), so rather than migrate the
// CHECK each time, this drops the kind CHECK entirely — the ShareableKind TS union
// is the guard. Rebuilds a share table (copying rows) only while its live schema
// still carries a `kind` CHECK. Idempotent; a no-op once migrated or on a fresh DB.
function migrateShareKindChecks(d: Database.Database): void {
  const hasKindCheck = (name: string): boolean => {
    const row = d
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { sql?: string } | undefined
    return !!row?.sql && /CHECK\s*\(\s*kind\s+IN/i.test(row.sql)
  }
  if (hasKindCheck('share_links')) {
    d.exec(`
      PRAGMA foreign_keys=off;
      BEGIN;
      CREATE TABLE share_links_new (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT 'view' CHECK (scope IN ('view', 'copy')),
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        view_count INTEGER NOT NULL DEFAULT 0,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO share_links_new SELECT id, token, kind, entity_id, label, scope, created_at, expires_at, view_count, revoked FROM share_links;
      DROP TABLE share_links;
      ALTER TABLE share_links_new RENAME TO share_links;
      CREATE INDEX IF NOT EXISTS idx_share_links_entity ON share_links(kind, entity_id);
      CREATE INDEX IF NOT EXISTS idx_share_links_created ON share_links(created_at DESC);
      COMMIT;
      PRAGMA foreign_keys=on;
    `)
  }
  if (hasKindCheck('shared_with_me')) {
    d.exec(`
      PRAGMA foreign_keys=off;
      BEGIN;
      CREATE TABLE shared_with_me_new (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        from_handle TEXT NOT NULL DEFAULT '',
        accepted_at INTEGER NOT NULL,
        scope TEXT NOT NULL DEFAULT 'view' CHECK (scope IN ('view', 'copy'))
      );
      INSERT INTO shared_with_me_new SELECT id, token, kind, snapshot_json, from_handle, accepted_at, scope FROM shared_with_me;
      DROP TABLE shared_with_me;
      ALTER TABLE shared_with_me_new RENAME TO shared_with_me;
      CREATE INDEX IF NOT EXISTS idx_shared_with_me_accepted ON shared_with_me(accepted_at DESC);
      COMMIT;
      PRAGMA foreign_keys=on;
    `)
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
