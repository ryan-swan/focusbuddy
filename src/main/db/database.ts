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
-- We copy any file the user drops onto FocusBuddy into userData/files/<id>.<ext>
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

-- ── Outgoing share links ────────────────────────────────────────────────────
-- Each row is a link the local user minted to share one of their folders /
-- tasks / widgets. Tokens are opaque and URL-safe. revoked=1 soft-deletes
-- (server stops resolving but the row stays so the share-manager UI can
-- still surface the audit trail).
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'task', 'widget')),
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
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'task', 'widget')),
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

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'focusbuddy.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  // Forward-compatible migrations for previously-created DBs
  ensureColumn(db, 'nodes', 'estimate_minutes', 'INTEGER')
  ensureColumn(db, 'nodes', 'extensions_minutes', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'widgets', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'widgets', 'pinned_screen_x', 'INTEGER')
  ensureColumn(db, 'widgets', 'pinned_screen_y', 'INTEGER')
  ensureColumn(db, 'widgets', 'parent_section_id', 'TEXT')
  ensureColumn(db, 'widgets', 'layout', 'TEXT')
  ensureColumn(db, 'nodes', 'resume_markdown', 'TEXT')
  ensureColumn(db, 'nodes', 'resume_updated_at', 'INTEGER')
  ensureColumn(db, 'nodes', 'due_date', 'INTEGER')
  // Soft-archive flag for nodes — separate from task `status` so folders
  // can be put away without messing with the work-state of their tasks.
  ensureColumn(db, 'nodes', 'archived', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'widgets', 'archived', 'INTEGER NOT NULL DEFAULT 0')
  // Connected-app linkage: when a Connected App is dragged to the canvas, the
  // resulting webview widget shares that app's session partition + auto-fill binding.
  ensureColumn(db, 'widgets', 'source_app_id', 'TEXT')
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
  `)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
