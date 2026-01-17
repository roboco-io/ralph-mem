import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopRun } from "../../../src/core/db/types";
import {
	type ClaudeProgressJudge,
	DEFAULT_STOP_CONDITIONS,
	type LoopRunState,
	type ProgressDetector,
	type StopConditionManager,
	type StopConditions,
	createClaudeProgressDetector,
	createSimpleProgressDetector,
	createStopConditionManager,
	loadStopConditions,
	loopRunToState,
	shouldStop,
} from "../../../src/features/ralph/stop-conditions";

describe("Stop Conditions", () => {
	describe("loadStopConditions", () => {
		it("should return defaults when no config provided", () => {
			const conditions = loadStopConditions();

			expect(conditions).toEqual(DEFAULT_STOP_CONDITIONS);
		});

		it("should return defaults when config has no ralph section", () => {
			const conditions = loadStopConditions({});

			expect(conditions).toEqual(DEFAULT_STOP_CONDITIONS);
		});

		it("should use config values when provided", () => {
			const conditions = loadStopConditions({
				ralph: {
					max_iterations: 20,
					max_duration_ms: 3600000,
					no_progress_threshold: 5,
					context_budget: 50000,
					cooldown_ms: 1000,
					success_criteria: [],
				},
			});

			expect(conditions.maxIterations).toBe(20);
			expect(conditions.maxDurationMs).toBe(3600000);
			expect(conditions.noProgressThreshold).toBe(5);
		});

		it("should use defaults for missing config values", () => {
			const conditions = loadStopConditions({
				ralph: {
					max_iterations: 15,
					context_budget: 50000,
					cooldown_ms: 1000,
					success_criteria: [],
				} as never,
			});

			expect(conditions.maxIterations).toBe(15);
			expect(conditions.maxDurationMs).toBe(
				DEFAULT_STOP_CONDITIONS.maxDurationMs,
			);
			expect(conditions.noProgressThreshold).toBe(
				DEFAULT_STOP_CONDITIONS.noProgressThreshold,
			);
		});
	});

	describe("shouldStop", () => {
		const conditions: StopConditions = {
			maxIterations: 10,
			maxDurationMs: 60000, // 1 minute
			noProgressThreshold: 3,
		};

		it("should return null when no conditions met", () => {
			const state: LoopRunState = {
				iterations: 5,
				startedAt: new Date(),
				noProgressCount: 1,
			};

			const result = shouldStop(state, conditions);

			expect(result).toBeNull();
		});

		it("should stop at max iterations", () => {
			const state: LoopRunState = {
				iterations: 10,
				startedAt: new Date(),
				noProgressCount: 0,
			};

			const result = shouldStop(state, conditions);

			expect(result).not.toBeNull();
			expect(result?.reason).toBe("max_iterations");
			expect(result?.details).toContain("10/10");
		});

		it("should stop at max duration", () => {
			const state: LoopRunState = {
				iterations: 5,
				startedAt: new Date(Date.now() - 120000), // 2 minutes ago
				noProgressCount: 0,
			};

			const result = shouldStop(state, conditions);

			expect(result).not.toBeNull();
			expect(result?.reason).toBe("max_duration");
			expect(result?.details).toContain("min");
		});

		it("should stop at no progress threshold", () => {
			const state: LoopRunState = {
				iterations: 5,
				startedAt: new Date(),
				noProgressCount: 3,
			};

			const result = shouldStop(state, conditions);

			expect(result).not.toBeNull();
			expect(result?.reason).toBe("no_progress");
			expect(result?.details).toContain("3");
		});

		it("should prioritize max_iterations over max_duration", () => {
			const state: LoopRunState = {
				iterations: 10,
				startedAt: new Date(Date.now() - 120000),
				noProgressCount: 5,
			};

			const result = shouldStop(state, conditions);

			expect(result?.reason).toBe("max_iterations");
		});

		it("should prioritize max_duration over no_progress", () => {
			const state: LoopRunState = {
				iterations: 5,
				startedAt: new Date(Date.now() - 120000),
				noProgressCount: 5,
			};

			const result = shouldStop(state, conditions);

			expect(result?.reason).toBe("max_duration");
		});
	});

	describe("createSimpleProgressDetector", () => {
		let detector: ProgressDetector;

		beforeEach(() => {
			detector = createSimpleProgressDetector();
		});

		it("should detect no progress for identical outputs", async () => {
			const output = "Test output";

			const result = await detector.detectProgress(output, output);

			expect(result).toBe(false);
		});

		it("should detect no progress when current is empty", async () => {
			const result = await detector.detectProgress("Some output", "");

			expect(result).toBe(false);
		});

		it("should detect progress when error count decreases", async () => {
			const prev = "error: first error\nerror: second error";
			const current = "error: first error";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(true);
		});

		it("should detect no progress when error count increases", async () => {
			const prev = "error: first error";
			const current = "error: first error\nerror: second error";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(false);
		});

		it("should detect progress with success patterns", async () => {
			const prev = "Running tests...";
			const current = "Running tests... ✓ All tests passed";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(true);
		});

		it("should detect no progress with regression patterns", async () => {
			const prev = "Build started";
			const current = "Build started... ✗ Build failed";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(false);
		});

		it("should assume progress for different outputs without clear indicators", async () => {
			const prev = "Step 1: Analyzing code";
			const current = "Step 2: Applying fixes";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(true);
		});

		it("should detect progress with 'fixed' keyword", async () => {
			const prev = "Error in file.ts";
			const current = "Fixed error in file.ts";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(true);
		});

		it("should detect progress with 'working' keyword", async () => {
			const prev = "Feature broken";
			const current = "Feature is now working";

			const result = await detector.detectProgress(prev, current);

			expect(result).toBe(true);
		});
	});

	describe("createClaudeProgressDetector", () => {
		it("should use Claude for progress detection", async () => {
			const mockJudge: ClaudeProgressJudge = vi.fn().mockResolvedValue(true);
			const detector = createClaudeProgressDetector(mockJudge);

			const result = await detector.detectProgress("prev", "current");

			expect(result).toBe(true);
			expect(mockJudge).toHaveBeenCalledWith("prev", "current");
		});

		it("should return false for identical outputs without calling Claude", async () => {
			const mockJudge: ClaudeProgressJudge = vi.fn();
			const detector = createClaudeProgressDetector(mockJudge);

			const result = await detector.detectProgress("same", "same");

			expect(result).toBe(false);
			expect(mockJudge).not.toHaveBeenCalled();
		});

		it("should fallback to simple detection on Claude error", async () => {
			const mockJudge: ClaudeProgressJudge = vi
				.fn()
				.mockRejectedValue(new Error("API error"));
			const detector = createClaudeProgressDetector(mockJudge);

			// Different outputs with success pattern should be progress
			const result = await detector.detectProgress("error", "success");

			expect(result).toBe(true);
		});
	});

	describe("createStopConditionManager", () => {
		const conditions: StopConditions = {
			maxIterations: 5,
			maxDurationMs: 60000,
			noProgressThreshold: 3,
		};

		it("should create manager with initial state", () => {
			const manager = createStopConditionManager(conditions);
			const state = manager.getState();

			expect(state.iterations).toBe(0);
			expect(state.noProgressCount).toBe(0);
			expect(state.startedAt).toBeInstanceOf(Date);
		});

		it("should track iterations", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("output 1");
			await manager.recordIteration("output 2");

			expect(manager.getState().iterations).toBe(2);
		});

		it("should not count no-progress on first iteration", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("output 1");

			expect(manager.getState().noProgressCount).toBe(0);
		});

		it("should detect no progress for identical outputs", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("same output");
			await manager.recordIteration("same output");

			expect(manager.getState().noProgressCount).toBe(1);
		});

		it("should reset no-progress count on progress", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("error");
			await manager.recordIteration("error"); // no progress
			await manager.recordIteration("success"); // progress

			expect(manager.getState().noProgressCount).toBe(0);
		});

		it("should accumulate no-progress count", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("same");
			await manager.recordIteration("same");
			await manager.recordIteration("same");
			await manager.recordIteration("same");

			expect(manager.getState().noProgressCount).toBe(3);
		});

		it("should check stop conditions", async () => {
			const manager = createStopConditionManager(conditions);

			for (let i = 0; i < 5; i++) {
				await manager.recordIteration(`iteration ${i}`);
			}

			const reason = manager.shouldStop();

			expect(reason).not.toBeNull();
			expect(reason?.reason).toBe("max_iterations");
		});

		it("should detect no-progress stop condition", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("same");
			await manager.recordIteration("same");
			await manager.recordIteration("same");
			await manager.recordIteration("same");

			const reason = manager.shouldStop();

			expect(reason).not.toBeNull();
			expect(reason?.reason).toBe("no_progress");
		});

		it("should allow manual no-progress reset", async () => {
			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("same");
			await manager.recordIteration("same");

			manager.resetNoProgressCount();

			expect(manager.getState().noProgressCount).toBe(0);
		});

		it("should use custom progress detector", async () => {
			const mockDetector: ProgressDetector = {
				detectProgress: vi.fn().mockResolvedValue(false),
			};
			const manager = createStopConditionManager(conditions, mockDetector);

			await manager.recordIteration("output 1");
			await manager.recordIteration("output 2");

			expect(mockDetector.detectProgress).toHaveBeenCalledWith(
				"output 1",
				"output 2",
			);
		});
	});

	describe("loopRunToState", () => {
		it("should convert LoopRun to LoopRunState", () => {
			const loopRun: LoopRun = {
				id: "loop-123",
				session_id: "sess-456",
				task: "Test task",
				criteria: "[]",
				status: "running",
				iterations: 5,
				max_iterations: 10,
				started_at: "2025-01-17T10:00:00.000Z",
				ended_at: null,
			};

			const state = loopRunToState(loopRun);

			expect(state.iterations).toBe(5);
			expect(state.startedAt).toEqual(new Date("2025-01-17T10:00:00.000Z"));
			expect(state.noProgressCount).toBe(0);
		});
	});

	describe("Integration", () => {
		it("should work end-to-end with manager", async () => {
			const conditions: StopConditions = {
				maxIterations: 10,
				maxDurationMs: 60000,
				noProgressThreshold: 2,
			};

			const manager = createStopConditionManager(conditions);

			// Simulate iterations with no progress
			await manager.recordIteration("error: test failed");
			expect(manager.shouldStop()).toBeNull();

			await manager.recordIteration("error: test failed"); // same = no progress
			expect(manager.shouldStop()).toBeNull();

			await manager.recordIteration("error: test failed"); // no progress count = 2
			expect(manager.shouldStop()?.reason).toBe("no_progress");
		});

		it("should continue when progress is made", async () => {
			const conditions: StopConditions = {
				maxIterations: 10,
				maxDurationMs: 60000,
				noProgressThreshold: 2,
			};

			const manager = createStopConditionManager(conditions);

			await manager.recordIteration("error: 2 tests failed");
			await manager.recordIteration("error: 2 tests failed"); // no progress
			await manager.recordIteration("error: 1 test failed"); // progress! (fewer errors)

			expect(manager.getState().noProgressCount).toBe(0);
			expect(manager.shouldStop()).toBeNull();
		});
	});
});
