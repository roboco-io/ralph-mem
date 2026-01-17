/**
 * Stop hook tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDBClient } from "../../src/core/db/client";
import { stopHook } from "../../src/hooks/stop";

describe("stopHook", () => {
	let client: ReturnType<typeof createDBClient>;

	beforeEach(() => {
		client = createDBClient(":memory:");
	});

	afterEach(() => {
		client.close();
	});

	it("should end an active session", async () => {
		// Create a session
		const session = client.createSession({
			project_path: "/test/project",
		});

		const result = await stopHook(
			{
				sessionId: session.id,
				projectPath: "/test/project",
				signal: "SIGINT",
			},
			{ client },
		);

		expect(result.sessionEnded).toBe(true);
		expect(result.summary).toContain("SIGINT");
		expect(result.summary).toContain("강제 종료");

		// Verify session is ended
		const endedSession = client.getSession(session.id);
		expect(endedSession?.ended_at).not.toBeNull();
	});

	it("should return false for non-existent session", async () => {
		const result = await stopHook(
			{
				sessionId: "non-existent",
				projectPath: "/test/project",
			},
			{ client },
		);

		expect(result.sessionEnded).toBe(false);
		expect(result.loopStopped).toBe(false);
	});

	it("should return false for already ended session", async () => {
		// Create and end a session
		const session = client.createSession({
			project_path: "/test/project",
		});
		client.endSession(session.id, "Normal end");

		const result = await stopHook(
			{
				sessionId: session.id,
				projectPath: "/test/project",
			},
			{ client },
		);

		expect(result.sessionEnded).toBe(false);
	});

	it("should include observation count in summary", async () => {
		// Create a session with observations
		const session = client.createSession({
			project_path: "/test/project",
		});

		client.createObservation({
			session_id: session.id,
			type: "tool_use",
			content: "Test observation 1",
		});
		client.createObservation({
			session_id: session.id,
			type: "tool_use",
			content: "Test observation 2",
		});

		const result = await stopHook(
			{
				sessionId: session.id,
				projectPath: "/test/project",
			},
			{ client },
		);

		expect(result.summary).toContain("2건");
	});
});
