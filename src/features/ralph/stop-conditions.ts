/**
 * Overbaking Prevention (Stop Conditions)
 *
 * Prevents infinite loops and stale iterations in Ralph Loop.
 * Implements composite stop conditions: max iterations, max duration, no progress.
 *
 * See: docs/issues/015-overbaking-prevention/README.md
 */

import type { LoopRun } from "../../core/db/types";
import type { Config } from "../../utils/config";

/**
 * Configuration for stop conditions
 */
export interface StopConditions {
	maxIterations: number;
	maxDurationMs: number;
	noProgressThreshold: number;
}

/**
 * Reason for stopping the loop
 */
export type StopReasonType = "max_iterations" | "max_duration" | "no_progress";

/**
 * Result of stop condition check
 */
export interface StopReason {
	reason: StopReasonType;
	details: string;
}

/**
 * Loop run state for stop condition evaluation
 */
export interface LoopRunState {
	iterations: number;
	startedAt: Date;
	noProgressCount: number;
}

/**
 * Default stop conditions
 */
export const DEFAULT_STOP_CONDITIONS: StopConditions = {
	maxIterations: 10,
	maxDurationMs: 1800000, // 30 minutes
	noProgressThreshold: 3,
};

/**
 * Load stop conditions from config
 */
export function loadStopConditions(config?: Partial<Config>): StopConditions {
	if (!config?.ralph) {
		return DEFAULT_STOP_CONDITIONS;
	}

	return {
		maxIterations:
			config.ralph.max_iterations ?? DEFAULT_STOP_CONDITIONS.maxIterations,
		maxDurationMs:
			config.ralph.max_duration_ms ?? DEFAULT_STOP_CONDITIONS.maxDurationMs,
		noProgressThreshold:
			config.ralph.no_progress_threshold ??
			DEFAULT_STOP_CONDITIONS.noProgressThreshold,
	};
}

/**
 * Check if the loop should stop based on conditions
 * Returns the first matching stop reason, or null if loop should continue
 *
 * Priority order:
 * 1. Max iterations (hard limit)
 * 2. Max duration (time limit)
 * 3. No progress (stale detection)
 */
export function shouldStop(
	state: LoopRunState,
	conditions: StopConditions,
): StopReason | null {
	// Check max iterations
	if (state.iterations >= conditions.maxIterations) {
		return {
			reason: "max_iterations",
			details: `Reached maximum iterations (${state.iterations}/${conditions.maxIterations})`,
		};
	}

	// Check max duration
	const now = new Date();
	const durationMs = now.getTime() - state.startedAt.getTime();
	if (durationMs >= conditions.maxDurationMs) {
		const durationMinutes = Math.floor(durationMs / 60000);
		const maxMinutes = Math.floor(conditions.maxDurationMs / 60000);
		return {
			reason: "max_duration",
			details: `Reached maximum duration (${durationMinutes}min/${maxMinutes}min)`,
		};
	}

	// Check no progress
	if (state.noProgressCount >= conditions.noProgressThreshold) {
		return {
			reason: "no_progress",
			details: `No progress detected for ${state.noProgressCount} consecutive iterations`,
		};
	}

	return null;
}

/**
 * Progress detector interface
 */
export interface ProgressDetector {
	/**
	 * Detect if progress was made between iterations
	 * @param prevOutput Output from previous iteration
	 * @param currentOutput Output from current iteration
	 * @returns true if progress was detected
	 */
	detectProgress(prevOutput: string, currentOutput: string): Promise<boolean>;
}

/**
 * Simple heuristic-based progress detector
 * Detects progress based on output changes and patterns
 */
