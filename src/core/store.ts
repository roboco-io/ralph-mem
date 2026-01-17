/**
 * Memory Store
 *
 * High-level memory management for sessions and observations.
 * Wraps DBClient with session lifecycle and token counting.
 * See: docs/design/core-layer.md
 */

import type { DBClient } from "./db/client";
import { createDBClient } from "./db/client";
import type {
	Observation as DBObservation,
	Session as DBSession,
	ObservationType,
} from "./db/types";

/**
 * High-level Session type (camelCase)
 */
export interface Session {
	id: string;
	projectPath: string;
	startedAt: Date;
	endedAt: Date | null;
	summary: string | null;
	tokenCount: number;
}

/**
 * High-level Observation type (camelCase)
 */
export interface Observation {
	id: string;
	sessionId: string;
	type: ObservationType;
	toolName: string | null;
	content: string;
	importance: number;
	createdAt: Date;
}

/**
 * Input for creating an observation
 */
export interface CreateObservation {
	type: ObservationType;
	toolName?: string;
	content: string;
	importance?: number;
}

/**
 * Memory Store interface
 */
export interface MemoryStore {
	// Session management
	createSession(projectPath: string): Session;
	getCurrentSession(): Session | null;
	endSession(summary?: string): void;

	// Observation management
	addObservation(obs: CreateObservation): Observation;
	getObservation(id: string): Observation | null;
	getRecentObservations(limit?: number): Observation[];

	// Cleanup
	summarizeAndDelete(before: Date): number;

	// Stats
	getTokenCount(): number;

	// Lifecycle
	close(): void;
}

/**
 * Convert DB Session to high-level Session
 */
function toSession(dbSession: DBSession): Session {
	return {
		id: dbSession.id,
		projectPath: dbSession.project_path,
		startedAt: new Date(dbSession.started_at),
		endedAt: dbSession.ended_at ? new Date(dbSession.ended_at) : null,
		summary: dbSession.summary,
		tokenCount: dbSession.token_count,
	};
}

/**
 * Convert DB Observation to high-level Observation
 */
function toObservation(dbObs: DBObservation): Observation {
	return {
		id: dbObs.id,
		sessionId: dbObs.session_id,
		type: dbObs.type,
		toolName: dbObs.tool_name,
		content: dbObs.content,
		importance: dbObs.importance,
		createdAt: new Date(dbObs.created_at),
	};
}

/**
 * Estimate token count from text
 * Simple heuristic: ~4 characters per token for English/code
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Create a Memory Store instance
 */
export function createMemoryStore(
	dbPathOrClient: string | ":memory:" | DBClient,
): MemoryStore {
	const client: DBClient =
		typeof dbPathOrClient === "string"
			? createDBClient(dbPathOrClient)
			: dbPathOrClient;

	let currentSessionId: string | null = null;
	let tokenCount = 0;

	return {
		createSession(projectPath: string): Session {
			const dbSession = client.createSession({ project_path: projectPath });
			currentSessionId = dbSession.id;
			tokenCount = 0;
			return toSession(dbSession);
		},

		getCurrentSession(): Session | null {
			if (!currentSessionId) return null;

			const dbSession = client.getSession(currentSessionId);
			if (!dbSession) {
				currentSessionId = null;
				return null;
			}

			return toSession(dbSession);
		},

		endSession(summary?: string): void {
			if (!currentSessionId) return;

			// Update token count before ending
			client.updateSession(currentSessionId, { token_count: tokenCount });
			client.endSession(currentSessionId, summary);

			currentSessionId = null;
			tokenCount = 0;
		},

		addObservation(obs: CreateObservation): Observation {
			if (!currentSessionId) {
				throw new Error("No active session. Call createSession first.");
			}

			const dbObs = client.createObservation({
				session_id: currentSessionId,
				type: obs.type,
				tool_name: obs.toolName,
				content: obs.content,
				importance: obs.importance,
			});

			// Update token count
			tokenCount += estimateTokens(obs.content);

			return toObservation(dbObs);
		},

		getObservation(id: string): Observation | null {
			const dbObs = client.getObservation(id);
			return dbObs ? toObservation(dbObs) : null;
		},

		getRecentObservations(limit = 50): Observation[] {
			if (!currentSessionId) return [];

			const dbObservations = client.listObservations(currentSessionId, limit);
			return dbObservations.map(toObservation);
		},

		summarizeAndDelete(before: Date): number {
			// Get all observations before the date
			const beforeISO = before.toISOString();

			const oldObservations = client.db
				.prepare(
					`
        SELECT id FROM observations
        WHERE created_at < ?
      `,
				)
				.all(beforeISO) as { id: string }[];

			// Delete each observation
			for (const obs of oldObservations) {
				client.deleteObservation(obs.id);
			}

			return oldObservations.length;
		},

		getTokenCount(): number {
			return tokenCount;
		},

		close(): void {
			client.close();
		},
	};
}
