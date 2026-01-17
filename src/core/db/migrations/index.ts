/**
 * Migration System
 *
 * Manages database schema versioning and migrations.
 * See: docs/design/storage-schema.md
 */

import type Database from "better-sqlite3";
import type { Migration } from "../types";

export interface MigrationDefinition {
	version: number;
	name: string;
	up: string;
}

// All migrations in order
export const MIGRATIONS: MigrationDefinition[] = [
	{
		version: 1,
		name: "initial",
		up: `
      -- Sessions table
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

      -- Observations table
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

      -- FTS5 virtual table for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
        content,
        tool_name,
        content='observations',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      -- Triggers for FTS synchronization
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

      -- Loop runs table
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
	},
	{
		version: 2,
		name: "add_loop_context_to_observations",
		up: `
      -- Add loop context columns to observations
      ALTER TABLE observations ADD COLUMN loop_run_id TEXT REFERENCES loop_runs(id) ON DELETE SET NULL;
      ALTER TABLE observations ADD COLUMN iteration INTEGER;

      -- Index for loop-related queries
      CREATE INDEX IF NOT EXISTS idx_obs_loop_run ON observations(loop_run_id);
      CREATE INDEX IF NOT EXISTS idx_obs_iteration ON observations(iteration);
    `,
	},
];

/**
 * Initialize migration tracking table
 */
export function initMigrationTable(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Get list of applied migrations
 */
export function getAppliedMigrations(db: Database.Database): Migration[] {
	const stmt = db.prepare(
		"SELECT version, name, applied_at FROM _migrations ORDER BY version",
	);
	return stmt.all() as Migration[];
}

/**
 * Get current schema version
 */
export function getCurrentVersion(db: Database.Database): number {
	const result = db
		.prepare("SELECT MAX(version) as max_version FROM _migrations")
		.get() as { max_version: number | null } | undefined;
	return result?.max_version ?? 0;
}

/**
 * Run pending migrations
 */
export function runMigrations(db: Database.Database): {
	applied: string[];
	currentVersion: number;
} {
	initMigrationTable(db);

	const currentVersion = getCurrentVersion(db);
	const applied: string[] = [];

	for (const migration of MIGRATIONS) {
		if (migration.version > currentVersion) {
			// Run migration in a transaction
			const transaction = db.transaction(() => {
				// Execute migration SQL
				db.exec(migration.up);

				// Record migration
				db.prepare("INSERT INTO _migrations (version, name) VALUES (?, ?)").run(
					migration.version,
					migration.name,
				);
			});

			try {
				transaction();
				applied.push(`${migration.version}_${migration.name}`);
			} catch (error) {
				throw new Error(
					`Migration ${migration.version}_${migration.name} failed: ${error}`,
				);
			}
		}
	}

	return {
		applied,
		currentVersion: getCurrentVersion(db),
	};
}

/**
 * Check if migrations are needed
 */
export function needsMigration(db: Database.Database): boolean {
	initMigrationTable(db);
	const currentVersion = getCurrentVersion(db);
	const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
	return currentVersion < latestVersion;
}
