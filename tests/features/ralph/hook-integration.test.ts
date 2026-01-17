import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DBClient, createDBClient } from "../../../src/core/db/client";
import {
	ensureProjectDirs,
	getProjectDBPath,
} from "../../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../../src/core/store";
import {
	type LoopHookContext,
	createLoopEngine,
} from "../../../src/features/ralph/engine";
import {
	type PostToolUseContext,
	postToolUseHook,
} from "../../../src/hooks/post-tool-use";

describe("Loop-Hook Integration", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-hook-int-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));
		store = createMemoryStore(client);

		const session = store.createSession(testDir);
		sessionId = session.id;
	});

	afterEach(() => {
		store.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("Loop Context in Hooks", () => {
		it("should record loop_run_id in observation", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });
			let loopContext: LoopHookContext | null = null;

			engine.onIteration(async (ctx) => {
				loopContext = engine.getLoopContext();

				// Simulate tool use with loop context
				const toolContext: PostToolUseContext = {
					toolName: "Bash",
					toolInput: { command: "npm test" },
					toolOutput: "All tests passed",
					sessionId,
					projectPath: testDir,
					success: true,
					loopContext: loopContext ?? undefined,
				};

				await postToolUseHook(toolContext, { client });
				return { success: true };
			});

			const result = await engine.start("Test task", { maxIterations: 1 });

			expect(result.success).toBe(true);
			expect(loopContext).toBeDefined();

			// Check observation has loop context
			const observations = client.listObservationsByLoopRun(result.loopRunId);
			// Should have at least 2: tool use + summary
			expect(observations.length).toBeGreaterThanOrEqual(1);

			const toolObs = observations.find((o) => o.tool_name === "Bash");
			expect(toolObs?.loop_run_id).toBe(result.loopRunId);
			expect(toolObs?.iteration).toBe(1);

			engine.close();
		});

		it("should record iteration number correctly", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });
			let iterationCount = 0;

			engine.onIteration(async (ctx) => {
				iterationCount++;
				const loopContext = engine.getLoopContext();

				// Record observation for each iteration
				client.createObservation({
					session_id: sessionId,
					type: "note",
					content: `Iteration ${ctx.iteration}`,
					loop_run_id: loopContext?.runId,
					iteration: loopContext?.iteration,
				});

				return { success: iterationCount >= 3 };
			});

			const result = await engine.start("Multi iteration", {
				maxIterations: 5,
				cooldownMs: 0,
			});

			expect(result.iterations).toBe(3);

			// Check observations have correct iteration numbers
			const observations = client.listObservationsByLoopRun(result.loopRunId);
			const iterationObs = observations.filter((o) =>
				o.content.startsWith("Iteration"),
			);

			expect(iterationObs.length).toBe(3);
			expect(iterationObs[0].iteration).toBe(1);
			expect(iterationObs[1].iteration).toBe(2);
			expect(iterationObs[2].iteration).toBe(3);

			engine.close();
		});

		it("should create summary observation on loop completion", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: true }));

			const result = await engine.start("Summary test", { maxIterations: 1 });

			expect(result.success).toBe(true);

			// Check summary observation exists
			const observations = client.listObservationsByLoopRun(result.loopRunId);
			const summaryObs = observations.find((o) =>
				o.content.includes("Ralph Loop 완료"),
			);

			expect(summaryObs).toBeDefined();
			expect(summaryObs?.content).toContain("Summary test");
			expect(summaryObs?.content).toContain("성공");
			expect(summaryObs?.type).toBe("success");

			engine.close();
		});

		it("should create summary observation on max iterations", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const result = await engine.start("Max iter test", {
				maxIterations: 2,
				cooldownMs: 0,
			});

			expect(result.success).toBe(false);
			expect(result.reason).toBe("max_iterations");

			// Check summary observation
			const observations = client.listObservationsByLoopRun(result.loopRunId);
			const summaryObs = observations.find((o) =>
				o.content.includes("Ralph Loop 완료"),
			);

			expect(summaryObs?.content).toContain("최대 반복 도달");

			engine.close();
		});

		it("should create summary observation on stop", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return { success: false };
			});

			const startPromise = engine.start("Stop test", {
				maxIterations: 100,
				cooldownMs: 100,
			});

			// Wait for loop to start
			await new Promise((resolve) => setTimeout(resolve, 30));

			await engine.stop();
			const result = await startPromise;

			expect(result.reason).toBe("stopped");

			// Check summary observation
			const observations = client.listObservationsByLoopRun(result.loopRunId);
			const summaryObs = observations.find((o) =>
				o.content.includes("Ralph Loop 완료"),
			);

			expect(summaryObs?.content).toContain("중단됨");

			engine.close();
		});
	});

	describe("getLoopContext", () => {
		it("should return null when not running", () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			expect(engine.getLoopContext()).toBeNull();

			engine.close();
		});

		it("should return context during iteration", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });
			let capturedContext: LoopHookContext | null = null;

			engine.onIteration(async () => {
				capturedContext = engine.getLoopContext();
				return { success: true };
			});

			const result = await engine.start("Context test", { maxIterations: 1 });

			expect(capturedContext).not.toBeNull();
			expect(capturedContext?.runId).toBe(result.loopRunId);
			expect(capturedContext?.iteration).toBe(1);

			engine.close();
		});
	});

	describe("Iteration Events", () => {
		it("should call onIterationStart before iteration", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });
			const events: string[] = [];

			engine.onIterationStart((ctx) => {
				events.push(`start:${ctx.iteration}`);
			});

			engine.onIteration(async (ctx) => {
				events.push(`iteration:${ctx.iteration}`);
				return { success: ctx.iteration >= 2 };
			});

			engine.onIterationEnd((ctx, result) => {
				events.push(`end:${ctx.iteration}:${result.success}`);
			});

			await engine.start("Events test", { maxIterations: 3, cooldownMs: 0 });

			expect(events).toEqual([
				"start:1",
				"iteration:1",
				"end:1:false",
				"start:2",
				"iteration:2",
				"end:2:true",
			]);

			engine.close();
		});

		it("should call onIterationEnd with result", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });
			const endResults: { iteration: number; success: boolean }[] = [];

			engine.onIterationEnd((ctx, result) => {
				endResults.push({ iteration: ctx.iteration, success: result.success });
			});

			engine.onIteration(async (ctx) => {
				return { success: ctx.iteration === 2 };
			});

			await engine.start("End results test", {
				maxIterations: 3,
				cooldownMs: 0,
			});

			expect(endResults).toEqual([
				{ iteration: 1, success: false },
				{ iteration: 2, success: true },
			]);

			engine.close();
		});
	});

	describe("Previous Iteration Context", () => {
		it("should allow querying previous iteration results", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async (ctx) => {
				// Record observation for this iteration
				client.createObservation({
					session_id: sessionId,
					type: "note",
					content: `Result of iteration ${ctx.iteration}`,
					loop_run_id: ctx.loopRunId,
					iteration: ctx.iteration,
				});

				// Query previous iterations
				if (ctx.iteration > 1) {
					const prevObs = client.listObservationsByLoopRun(ctx.loopRunId);
					const prevResults = prevObs.filter(
						(o) => o.iteration !== null && o.iteration < ctx.iteration,
					);
					expect(prevResults.length).toBe(ctx.iteration - 1);
				}

				return { success: ctx.iteration >= 3 };
			});

			const result = await engine.start("Query test", {
				maxIterations: 5,
				cooldownMs: 0,
			});

			expect(result.iterations).toBe(3);

			engine.close();
		});
	});

	describe("DB Schema", () => {
		it("should have loop_run_id and iteration columns in observations", () => {
			// Create an observation with loop context
			const loopRun = client.createLoopRun({
				session_id: sessionId,
				task: "Schema test",
				criteria: "test_pass",
			});

			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Test content",
				loop_run_id: loopRun.id,
				iteration: 5,
			});

			expect(obs.loop_run_id).toBe(loopRun.id);
			expect(obs.iteration).toBe(5);

			// Retrieve and verify
			const retrieved = client.getObservation(obs.id);
			expect(retrieved?.loop_run_id).toBe(loopRun.id);
			expect(retrieved?.iteration).toBe(5);
		});

		it("should query observations by loop_run_id", () => {
			const loopRun1 = client.createLoopRun({
				session_id: sessionId,
				task: "Loop 1",
				criteria: "test_pass",
			});
			const loopRun2 = client.createLoopRun({
				session_id: sessionId,
				task: "Loop 2",
				criteria: "test_pass",
			});

			// Create observations for different loops
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Obs 1 for Loop 1",
				loop_run_id: loopRun1.id,
				iteration: 1,
			});
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Obs 2 for Loop 1",
				loop_run_id: loopRun1.id,
				iteration: 2,
			});
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Obs 1 for Loop 2",
				loop_run_id: loopRun2.id,
				iteration: 1,
			});

			// Query by loop run
			const loop1Obs = client.listObservationsByLoopRun(loopRun1.id);
			const loop2Obs = client.listObservationsByLoopRun(loopRun2.id);

			expect(loop1Obs.length).toBe(2);
			expect(loop2Obs.length).toBe(1);
			expect(loop1Obs.every((o) => o.loop_run_id === loopRun1.id)).toBe(true);
		});
	});
});
