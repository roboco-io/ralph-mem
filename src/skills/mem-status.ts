/**
 * /mem-status Skill
 *
 * Displays memory usage and status information.
 *
 * See: docs/issues/024-mem-status-skill/README.md
 */

import { existsSync, statSync } from "node:fs";
import type { DBClient } from "../core/db/client";
import { getProjectDBPath } from "../core/db/paths";
import { countTokens } from "../utils/tokens";

/**
 * Memory status output
 */
export interface MemStatus {
	sessions: {
		total: number;
		recent: number;
	};
	observations: {
		total: number;
	};
	storage: {
		dbSizeMB: number;
	};
	tokens: {
		currentSession: number;
		budgetUsed: number;
		budgetPercent: number;
	};
	loop: {
		isActive: boolean;
		totalRuns: number;
		successRate: number;
	};
	configPath: string | null;
}

/**
 * Skill context
 */
export interface MemStatusContext {
	projectPath: string;
	sessionId: string;
	client: DBClient;
	contextBudget?: number;
}

/**
 * Get DB file size in MB
 */
function getDBSize(projectPath: string): number {
	try {
		const dbPath = getProjectDBPath(projectPath);
		if (!existsSync(dbPath)) {
			return 0;
		}
		const stats = statSync(dbPath);
		return Number((stats.size / (1024 * 1024)).toFixed(2));
	} catch {
		return 0;
	}
}

/**
 * Get sessions in the last N days
 */
function getRecentSessionCount(client: DBClient, days: number): number {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = cutoff.toISOString();

	const result = client.db
		.prepare("SELECT COUNT(*) as count FROM sessions WHERE started_at >= ?")
		.get(cutoffStr) as { count: number };

	return result.count;
}

/**
 * Get current session token usage
 */
function getSessionTokenUsage(client: DBClient, sessionId: string): number {
	const observations = client.listObservations(sessionId);
	let totalTokens = 0;

	for (const obs of observations) {
		const content = obs.content_compressed || obs.content;
		totalTokens += countTokens(content);
	}

	return totalTokens;
}

/**
 * Get loop statistics
 */
function getLoopStats(
	client: DBClient,
	sessionId: string,
): { total: number; successRate: number } {
	const runs = client.listLoopRuns(sessionId, 100);
	const total = runs.length;

	if (total === 0) {
		return { total: 0, successRate: 0 };
	}

	const successful = runs.filter((r) => r.status === "success").length;
	const successRate = Math.round((successful / total) * 100);

	return { total, successRate };
}

/**
 * Check if a loop is currently running
 */
function isLoopActive(client: DBClient, sessionId: string): boolean {
	const runs = client.listLoopRuns(sessionId, 1);
	return runs.length > 0 && runs[0].status === "running";
}

/**
 * Get memory status
 */
export function getMemStatus(context: MemStatusContext): MemStatus {
	const { projectPath, sessionId, client, contextBudget = 100000 } = context;

	// Session stats
	const allSessions = client.db
		.prepare("SELECT COUNT(*) as count FROM sessions")
		.get() as { count: number };
	const recentSessions = getRecentSessionCount(client, 30);

	// Observation stats
	const allObservations = client.db
		.prepare("SELECT COUNT(*) as count FROM observations")
		.get() as { count: number };

	// Storage
	const dbSizeMB = getDBSize(projectPath);

	// Token usage
	const currentTokens = getSessionTokenUsage(client, sessionId);
	const budgetPercent = Math.round((currentTokens / contextBudget) * 100);

	// Loop stats
	const loopStats = getLoopStats(client, sessionId);
	const loopActive = isLoopActive(client, sessionId);

	// Config path
	const configPath = `${projectPath}/.ralph-mem/config.yaml`;

	return {
		sessions: {
			total: allSessions.count,
			recent: recentSessions,
		},
		observations: {
			total: allObservations.count,
		},
		storage: {
			dbSizeMB,
		},
		tokens: {
			currentSession: currentTokens,
			budgetUsed: currentTokens,
			budgetPercent,
		},
		loop: {
			isActive: loopActive,
			totalRuns: loopStats.total,
			successRate: loopStats.successRate,
		},
		configPath: existsSync(configPath) ? configPath : null,
	};
}

/**
 * Format number with comma separators
 */
function formatNumber(n: number): string {
	return n.toLocaleString();
}

/**
 * Format memory status as string
 */
export function formatMemStatus(status: MemStatus): string {
	const loopStatus = status.loop.isActive ? "실행 중" : "비활성";

	return `📊 ralph-mem 상태

메모리:
├─ 세션: ${status.sessions.total}개 (최근 30일: ${status.sessions.recent}개)
├─ 관찰: ${formatNumber(status.observations.total)}개
└─ 용량: ${status.storage.dbSizeMB} MB

토큰:
├─ 현재 세션: ${formatNumber(status.tokens.currentSession)} tokens
├─ Budget: ${formatNumber(status.tokens.budgetUsed)} tokens (${status.tokens.budgetPercent}%)
└─ 사용률: ${status.tokens.budgetPercent}%

Loop:
├─ 현재: ${loopStatus}
├─ 총 실행: ${status.loop.totalRuns}회
└─ 성공률: ${status.loop.successRate}%

설정: ${status.configPath || "(없음)"}`;
}

/**
 * Execute /mem-status skill
 */
export async function executeMemStatus(
	context: MemStatusContext,
): Promise<string> {
	const status = getMemStatus(context);
	return formatMemStatus(status);
}

/**
 * Create mem-status skill instance
 */
export function createMemStatusSkill(context: MemStatusContext) {
	return {
		name: "/mem-status" as const,

		async execute(): Promise<string> {
			return executeMemStatus(context);
		},

		getStatus(): MemStatus {
			return getMemStatus(context);
		},
	};
}

// Legacy interface for backward compatibility
export interface MemStatusInput {
	detailed?: boolean;
}

export interface MemStatusOutput {
	sessionCount: number;
	observationCount: number;
	totalTokens: number;
	oldestEntry?: string;
	newestEntry?: string;
	storageSize?: number;
}

export async function memStatusSkill(
	_input: MemStatusInput,
): Promise<MemStatusOutput> {
	// Legacy function - use createMemStatusSkill instead
	return {
		sessionCount: 0,
		observationCount: 0,
		totalTokens: 0,
	};
}
