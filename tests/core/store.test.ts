import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type MemoryStore,
	createMemoryStore,
	estimateTokens,
} from "../../src/core/store";

describe("MemoryStore", () => {
	let store: MemoryStore;

	beforeEach(() => {
		store = createMemoryStore(":memory:");
	});

	afterEach(() => {
		store.close();
	});

	describe("estimateTokens", () => {
		it("should estimate tokens based on character count", () => {
			expect(estimateTokens("")).toBe(0);
			expect(estimateTokens("test")).toBe(1);
			expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
			expect(estimateTokens("a".repeat(100))).toBe(25);
		});
	});

	describe("Session lifecycle", () => {
		it("should create a session", () => {
			const session = store.createSession("/test/project");

			expect(session.id).toMatch(/^sess-/);
			expect(session.projectPath).toBe("/test/project");
			expect(session.startedAt).toBeInstanceOf(Date);
			expect(session.endedAt).toBeNull();
			expect(session.tokenCount).toBe(0);
		});

		it("should return current session after creation", () => {
			const created = store.createSession("/test/project");
			const current = store.getCurrentSession();

			expect(current).not.toBeNull();
			expect(current?.id).toBe(created.id);
		});

		it("should return null for current session before any creation", () => {
			const current = store.getCurrentSession();
			expect(current).toBeNull();
		});

		it("should end session with summary", () => {
			store.createSession("/test/project");
			store.endSession("Test completed");

			const current = store.getCurrentSession();
			expect(current).toBeNull();
		});

		it("should handle ending non-existent session gracefully", () => {
			// Should not throw
			expect(() => store.endSession()).not.toThrow();
		});

		it("should create new session after ending previous", () => {
			const first = store.createSession("/project/a");
			store.endSession();

			const second = store.createSession("/project/b");

			expect(second.id).not.toBe(first.id);
			expect(store.getCurrentSession()?.id).toBe(second.id);
		});
	});

	describe("Observation management", () => {
		beforeEach(() => {
			store.createSession("/test/project");
		});

		it("should add an observation", () => {
			const obs = store.addObservation({
				type: "note",
				content: "Test observation",
			});

			expect(obs.id).toMatch(/^obs-/);
			expect(obs.type).toBe("note");
			expect(obs.content).toBe("Test observation");
			expect(obs.importance).toBe(0.5);
			expect(obs.createdAt).toBeInstanceOf(Date);
		});

		it("should add observation with tool_name", () => {
			const obs = store.addObservation({
				type: "tool_use",
				toolName: "Read",
				content: "File content...",
			});

			expect(obs.toolName).toBe("Read");
		});

		it("should add observation with custom importance", () => {
			const obs = store.addObservation({
				type: "error",
				content: "Error occurred",
				importance: 0.9,
			});

			expect(obs.importance).toBe(0.9);
		});

		it("should throw when adding observation without session", () => {
			store.endSession();

			expect(() =>
				store.addObservation({
					type: "note",
					content: "Test",
				}),
			).toThrow("No active session");
		});

		it("should get observation by id", () => {
			const created = store.addObservation({
				type: "note",
				content: "Test",
			});

			const retrieved = store.getObservation(created.id);

			expect(retrieved).not.toBeNull();
			expect(retrieved?.id).toBe(created.id);
			expect(retrieved?.content).toBe("Test");
		});

		it("should return null for non-existent observation", () => {
			const obs = store.getObservation("obs-nonexistent");
			expect(obs).toBeNull();
		});

		it("should get recent observations", () => {
			store.addObservation({ type: "note", content: "First" });
			store.addObservation({ type: "note", content: "Second" });
			store.addObservation({ type: "note", content: "Third" });

			const observations = store.getRecentObservations();

			expect(observations.length).toBe(3);
			// Check all observations are returned
			const contents = observations.map((o) => o.content);
			expect(contents).toContain("First");
			expect(contents).toContain("Second");
			expect(contents).toContain("Third");
		});

		it("should limit recent observations", () => {
			for (let i = 0; i < 10; i++) {
				store.addObservation({ type: "note", content: `Obs ${i}` });
			}

			const observations = store.getRecentObservations(5);

			expect(observations.length).toBe(5);
		});

		it("should return empty array when no session", () => {
			store.endSession();
			const observations = store.getRecentObservations();
			expect(observations).toEqual([]);
		});
	});

	describe("Token counting", () => {
		beforeEach(() => {
			store.createSession("/test/project");
		});

		it("should start with zero tokens", () => {
			expect(store.getTokenCount()).toBe(0);
		});

		it("should accumulate token count from observations", () => {
			store.addObservation({
				type: "note",
				content: "a".repeat(40), // 40 chars = 10 tokens
			});

			expect(store.getTokenCount()).toBe(10);

			store.addObservation({
				type: "note",
				content: "b".repeat(80), // 80 chars = 20 tokens
			});

			expect(store.getTokenCount()).toBe(30);
		});

		it("should reset token count on session end", () => {
			store.addObservation({
				type: "note",
				content: "a".repeat(100),
			});

			store.endSession();

			expect(store.getTokenCount()).toBe(0);
		});

		it("should reset token count on new session", () => {
			store.addObservation({
				type: "note",
				content: "a".repeat(100),
			});

			store.createSession("/another/project");

			expect(store.getTokenCount()).toBe(0);
		});
	});

	describe("summarizeAndDelete", () => {
		it("should delete old observations", () => {
			store.createSession("/test/project");

			// Add some observations
			const obs1 = store.addObservation({ type: "note", content: "Old 1" });
			const obs2 = store.addObservation({ type: "note", content: "Old 2" });
			const obs3 = store.addObservation({ type: "note", content: "New" });

			// Delete observations older than now (should delete all)
			const futureDate = new Date(Date.now() + 10000);
			const deleted = store.summarizeAndDelete(futureDate);

			expect(deleted).toBe(3);
			expect(store.getObservation(obs1.id)).toBeNull();
			expect(store.getObservation(obs2.id)).toBeNull();
			expect(store.getObservation(obs3.id)).toBeNull();
		});

		it("should not delete recent observations", () => {
			store.createSession("/test/project");

			store.addObservation({ type: "note", content: "Recent" });

			// Delete observations older than yesterday
			const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
			const deleted = store.summarizeAndDelete(yesterday);

			expect(deleted).toBe(0);
			expect(store.getRecentObservations().length).toBe(1);
		});

		it("should return count of deleted observations", () => {
			store.createSession("/test/project");

			for (let i = 0; i < 5; i++) {
				store.addObservation({ type: "note", content: `Obs ${i}` });
			}

			const futureDate = new Date(Date.now() + 10000);
			const deleted = store.summarizeAndDelete(futureDate);

			expect(deleted).toBe(5);
		});
	});

	describe("close", () => {
		it("should close without error", () => {
			expect(() => store.close()).not.toThrow();
		});
	});
});
