/**
 * Database Types
 *
 * Type definitions for SQLite tables.
 * See: docs/design/storage-schema.md
 */

// Observation types
export type ObservationType =
	| "tool_use"
	| "bash"
	| "error"
	| "success"
	| "note";

// Loop status
export type LoopStatus = "running" | "success" | "failed" | "stopped";

// Session
export interface Session {
	id: string;
	project_path: string;
	started_at: string;
	ended_at: string | null;
	summary: string | null;
	summary_embedding: Uint8Array | null;
	token_count: number;
}

export interface CreateSession {
	id: string;
	project_path: string;
	started_at?: string;
}

// Observation
export interface Observation {
	id: string;
	session_id: string;
	type: ObservationType;
	tool_name: string | null;
	content: string;
	content_compressed: string | null;
	embedding: Uint8Array | null;
	importance: number;
	created_at: string;
	loop_run_id: string | null;
	iteration: number | null;
}

export interface CreateObservation {
	id: string;
	session_id: string;
	type: ObservationType;
	tool_name?: string;
	content: string;
	importance?: number;
	created_at?: string;
	loop_run_id?: string;
	iteration?: number;
}

// Loop Run
export interface LoopRun {
	id: string;
	session_id: string;
	task: string;
	criteria: string; // JSON string
	status: LoopStatus;
	iterations: number;
	max_iterations: number;
	started_at: string;
	ended_at: string | null;
	snapshot_path: string | null;
}

export interface CreateLoopRun {
	id: string;
	session_id: string;
	task: string;
	criteria: string;
	max_iterations?: number;
	started_at?: string;
}

// Global Pattern (for global.db)
export interface GlobalPattern {
	id: string;
	pattern_type: "error_fix" | "best_practice" | "tool_usage";
	description: string;
	embedding: Uint8Array | null;
	source_projects: string; // JSON string
	frequency: number;
	created_at: string;
	updated_at: string;
}

// Migration
export interface Migration {
	version: number;
	name: string;
	applied_at: string;
}
