/**
 * Loop Engine
 *
 * Core engine for Ralph Loop - iterative task execution with success criteria.
 * Manages loop lifecycle, state transitions, and iteration callbacks.
 *
 * See: docs/design/feature-layer.md
 */

import { type DBClient, createDBClient } from "../../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../core/db/paths";
import type { LoopRun, LoopStatus } from "../../core/db/types";
import { type Config, loadConfig } from "../../utils/config";
import type { SuccessCriteria } from "../../utils/config";

export interface LoopOptions {
	criteria?: SuccessCriteria[];
	maxIterations?: number;
	cooldownMs?: number;
}

export interface LoopResult {
	success: boolean;
	iterations: number;
	reason: "success" | "max_iterations" | "stopped" | "error";
	loopRunId: string;
	error?: string;
}

export interface IterationContext {
	iteration: number;
	task: string;
	loopRunId: string;
}

export interface IterationResult {
	success: boolean;
	output?: string;
	error?: string;
}

export type IterationCallback = (
	context: IterationContext,
) => Promise<IterationResult>;

export type CompleteCallback = (result: LoopResult) => void;

export type IterationStartCallback = (context: IterationContext) => void;
export type IterationEndCallback = (
	context: IterationContext,
	result: IterationResult,
) => void;

/**
 * Loop context for use with hooks
 */
export interface LoopHookContext {
	runId: string;
	iteration: number;
}

export interface LoopEngine {
	// State
	isRunning(): boolean;
	getCurrentRun(): LoopRun | null;
	getLoopContext(): LoopHookContext | null;

	// Control
	start(task: string, options?: LoopOptions): Promise<LoopResult>;
	stop(): Promise<void>;

	// Events
	onIteration(callback: IterationCallback): void;
	onComplete(callback: CompleteCallback): void;
	onIterationStart(callback: IterationStartCallback): void;
	onIterationEnd(callback: IterationEndCallback): void;

