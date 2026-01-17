/**
 * Database Schema
 *
 * SQL schema definitions for ralph-mem.
 * See: docs/design/storage-schema.md
 */

export const SCHEMA = {
  // Migration tracking table
  migrations: `
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,

  // Sessions table
  sessions: `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT,
      summary_embedding BLOB,
      token_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
  `,

  // Observations table
  observations: `
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('tool_use', 'bash', 'error', 'success', 'note')),
      tool_name TEXT,
      content TEXT NOT NULL,
      content_compressed TEXT,
      embedding BLOB,
      importance REAL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);
    CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(type);
    CREATE INDEX IF NOT EXISTS idx_obs_created ON observations(created_at);
    CREATE INDEX IF NOT EXISTS idx_obs_importance ON observations(importance);
  `,

  // FTS5 virtual table for full-text search
  observations_fts: `
    CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
      content,
      tool_name,
      content='observations',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );
  `,

  // Triggers for FTS synchronization
  fts_triggers: `
    CREATE TRIGGER IF NOT EXISTS obs_ai AFTER INSERT ON observations BEGIN
      INSERT INTO observations_fts(rowid, content, tool_name)
      VALUES (new.rowid, new.content, new.tool_name);
    END;

    CREATE TRIGGER IF NOT EXISTS obs_ad AFTER DELETE ON observations BEGIN
      INSERT INTO observations_fts(observations_fts, rowid, content, tool_name)
      VALUES ('delete', old.rowid, old.content, old.tool_name);
    END;

    CREATE TRIGGER IF NOT EXISTS obs_au AFTER UPDATE ON observations BEGIN
      INSERT INTO observations_fts(observations_fts, rowid, content, tool_name)
      VALUES ('delete', old.rowid, old.content, old.tool_name);
      INSERT INTO observations_fts(rowid, content, tool_name)
      VALUES (new.rowid, new.content, new.tool_name);
    END;
  `,

  // Loop runs table
  loop_runs: `
    CREATE TABLE IF NOT EXISTS loop_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task TEXT NOT NULL,
      criteria TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'stopped')),
      iterations INTEGER DEFAULT 0,
      max_iterations INTEGER DEFAULT 10,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      snapshot_path TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_loop_session ON loop_runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_loop_status ON loop_runs(status);
  `,
} as const;

// Global database schema (for ~/.config/ralph-mem/global.db)
export const GLOBAL_SCHEMA = {
  migrations: SCHEMA.migrations,

  global_patterns: `
    CREATE TABLE IF NOT EXISTS global_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL CHECK (pattern_type IN ('error_fix', 'best_practice', 'tool_usage')),
      description TEXT NOT NULL,
      embedding BLOB,
      source_projects TEXT,
      frequency INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_patterns_type ON global_patterns(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_patterns_freq ON global_patterns(frequency DESC);
  `,
} as const;
