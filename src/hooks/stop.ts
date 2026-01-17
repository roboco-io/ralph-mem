/**
 * Stop Hook
 *
 * Triggered when a Claude Code session is forcibly stopped (Ctrl+C, SIGINT).
 * Performs emergency cleanup and saves current state.
 *
 * See: docs/design/hook-layer.md
 */

import { type DBClient, createDBClient } from "../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../core/db/paths";

export interface StopContext {
	sessionId: string;
	projectPath: string;
	signal?: string;
	activeLoopRunId?: string;
}

export interface StopResult {
	sessionEnded: boolean;
	loopStopped: boolean;
	summary: string;
}

/**
 * Stop Hook implementation
 *
 * Called when the session is forcibly interrupted.
 * - Saves any pending observations
 * - Ends the session with an "interrupted" marker
 * - Stops any active Ralph Loop
 */
export async function stopHook(
	context: StopContext,
	options?: {
		client?: DBClient;
	},
): Promise<StopResult> {
	const {
		sessionId,
		projectPath,
		signal = "SIGINT",
		activeLoopRunId,
	} = context;

	// Use provided client or create one
	let client: DBClient;
	if (options?.client) {
		client = options.client;
	} else {
		// Initialize DB only when creating a new client
		ensureProjectDirs(projectPath);
		const dbPath = getProjectDBPath(projectPath);
		client = createDBClient(dbPath);
	}

	try {
		// Check if session exists
		const session = client.getSession(sessionId);
		if (!session || session.ended_at) {
			return {
				sessionEnded: false,
				loopStopped: false,
				summary: "세션이 이미 종료되었거나 존재하지 않습니다.",
			};
		}

		// Stop active loop if exists
		let loopStopped = false;
		if (activeLoopRunId) {
			// Update loop run to mark as stopped
			client.db
				.prepare(
					`
				UPDATE loop_runs
				SET status = 'stopped', ended_at = datetime('now')
				WHERE id = ? AND status = 'running'
			`,
				)
				.run(activeLoopRunId);
			loopStopped = true;
		}

		// Get observation count for summary
		const observations = client.listObservations(sessionId, 1000);
		const summary = `[${signal}] 세션 강제 종료. 작업 ${observations.length}건 기록됨.`;

		// End the session with interrupted marker
		client.endSession(sessionId, summary);

		return {
			sessionEnded: true,
			loopStopped,
			summary,
		};
	} finally {
		// Close if we created the client
		if (!options?.client) {
			client.close();
		}
	}
}