	// Cleanup
	close(): void;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a Loop Engine instance
 */
export function createLoopEngine(
	projectPath: string,
	sessionId: string,
	options?: {
		config?: Partial<Config>;
		client?: DBClient;
	},
): LoopEngine {
	// Load config
	const config = options?.config
		? { ...loadConfig(projectPath), ...options.config }
		: loadConfig(projectPath);

	// Initialize DB
	ensureProjectDirs(projectPath);
	const dbPath = getProjectDBPath(projectPath);
	const client = options?.client ?? createDBClient(dbPath);

	// Engine state
	let currentLoopRun: LoopRun | null = null;
	let stopRequested = false;
	let iterationCallback: IterationCallback | null = null;
	let completeCallback: CompleteCallback | null = null;
	let iterationStartCallback: IterationStartCallback | null = null;
	let iterationEndCallback: IterationEndCallback | null = null;
	let currentIteration = 0;

	/**
	 * End the current loop run with status
	 */
	function endLoopRun(status: LoopStatus): void {
		if (!currentLoopRun) return;

		const now = new Date().toISOString();
		client.updateLoopRun(currentLoopRun.id, {
			status,
			ended_at: now,
		});

		// Refresh state
		currentLoopRun = client.getLoopRun(currentLoopRun.id);
	}

	/**
	 * Create summary observation for loop completion
	 */
	function createLoopSummary(
		loopRunId: string,
		task: string,
		result: LoopResult,
	): void {
		const statusText =
			result.reason === "success"
				? "성공"
				: result.reason === "max_iterations"
					? "최대 반복 도달"
					: result.reason === "stopped"
						? "중단됨"
						: "오류";

		const content = `Ralph Loop 완료
태스크: ${task}
상태: ${statusText}
반복: ${result.iterations}회
${result.error ? `오류: ${result.error}` : ""}`.trim();

		client.createObservation({
			session_id: sessionId,
			type: result.success ? "success" : "note",
			content,
			importance: result.success ? 0.9 : 0.7,
			loop_run_id: loopRunId,
			iteration: result.iterations,
		});
	}

	return {
		isRunning(): boolean {
			return currentLoopRun !== null && currentLoopRun.status === "running";
		},

		getCurrentRun(): LoopRun | null {
			if (!currentLoopRun) return null;
			// Refresh from DB
			return client.getLoopRun(currentLoopRun.id);
		},

		getLoopContext(): LoopHookContext | null {
			if (!currentLoopRun || currentLoopRun.status !== "running") {
				return null;
			}
			return {
				runId: currentLoopRun.id,
				iteration: currentIteration,
			};
		},

		async start(task: string, loopOptions?: LoopOptions): Promise<LoopResult> {
			// Check for concurrent execution
			const activeRun = client.getActiveLoopRun(sessionId);
			if (activeRun) {
				throw new Error(
					`Loop already running: ${activeRun.id}. Stop it first with stop().`,
				);
			}

			// Reset state
			stopRequested = false;

			// Merge options
			const criteria = loopOptions?.criteria ?? config.ralph.success_criteria;
			const maxIterations =
				loopOptions?.maxIterations ?? config.ralph.max_iterations;
			const cooldownMs = loopOptions?.cooldownMs ?? config.ralph.cooldown_ms;

			// Create loop run record
			currentLoopRun = client.createLoopRun({
				session_id: sessionId,
				task,
				criteria: JSON.stringify(criteria),
				max_iterations: maxIterations,
			});

			const loopRunId = currentLoopRun.id;

			// Main loop
			let iteration = 0;
			let lastError: string | undefined;

			try {
				while (iteration < maxIterations) {
					// Check for stop request
					if (stopRequested) {
						endLoopRun("stopped");
						const result: LoopResult = {
							success: false,
							iterations: iteration,
							reason: "stopped",
							loopRunId,
						};
						createLoopSummary(loopRunId, task, result);
						if (completeCallback) completeCallback(result);
						return result;
					}

					iteration++;
					currentIteration = iteration;

					// Update iteration count
					client.updateLoopRun(loopRunId, { iterations: iteration });

					const iterationContext: IterationContext = {
						iteration,
						task,
						loopRunId,
					};

					// Call iteration start callback
					if (iterationStartCallback) {
						iterationStartCallback(iterationContext);
					}

					// Call iteration callback
					if (!iterationCallback) {
						throw new Error(
							"No iteration callback set. Call onIteration() before start().",
						);
					}

					const iterationResult = await iterationCallback(iterationContext);

					// Call iteration end callback
					if (iterationEndCallback) {
						iterationEndCallback(iterationContext, iterationResult);
					}

					// Check success
					if (iterationResult.success) {
						endLoopRun("success");
						const result: LoopResult = {
							success: true,
							iterations: iteration,
							reason: "success",
							loopRunId,
						};
						createLoopSummary(loopRunId, task, result);
						if (completeCallback) completeCallback(result);
						return result;
					}

					// Store error for potential final result
					if (iterationResult.error) {
						lastError = iterationResult.error;
					}

					// Cooldown between iterations (except for last iteration)
					if (iteration < maxIterations && !stopRequested) {
						await sleep(cooldownMs);
					}
				}

				// Max iterations reached
				endLoopRun("failed");
				const result: LoopResult = {
					success: false,
					iterations: iteration,
					reason: "max_iterations",
					loopRunId,
					error: lastError,
				};
				createLoopSummary(loopRunId, task, result);
				if (completeCallback) completeCallback(result);
				return result;
			} catch (error) {
				// Error during execution
				endLoopRun("failed");
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const result: LoopResult = {
					success: false,
					iterations: iteration,
					reason: "error",
					loopRunId,
					error: errorMessage,
				};
				createLoopSummary(loopRunId, task, result);
				if (completeCallback) completeCallback(result);
				return result;
			}
		},

		async stop(): Promise<void> {
			stopRequested = true;

			// If there's a running loop, it will stop on next iteration check
			// For immediate feedback, we update the DB status
			if (currentLoopRun && currentLoopRun.status === "running") {
				endLoopRun("stopped");
			}
		},

		onIteration(callback: IterationCallback): void {
			iterationCallback = callback;
		},

		onComplete(callback: CompleteCallback): void {
			completeCallback = callback;
		},

		onIterationStart(callback: IterationStartCallback): void {
			iterationStartCallback = callback;
		},

		onIterationEnd(callback: IterationEndCallback): void {
			iterationEndCallback = callback;
		},

		close(): void {
			if (!options?.client) {
				client.close();
			}
		},
	};
}
