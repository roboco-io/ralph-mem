/**
 * Database Client
 *
 * CRUD operations for sessions, observations, and loop runs.
 * See: docs/design/storage-schema.md
 */

import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { runMigrations } from "./migrations";
import type {
	CreateLoopRun,
	CreateObservation,
	CreateSession,
	LoopRun,
	Observation,
	Session,
} from "./types";

export interface DBClient {
	// Connection
	readonly db: Database.Database;
	close(): void;

	// Session CRUD
	createSession(data: Omit<CreateSession, "id">): Session;
	getSession(id: string): Session | null;
	updateSession(id: string, data: Partial<Session>): void;
	endSession(id: string, summary?: string): void;
	listSessions(projectPath: string, limit?: number): Session[];

	// Observation CRUD
	createObservation(data: Omit<CreateObservation, "id">): Observation;
	getObservation(id: string): Observation | null;
	listObservations(sessionId: string, limit?: number): Observation[];
	listObservationsByLoopRun(loopRunId: string, limit?: number): Observation[];
	deleteObservation(id: string): void;

	// Loop CRUD
	createLoopRun(data: Omit<CreateLoopRun, "id">): LoopRun;
	getLoopRun(id: string): LoopRun | null;
	updateLoopRun(id: string, data: Partial<LoopRun>): void;
	getActiveLoopRun(sessionId: string): LoopRun | null;
	listLoopRuns(sessionId: string, limit?: number): LoopRun[];
}

/**
 * Generate IDs with prefixes
 */
export function generateSessionId(): string {
	return `sess-${nanoid(12)}`;
}

export function generateObservationId(): string {
	return `obs-${nanoid(12)}`;
}

export function generateLoopId(): string {
	return `loop-${nanoid(12)}`;
}

/**
 * Create a database client
 */
