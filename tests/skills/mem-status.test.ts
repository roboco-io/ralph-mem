import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import {
	type MemStatus,
	type MemStatusContext,
	createMemStatusSkill,
	executeMemStatus,
	formatMemStatus,
	getMemStatus,
} from "../../src/skills/mem-status";

describe("Mem Status Skill", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-status-test-${Date.now()}`);
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

	describe("getMemStatus", () => {
		it("should return status for empty database", () => {
			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.sessions.total).toBe(1); // Current session
			expect(status.sessions.recent).toBe(1);
			expect(status.observations.total).toBe(0);
			expect(status.storage.dbSizeMB).toBeGreaterThanOrEqual(0);
			expect(status.tokens.currentSession).toBe(0);
			expect(status.loop.isActive).toBe(false);
			expect(status.loop.totalRuns).toBe(0);
		});

		it("should count observations correctly", () => {
			// Add some observations
			for (let i = 0; i < 5; i++) {
				client.createObservation({
					session_id: sessionId,
					type: "tool_use",
					tool_name: "Read",
					content: `Content ${i}`,
				});
			}

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.observations.total).toBe(5);
		});

		it("should calculate token usage", () => {
			// Add observation with known content
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "This is a test observation with some content",
			});

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.tokens.currentSession).toBeGreaterThan(0);
		});

		it("should detect config file when present", () => {
			// Create config file
			const configDir = join(testDir, ".ralph-mem");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(join(configDir, "config.yaml"), "version: 1");

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.configPath).toBe(join(testDir, ".ralph-mem/config.yaml"));
		});

		it("should return null configPath when no config", () => {
			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.configPath).toBeNull();
		});

		it("should calculate budget percent", () => {
			// Add observation
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Test content for budget calculation",
			});

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
				contextBudget: 1000,
			};

			const status = getMemStatus(context);

			expect(status.tokens.budgetPercent).toBeGreaterThan(0);
			expect(status.tokens.budgetPercent).toBeLessThan(100);
		});
	});

	describe("Loop statistics", () => {
		it("should show loop stats when loops exist", () => {
			// Create some loop runs
			client.createLoopRun({
				session_id: sessionId,
				task: "Task 1",
				criteria: "test_pass",
				max_iterations: 10,
			});
			client.createLoopRun({
				session_id: sessionId,
				task: "Task 2",
				criteria: "build_success",
				max_iterations: 5,
			});

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.loop.totalRuns).toBe(2);
		});

		it("should calculate success rate", () => {
			// Create loop runs with different statuses
			const run1 = client.createLoopRun({
				session_id: sessionId,
				task: "Task 1",
				criteria: "test_pass",
				max_iterations: 10,
			});
			client.updateLoopRun(run1.id, { status: "success" });

			const run2 = client.createLoopRun({
				session_id: sessionId,
				task: "Task 2",
				criteria: "test_pass",
				max_iterations: 10,
			});
			client.updateLoopRun(run2.id, { status: "failed" });

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.loop.totalRuns).toBe(2);
			expect(status.loop.successRate).toBe(50);
		});

		it("should detect active loop", () => {
			// Create a running loop
			client.createLoopRun({
				session_id: sessionId,
				task: "Running Task",
				criteria: "test_pass",
				max_iterations: 10,
			});
			// Status defaults to "running"

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.loop.isActive).toBe(true);
		});
	});

	describe("formatMemStatus", () => {
		it("should format status with all sections", () => {
			const status: MemStatus = {
				sessions: { total: 15, recent: 5 },
				observations: { total: 342 },
				storage: { dbSizeMB: 12.5 },
				tokens: {
					currentSession: 2340,
					budgetUsed: 2340,
					budgetPercent: 15,
				},
				loop: {
					isActive: false,
					totalRuns: 8,
					successRate: 75,
				},
				configPath: "/path/to/config.yaml",
			};

			const output = formatMemStatus(status);

			expect(output).toContain("📊 ralph-mem 상태");
			expect(output).toContain("세션: 15개");
			expect(output).toContain("최근 30일: 5개");
			expect(output).toContain("관찰: 342개");
			expect(output).toContain("용량: 12.5 MB");
			expect(output).toContain("현재 세션: 2,340 tokens");
			expect(output).toContain("비활성");
			expect(output).toContain("총 실행: 8회");
			expect(output).toContain("성공률: 75%");
			expect(output).toContain("/path/to/config.yaml");
		});

		it("should show active loop status", () => {
			const status: MemStatus = {
				sessions: { total: 1, recent: 1 },
				observations: { total: 0 },
				storage: { dbSizeMB: 0 },
				tokens: {
					currentSession: 0,
					budgetUsed: 0,
					budgetPercent: 0,
				},
				loop: {
					isActive: true,
					totalRuns: 1,
					successRate: 0,
				},
				configPath: null,
			};

			const output = formatMemStatus(status);

			expect(output).toContain("실행 중");
		});

		it("should show no config when null", () => {
			const status: MemStatus = {
				sessions: { total: 1, recent: 1 },
				observations: { total: 0 },
				storage: { dbSizeMB: 0 },
				tokens: {
					currentSession: 0,
					budgetUsed: 0,
					budgetPercent: 0,
				},
				loop: {
					isActive: false,
					totalRuns: 0,
					successRate: 0,
				},
				configPath: null,
			};

			const output = formatMemStatus(status);

			expect(output).toContain("설정: (없음)");
		});
	});

	describe("executeMemStatus", () => {
		it("should execute and return formatted string", async () => {
			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const output = await executeMemStatus(context);

			expect(output).toContain("📊 ralph-mem 상태");
			expect(output).toContain("메모리:");
			expect(output).toContain("토큰:");
			expect(output).toContain("Loop:");
		});
	});

	describe("createMemStatusSkill", () => {
		it("should create skill instance", () => {
			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const skill = createMemStatusSkill(context);

			expect(skill.name).toBe("/mem-status");
			expect(skill.execute).toBeDefined();
			expect(skill.getStatus).toBeDefined();
		});

		it("should execute skill", async () => {
			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const skill = createMemStatusSkill(context);
			const output = await skill.execute();

			expect(output).toContain("📊 ralph-mem 상태");
		});

		it("should get raw status", () => {
			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const skill = createMemStatusSkill(context);
			const status = skill.getStatus();

			expect(status.sessions).toBeDefined();
			expect(status.observations).toBeDefined();
			expect(status.storage).toBeDefined();
			expect(status.tokens).toBeDefined();
			expect(status.loop).toBeDefined();
		});
	});

	describe("Recent sessions calculation", () => {
		it("should count only recent sessions", () => {
			// Create an old session (> 30 days)
			client.db
				.prepare(
					`
				INSERT INTO sessions (id, project_path, started_at)
				VALUES (?, ?, ?)
			`,
				)
				.run(
					"old-session",
					testDir,
					new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
				);

			const context: MemStatusContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const status = getMemStatus(context);

			expect(status.sessions.total).toBe(2); // Current + old
			expect(status.sessions.recent).toBe(1); // Only current
		});
	});
});
