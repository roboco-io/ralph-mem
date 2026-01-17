import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
	MIGRATIONS,
	getAppliedMigrations,
	getCurrentVersion,
	needsMigration,
	runMigrations,
} from "../../../src/core/db/migrations";

describe("Migrations", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
	});

	describe("runMigrations", () => {
		it("should create all tables on fresh database", () => {
			const result = runMigrations(db);

			expect(result.applied).toContain("1_initial");
			expect(result.currentVersion).toBe(MIGRATIONS.length);

			// Check tables exist
			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
				)
				.all() as { name: string }[];
			const tableNames = tables.map((t) => t.name);

			expect(tableNames).toContain("sessions");
			expect(tableNames).toContain("observations");
			expect(tableNames).toContain("loop_runs");
			expect(tableNames).toContain("_migrations");
		});

		it("should create FTS5 virtual table", () => {
			runMigrations(db);

			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'",
				)
				.all() as { name: string }[];

			expect(tables.some((t) => t.name.includes("observations_fts"))).toBe(
				true,
			);
		});

		it("should skip already applied migrations", () => {
			// First run
			const first = runMigrations(db);
			expect(first.applied.length).toBeGreaterThan(0);

			// Second run should skip
			const second = runMigrations(db);
			expect(second.applied.length).toBe(0);
			expect(second.currentVersion).toBe(first.currentVersion);
		});

		it("should track migration versions", () => {
			runMigrations(db);

			const applied = getAppliedMigrations(db);
			expect(applied.length).toBe(MIGRATIONS.length);
			expect(applied[0].version).toBe(1);
			expect(applied[0].name).toBe("initial");
		});
	});

	describe("FTS triggers", () => {
		beforeEach(() => {
			runMigrations(db);
		});

		it("should sync inserts to FTS", () => {
			// Insert session first
			db.exec(
				"INSERT INTO sessions (id, project_path, started_at) VALUES ('s1', '/test', datetime('now'))",
			);

			// Insert observation
			db.exec(
				"INSERT INTO observations (id, session_id, type, content, created_at) VALUES ('o1', 's1', 'note', 'hello world test', datetime('now'))",
			);

			// Search FTS
			const results = db
				.prepare(
					"SELECT content FROM observations_fts WHERE content MATCH 'hello'",
				)
				.all() as { content: string }[];

			expect(results.length).toBe(1);
			expect(results[0].content).toContain("hello");
		});

		it("should sync deletes to FTS", () => {
			// Setup
			db.exec(
				"INSERT INTO sessions (id, project_path, started_at) VALUES ('s1', '/test', datetime('now'))",
			);
			db.exec(
				"INSERT INTO observations (id, session_id, type, content, created_at) VALUES ('o1', 's1', 'note', 'delete me', datetime('now'))",
			);

			// Verify it exists
			let results = db
				.prepare(
					"SELECT content FROM observations_fts WHERE content MATCH 'delete'",
				)
				.all() as { content: string }[];
			expect(results.length).toBe(1);

			// Delete
			db.exec("DELETE FROM observations WHERE id = 'o1'");

			// Verify it's gone from FTS
			results = db
				.prepare(
					"SELECT content FROM observations_fts WHERE content MATCH 'delete'",
				)
				.all() as { content: string }[];
			expect(results.length).toBe(0);
		});

		it("should sync updates to FTS", () => {
			// Setup
			db.exec(
				"INSERT INTO sessions (id, project_path, started_at) VALUES ('s1', '/test', datetime('now'))",
			);
			db.exec(
				"INSERT INTO observations (id, session_id, type, content, created_at) VALUES ('o1', 's1', 'note', 'original content', datetime('now'))",
			);

			// Update
			db.exec(
				"UPDATE observations SET content = 'updated content' WHERE id = 'o1'",
			);

			// Old content should not match
			let results = db
				.prepare(
					"SELECT content FROM observations_fts WHERE content MATCH 'original'",
				)
				.all() as { content: string }[];
			expect(results.length).toBe(0);

			// New content should match
			results = db
				.prepare(
					"SELECT content FROM observations_fts WHERE content MATCH 'updated'",
				)
				.all() as { content: string }[];
			expect(results.length).toBe(1);
		});
	});

	describe("getCurrentVersion", () => {
		it("should return 0 for fresh database", () => {
			// Initialize migration table first
			db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

			const version = getCurrentVersion(db);
			expect(version).toBe(0);
		});

		it("should return latest version after migrations", () => {
			runMigrations(db);
			const version = getCurrentVersion(db);
			expect(version).toBe(MIGRATIONS.length);
		});
	});

	describe("needsMigration", () => {
		it("should return true for fresh database", () => {
			expect(needsMigration(db)).toBe(true);
		});

		it("should return false after all migrations applied", () => {
			runMigrations(db);
			expect(needsMigration(db)).toBe(false);
		});
	});

	describe("Schema constraints", () => {
		beforeEach(() => {
			runMigrations(db);
		});

		it("should enforce observation type constraint", () => {
			db.exec(
				"INSERT INTO sessions (id, project_path, started_at) VALUES ('s1', '/test', datetime('now'))",
			);

			expect(() => {
				db.exec(
					"INSERT INTO observations (id, session_id, type, content, created_at) VALUES ('o1', 's1', 'invalid_type', 'test', datetime('now'))",
				);
			}).toThrow();
		});

		it("should enforce loop_runs status constraint", () => {
			db.exec(
				"INSERT INTO sessions (id, project_path, started_at) VALUES ('s1', '/test', datetime('now'))",
			);

			expect(() => {
				db.exec(
					"INSERT INTO loop_runs (id, session_id, task, criteria, status, started_at) VALUES ('l1', 's1', 'test', '{}', 'invalid_status', datetime('now'))",
				);
			}).toThrow();
		});

		it("should cascade delete observations when session deleted", () => {
			// Enable foreign keys
			db.pragma("foreign_keys = ON");

			db.exec(
				"INSERT INTO sessions (id, project_path, started_at) VALUES ('s1', '/test', datetime('now'))",
			);
			db.exec(
				"INSERT INTO observations (id, session_id, type, content, created_at) VALUES ('o1', 's1', 'note', 'test', datetime('now'))",
			);

			// Delete session
			db.exec("DELETE FROM sessions WHERE id = 's1'");

			// Observation should be deleted
			const obs = db
				.prepare("SELECT id FROM observations WHERE id = 'o1'")
				.get() as { id: string } | undefined;
			expect(obs).toBeUndefined();
		});
	});
});