export function createDBClient(dbPath: string | ":memory:"): DBClient {
	const db = new Database(dbPath);

	// Enable foreign keys
	db.pragma("foreign_keys = ON");

	// Run migrations
	runMigrations(db);

	return {
		db,

		close(): void {
			db.close();
		},

		// Session CRUD
		createSession(data: Omit<CreateSession, "id">): Session {
			const id = generateSessionId();
			const now = new Date().toISOString();

			db.prepare(`
        INSERT INTO sessions (id, project_path, started_at)
        VALUES (?, ?, ?)
      `).run(id, data.project_path, data.started_at ?? now);

			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			return this.getSession(id)!;
		},

		getSession(id: string): Session | null {
			const row = db
				.prepare(`
        SELECT id, project_path, started_at, ended_at, summary, summary_embedding, token_count
        FROM sessions WHERE id = ?
      `)
				.get(id) as Session | undefined;

			return row ?? null;
		},

		updateSession(id: string, data: Partial<Session>): void {
			const updates: string[] = [];
			const values: unknown[] = [];

			if (data.ended_at !== undefined) {
				updates.push("ended_at = ?");
				values.push(data.ended_at);
			}
			if (data.summary !== undefined) {
				updates.push("summary = ?");
				values.push(data.summary);
			}
			if (data.summary_embedding !== undefined) {
				updates.push("summary_embedding = ?");
				values.push(data.summary_embedding);
			}
			if (data.token_count !== undefined) {
				updates.push("token_count = ?");
				values.push(data.token_count);
			}

			if (updates.length === 0) return;

			values.push(id);
			db.prepare(`
        UPDATE sessions SET ${updates.join(", ")} WHERE id = ?
      `).run(...values);
		},

		endSession(id: string, summary?: string): void {
			const now = new Date().toISOString();
			this.updateSession(id, { ended_at: now, summary });
		},

		listSessions(projectPath: string, limit = 100): Session[] {
			return db
				.prepare(`
        SELECT id, project_path, started_at, ended_at, summary, summary_embedding, token_count
        FROM sessions
        WHERE project_path = ?
        ORDER BY started_at DESC
        LIMIT ?
      `)
				.all(projectPath, limit) as Session[];
		},

		// Observation CRUD
		createObservation(data: Omit<CreateObservation, "id">): Observation {
			const id = generateObservationId();
			const now = new Date().toISOString();

			db.prepare(`
        INSERT INTO observations (id, session_id, type, tool_name, content, importance, created_at, loop_run_id, iteration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
				id,
				data.session_id,
				data.type,
				data.tool_name ?? null,
				data.content,
				data.importance ?? 0.5,
				data.created_at ?? now,
				data.loop_run_id ?? null,
				data.iteration ?? null,
			);

			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			return this.getObservation(id)!;
		},

		getObservation(id: string): Observation | null {
			const row = db
				.prepare(`
        SELECT id, session_id, type, tool_name, content, content_compressed, embedding, importance, created_at, loop_run_id, iteration
        FROM observations WHERE id = ?
      `)
				.get(id) as Observation | undefined;

			return row ?? null;
		},

		listObservations(sessionId: string, limit = 100): Observation[] {
			return db
				.prepare(`
        SELECT id, session_id, type, tool_name, content, content_compressed, embedding, importance, created_at, loop_run_id, iteration
        FROM observations
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
				.all(sessionId, limit) as Observation[];
		},

		listObservationsByLoopRun(loopRunId: string, limit = 100): Observation[] {
			return db
				.prepare(`
        SELECT id, session_id, type, tool_name, content, content_compressed, embedding, importance, created_at, loop_run_id, iteration
        FROM observations
        WHERE loop_run_id = ?
        ORDER BY iteration ASC, created_at ASC
        LIMIT ?
      `)
				.all(loopRunId, limit) as Observation[];
		},

		deleteObservation(id: string): void {
			db.prepare("DELETE FROM observations WHERE id = ?").run(id);
		},

		// Loop CRUD
		createLoopRun(data: Omit<CreateLoopRun, "id">): LoopRun {
			const id = generateLoopId();
			const now = new Date().toISOString();

			db.prepare(`
        INSERT INTO loop_runs (id, session_id, task, criteria, max_iterations, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
				id,
				data.session_id,
				data.task,
				data.criteria,
				data.max_iterations ?? 10,
				data.started_at ?? now,
			);

			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			return this.getLoopRun(id)!;
		},

		getLoopRun(id: string): LoopRun | null {
			const row = db
				.prepare(`
        SELECT id, session_id, task, criteria, status, iterations, max_iterations, started_at, ended_at, snapshot_path
        FROM loop_runs WHERE id = ?
      `)
				.get(id) as LoopRun | undefined;

			return row ?? null;
		},

		updateLoopRun(id: string, data: Partial<LoopRun>): void {
			const updates: string[] = [];
			const values: unknown[] = [];

			if (data.status !== undefined) {
				updates.push("status = ?");
				values.push(data.status);
			}
			if (data.iterations !== undefined) {
				updates.push("iterations = ?");
				values.push(data.iterations);
			}
			if (data.ended_at !== undefined) {
				updates.push("ended_at = ?");
				values.push(data.ended_at);
			}
			if (data.snapshot_path !== undefined) {
				updates.push("snapshot_path = ?");
				values.push(data.snapshot_path);
			}

			if (updates.length === 0) return;

			values.push(id);
			db.prepare(`
        UPDATE loop_runs SET ${updates.join(", ")} WHERE id = ?
      `).run(...values);
		},

		getActiveLoopRun(sessionId: string): LoopRun | null {
			const row = db
				.prepare(`
        SELECT id, session_id, task, criteria, status, iterations, max_iterations, started_at, ended_at, snapshot_path
        FROM loop_runs
        WHERE session_id = ? AND status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
      `)
				.get(sessionId) as LoopRun | undefined;

			return row ?? null;
		},

		listLoopRuns(sessionId: string, limit = 10): LoopRun[] {
			return db
				.prepare(`
        SELECT id, session_id, task, criteria, status, iterations, max_iterations, started_at, ended_at, snapshot_path
        FROM loop_runs
        WHERE session_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `)
				.all(sessionId, limit) as LoopRun[];
		},
	};
}