export function createSimpleProgressDetector(): ProgressDetector {
	return {
		async detectProgress(
			prevOutput: string,
			currentOutput: string,
		): Promise<boolean> {
			// If outputs are identical, no progress
			if (prevOutput === currentOutput) {
				return false;
			}

			// If current output is empty but previous wasn't, no progress
			if (!currentOutput.trim() && prevOutput.trim()) {
				return false;
			}

			// Count errors in outputs
			const prevErrors = countErrors(prevOutput);
			const currentErrors = countErrors(currentOutput);

			// If error count decreased, that's progress
			if (currentErrors < prevErrors) {
				return true;
			}

			// If error count increased, that's regression (no progress)
			if (currentErrors > prevErrors) {
				return false;
			}

			// Check for new content patterns that indicate progress
			const progressPatterns = [
				/\bpassed?\b/i,
				/\bsuccess\b/i,
				/\bfixed\b/i,
				/\bresolved\b/i,
				/\bcompleted?\b/i,
				/\bworking\b/i,
				/✓/,
				/✔/,
			];

			for (const pattern of progressPatterns) {
				const prevMatches = (prevOutput.match(pattern) || []).length;
				const currentMatches = (currentOutput.match(pattern) || []).length;
				if (currentMatches > prevMatches) {
					return true;
				}
			}

			// Check for regression patterns
			const regressionPatterns = [
				/\bfailed?\b/i,
				/\berror\b/i,
				/\bexception\b/i,
				/✗/,
				/✘/,
			];

			for (const pattern of regressionPatterns) {
				const prevMatches = (prevOutput.match(pattern) || []).length;
				const currentMatches = (currentOutput.match(pattern) || []).length;
				if (currentMatches > prevMatches) {
					return false;
				}
			}

			// If outputs are different but no clear indicators,
			// assume progress (benefit of the doubt)
			return true;
		},
	};
}

/**
 * Count error-like patterns in output
 */
function countErrors(output: string): number {
	const errorPatterns = [
		/\berror\b/gi,
		/\bfail(?:ed|ure|s)?\b/gi,
		/\bexception\b/gi,
		/\bstack trace\b/gi,
		/✗/g,
		/✘/g,
	];

	let count = 0;
	for (const pattern of errorPatterns) {
		const matches = output.match(pattern);
		if (matches) {
			count += matches.length;
		}
	}
	return count;
}

/**
 * Claude-based progress detector
 * Uses Claude to intelligently determine if progress was made
 */
export type ClaudeProgressJudge = (
	prevOutput: string,
	currentOutput: string,
) => Promise<boolean>;

export function createClaudeProgressDetector(
	judge: ClaudeProgressJudge,
): ProgressDetector {
	const simpleDetector = createSimpleProgressDetector();

	return {
		async detectProgress(
			prevOutput: string,
			currentOutput: string,
		): Promise<boolean> {
			// Quick check: identical outputs = no progress
			if (prevOutput === currentOutput) {
				return false;
			}

			try {
				return await judge(prevOutput, currentOutput);
			} catch {
				// Fallback to simple detection on Claude error
				return simpleDetector.detectProgress(prevOutput, currentOutput);
			}
		},
	};
}

/**
 * Stop condition manager
 * Tracks loop state and determines when to stop
 */
export interface StopConditionManager {
	/**
	 * Get current state
	 */
	getState(): LoopRunState;

	/**
	 * Record an iteration and check for progress
	 * @param output Output from the iteration
	 * @returns Updated no-progress count
	 */
	recordIteration(output: string): Promise<number>;

	/**
	 * Check if the loop should stop
	 * @returns Stop reason if should stop, null otherwise
	 */
	shouldStop(): StopReason | null;

	/**
	 * Reset the no-progress counter (called when criteria passes)
	 */
	resetNoProgressCount(): void;
}

/**
 * Create a stop condition manager
 */
export function createStopConditionManager(
	conditions: StopConditions,
	progressDetector?: ProgressDetector,
): StopConditionManager {
	const detector = progressDetector ?? createSimpleProgressDetector();

	const state: LoopRunState = {
		iterations: 0,
		startedAt: new Date(),
		noProgressCount: 0,
	};

	let lastOutput = "";

	return {
		getState(): LoopRunState {
			return { ...state };
		},

		async recordIteration(output: string): Promise<number> {
			state.iterations++;

			if (state.iterations === 1) {
				// First iteration, no comparison needed
				lastOutput = output;
				return state.noProgressCount;
			}

			const hasProgress = await detector.detectProgress(lastOutput, output);

			if (hasProgress) {
				state.noProgressCount = 0;
			} else {
				state.noProgressCount++;
			}

			lastOutput = output;
			return state.noProgressCount;
		},

		shouldStop(): StopReason | null {
			return shouldStop(state, conditions);
		},

		resetNoProgressCount(): void {
			state.noProgressCount = 0;
		},
	};
}

/**
 * Convert LoopRun from DB to LoopRunState
 */
export function loopRunToState(run: LoopRun): LoopRunState {
	return {
		iterations: run.iterations,
		startedAt: new Date(run.started_at),
		noProgressCount: 0, // Not stored in DB, managed in-memory
	};
}
