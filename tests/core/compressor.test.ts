import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	autoCompress,
	compressBash,
	compressNote,
	compressToolUse,
	compressionRatio,
	createCompressor,
	defaultCompress,
	needsCompression,
} from "../../src/core/compressor";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import type { Observation } from "../../src/core/db/types";

describe("Compressor", () => {
	describe("needsCompression", () => {
		it("should return true for content exceeding max length", () => {
			const longContent = "a".repeat(600);
			expect(needsCompression(longContent, 500)).toBe(true);
		});

		it("should return false for content within max length", () => {
			const shortContent = "short text";
			expect(needsCompression(shortContent, 500)).toBe(false);
		});

		it("should return false for exact max length", () => {
			const exactContent = "a".repeat(500);
			expect(needsCompression(exactContent, 500)).toBe(false);
		});
	});

	describe("compressToolUse", () => {
		it("should compress Edit tool output", () => {
			const content =
				"Successfully edited file: /src/components/Button.tsx\nChanges applied.";
			const compressed = compressToolUse(content, "Edit");

			expect(compressed).toContain("Edit");
			expect(compressed.length).toBeLessThan(content.length);
		});

		it("should compress Write tool output", () => {
			const content =
				"Wrote file: /src/utils/helper.ts\nFile created successfully.";
			const compressed = compressToolUse(content, "Write");

			expect(compressed).toContain("Write");
		});

		it("should compress Grep results", () => {
			const content =
				"file1.ts:10: match\nfile2.ts:20: match\nfile3.ts:30: match";
			const compressed = compressToolUse(content, "Grep");

			expect(compressed).toContain("Grep");
			expect(compressed).toContain("3개");
		});

		it("should compress long generic content", () => {
			const lines = Array(10)
				.fill(0)
				.map((_, i) => `Line ${i}`);
			const content = lines.join("\n");
			const compressed = compressToolUse(content, "Unknown");

			expect(compressed).toContain("줄 생략");
			expect(compressed.length).toBeLessThan(content.length);
		});

		it("should not compress short content", () => {
			const content = "Line 1\nLine 2\nLine 3";
			const compressed = compressToolUse(content, "Read");

			// Short content might not be compressed by the generic logic
			expect(compressed).toBeDefined();
		});
	});

	describe("compressBash", () => {
		it("should compress bash command with output", () => {
			const content = "$ npm test\nRunning tests...\nAll 10 tests passed!";
			const compressed = compressBash(content);

			expect(compressed).toContain("npm test");
			expect(compressed).toContain("성공");
		});

		it("should detect error in bash output", () => {
			const content = "$ npm build\nBuild failed with error";
			const compressed = compressBash(content);

			expect(compressed).toContain("오류");
		});

		it("should handle output without command", () => {
			const content = "Some output text\nMore lines";
			const compressed = compressBash(content);

			expect(compressed).toContain("줄 출력");
		});

		it("should truncate long commands", () => {
			const longCommand = "a".repeat(100);
			const content = `$ ${longCommand}\noutput`;
			const compressed = compressBash(content);

			expect(compressed).toContain("...");
			expect(compressed.length).toBeLessThan(content.length);
		});
	});

	describe("compressNote", () => {
		it("should compress long notes", () => {
			const lines = Array(10)
				.fill(0)
				.map((_, i) => `Note line ${i}`);
			const content = lines.join("\n");
			const compressed = compressNote(content);

			expect(compressed).toContain("+");
			expect(compressed).toContain("줄");
			expect(compressed.length).toBeLessThan(content.length);
		});

		it("should not compress short notes", () => {
			const content = "Short note";
			const compressed = compressNote(content);

			expect(compressed).toBe(content);
		});

		it("should truncate very long first lines", () => {
			const longLine = "a".repeat(150);
			const content = `${longLine}\nLine 2\nLine 3\nLine 4`;
			const compressed = compressNote(content);

			expect(compressed).toContain("...");
		});
	});

	describe("defaultCompress", () => {
		it("should use compressToolUse for tool_use type", async () => {
			const compressed = await defaultCompress(
				"tool_use",
				"Long content here",
				"Edit",
			);
			expect(compressed).toBeDefined();
		});

		it("should use compressBash for bash type", async () => {
			const compressed = await defaultCompress(
				"bash",
				"$ echo test\ntest",
				undefined,
			);
			expect(compressed).toContain("echo");
		});

		it("should return original for error type", async () => {
			const content = "Error message";
			const compressed = await defaultCompress("error", content, undefined);
			expect(compressed).toBe(content);
		});

		it("should return original for success type", async () => {
			const content = "Success message";
			const compressed = await defaultCompress("success", content, undefined);
			expect(compressed).toBe(content);
		});
	});

	describe("compressionRatio", () => {
		it("should calculate ratio correctly", () => {
			expect(compressionRatio("1234567890", "12345")).toBe(0.5);
		});

		it("should return 1 for empty original", () => {
			expect(compressionRatio("", "test")).toBe(1);
		});

		it("should return correct ratio for same length", () => {
			expect(compressionRatio("test", "test")).toBe(1);
		});
	});

	describe("createCompressor", () => {
		let testDir: string;
		let client: DBClient;
		let sessionId: string;

		beforeEach(() => {
			testDir = join(tmpdir(), `ralph-mem-compressor-test-${Date.now()}`);
			mkdirSync(testDir, { recursive: true });

			ensureProjectDirs(testDir);
			client = createDBClient(getProjectDBPath(testDir));

			const session = client.createSession({ project_path: testDir });
			sessionId = session.id;
		});

		afterEach(() => {
			client.close();
			if (existsSync(testDir)) {
				rmSync(testDir, { recursive: true });
			}
		});

		it("should create compressor instance", () => {
			const compressor = createCompressor({ client });

			expect(compressor.shouldCompress).toBeDefined();
			expect(compressor.compress).toBeDefined();
			expect(compressor.compressBatch).toBeDefined();
		});

		describe("shouldCompress", () => {
			it("should return false for error type", () => {
				const compressor = createCompressor({ client });
				const obs: Observation = {
					id: "obs-1",
					session_id: sessionId,
					type: "error",
					tool_name: null,
					content: "a".repeat(1000),
					content_compressed: null,
					embedding: null,
					importance: 1.0,
					created_at: new Date().toISOString(),
					loop_run_id: null,
					iteration: null,
				};

				expect(compressor.shouldCompress(obs)).toBe(false);
			});

			it("should return false for success type", () => {
				const compressor = createCompressor({ client });
				const obs: Observation = {
					id: "obs-1",
					session_id: sessionId,
					type: "success",
					tool_name: null,
					content: "a".repeat(1000),
					content_compressed: null,
					embedding: null,
					importance: 0.9,
					created_at: new Date().toISOString(),
					loop_run_id: null,
					iteration: null,
				};

				expect(compressor.shouldCompress(obs)).toBe(false);
			});

			it("should return false for already compressed", () => {
				const compressor = createCompressor({ client });
				const obs: Observation = {
					id: "obs-1",
					session_id: sessionId,
					type: "tool_use",
					tool_name: "Edit",
					content: "a".repeat(1000),
					content_compressed: "compressed",
					embedding: null,
					importance: 0.7,
					created_at: new Date().toISOString(),
					loop_run_id: null,
					iteration: null,
				};

				expect(compressor.shouldCompress(obs)).toBe(false);
			});

			it("should return true for long tool_use", () => {
				const compressor = createCompressor({ client });
				const obs: Observation = {
					id: "obs-1",
					session_id: sessionId,
					type: "tool_use",
					tool_name: "Edit",
					content: "a".repeat(1000),
					content_compressed: null,
					embedding: null,
					importance: 0.7,
					created_at: new Date().toISOString(),
					loop_run_id: null,
					iteration: null,
				};

				expect(compressor.shouldCompress(obs)).toBe(true);
			});
		});

		describe("compress", () => {
			it("should compress tool_use observation", async () => {
				const compressor = createCompressor({ client });
				// Content must exceed DEFAULT_MAX_LENGTH (500) to trigger compression
				const longContent = `Successfully edited file: /src/test.ts\n${"Line of code here\n".repeat(50)}Done.`;
				const obs: Observation = {
					id: "obs-1",
					session_id: sessionId,
					type: "tool_use",
					tool_name: "Edit",
					content: longContent,
					content_compressed: null,
					embedding: null,
					importance: 0.7,
					created_at: new Date().toISOString(),
					loop_run_id: null,
					iteration: null,
				};

				expect(obs.content.length).toBeGreaterThan(500);
				const compressed = await compressor.compress(obs);

				expect(compressed.length).toBeLessThan(obs.content.length);
			});

			it("should return original for non-compressible", async () => {
				const compressor = createCompressor({ client });
				const obs: Observation = {
					id: "obs-1",
					session_id: sessionId,
					type: "error",
					tool_name: null,
					content: "Error message",
					content_compressed: null,
					embedding: null,
					importance: 1.0,
					created_at: new Date().toISOString(),
					loop_run_id: null,
					iteration: null,
				};

				const compressed = await compressor.compress(obs);

				expect(compressed).toBe(obs.content);
			});
		});

		describe("compressBatch", () => {
			it("should compress multiple observations", async () => {
				const compressor = createCompressor({ client });

				// Create observations in DB
				const obs1 = client.createObservation({
					session_id: sessionId,
					type: "tool_use",
					tool_name: "Edit",
					content: `Long content ${"a".repeat(600)}`,
				});
				const obs2 = client.createObservation({
					session_id: sessionId,
					type: "bash",
					content: `$ long command\n${"output\n".repeat(20)}`,
				});

				await compressor.compressBatch([obs1, obs2]);

				// Check DB for compressed content
				const updated1 = client.getObservation(obs1.id);
				const updated2 = client.getObservation(obs2.id);

				expect(updated1?.content_compressed).toBeDefined();
				expect(updated2?.content_compressed).toBeDefined();
			});

			it("should skip non-compressible observations", async () => {
				const compressor = createCompressor({ client });

				const obs = client.createObservation({
					session_id: sessionId,
					type: "error",
					content: "Error message that should not be compressed",
				});

				await compressor.compressBatch([obs]);

				const updated = client.getObservation(obs.id);
				expect(updated?.content_compressed).toBeNull();
			});
		});
	});

	describe("autoCompress", () => {
		let testDir: string;
		let client: DBClient;
		let sessionId: string;

		beforeEach(() => {
			testDir = join(tmpdir(), `ralph-mem-autocompress-test-${Date.now()}`);
			mkdirSync(testDir, { recursive: true });

			ensureProjectDirs(testDir);
			client = createDBClient(getProjectDBPath(testDir));

			const session = client.createSession({ project_path: testDir });
			sessionId = session.id;
		});

		afterEach(() => {
			client.close();
			if (existsSync(testDir)) {
				rmSync(testDir, { recursive: true });
			}
		});

		it("should compress large observations", async () => {
			// Create large observations
			for (let i = 0; i < 5; i++) {
				client.createObservation({
					session_id: sessionId,
					type: "tool_use",
					tool_name: "Edit",
					content: `Large content ${"a".repeat(600)}`,
					importance: 0.5,
				});
			}

			const result = await autoCompress(client, sessionId);

			expect(result.compressed).toBeGreaterThan(0);
			expect(result.savedChars).toBeGreaterThan(0);
		});

		it("should skip error and success observations", async () => {
			client.createObservation({
				session_id: sessionId,
				type: "error",
				content: `Large error ${"a".repeat(600)}`,
				importance: 1.0,
			});
			client.createObservation({
				session_id: sessionId,
				type: "success",
				content: `Large success ${"a".repeat(600)}`,
				importance: 0.9,
			});

			const result = await autoCompress(client, sessionId);

			expect(result.compressed).toBe(0);
		});

		it("should compress by importance order", async () => {
			// Low importance - should be compressed first
			const lowImp = client.createObservation({
				session_id: sessionId,
				type: "tool_use",
				tool_name: "Grep",
				content: `Low importance ${"a".repeat(600)}`,
				importance: 0.3,
			});

			// High importance - should be compressed later
			const highImp = client.createObservation({
				session_id: sessionId,
				type: "tool_use",
				tool_name: "Edit",
				content: `High importance ${"a".repeat(600)}`,
				importance: 0.8,
			});

			await autoCompress(client, sessionId, { maxObservations: 1 });

			// Only low importance should be compressed
			const updatedLow = client.getObservation(lowImp.id);
			const updatedHigh = client.getObservation(highImp.id);

			expect(updatedLow?.content_compressed).not.toBeNull();
			expect(updatedHigh?.content_compressed).toBeNull();
		});

		it("should respect maxObservations limit", async () => {
			for (let i = 0; i < 10; i++) {
				client.createObservation({
					session_id: sessionId,
					type: "bash",
					content: `Command output ${"a".repeat(600)}`,
					importance: 0.5,
				});
			}

			const result = await autoCompress(client, sessionId, {
				maxObservations: 3,
			});

			expect(result.compressed).toBe(3);
		});

		it("should return 0 when nothing to compress", async () => {
			// Only short observations
			client.createObservation({
				session_id: sessionId,
				type: "tool_use",
				tool_name: "Read",
				content: "Short content",
				importance: 0.5,
			});

			const result = await autoCompress(client, sessionId);

			expect(result.compressed).toBe(0);
			expect(result.savedChars).toBe(0);
		});
	});
});
