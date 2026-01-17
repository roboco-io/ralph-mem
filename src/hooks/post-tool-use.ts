/**
 * PostToolUse Hook
 *
 * Triggered after a tool is used.
 * Records tool usage as an observation.
 *
 * See: docs/design/hook-layer.md
 */

import { type DBClient, createDBClient } from "../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../core/db/paths";
import type { ObservationType } from "../core/db/types";
import { type Config, loadConfig } from "../utils/config";
import { isEntirelyPrivate, stripPrivateTags } from "../utils/privacy";

/**
 * Loop context for tool use within Ralph Loop
 */
export interface LoopContext {
	runId: string;
	iteration: number;
}

export interface PostToolUseContext {
	toolName: string;
	toolInput: unknown;
	toolOutput: unknown;
	sessionId: string;
	projectPath: string;
	success: boolean;
	error?: string;
	loopContext?: LoopContext;
}

export interface PostToolUseResult {
	observationId: string | null;
	recorded: boolean;
	type: ObservationType | null;
	importance: number;
}

/**
 * Tools that should be recorded
 * - Edit, Write: code changes
 * - Bash: command execution results
 * - NotebookEdit: notebook changes
 */
const RECORDABLE_TOOLS = new Set([
	"Edit",
	"Write",
	"Bash",
	"NotebookEdit",
	"MultiEdit",
]);

/**
 * Read-only tools that should NOT be recorded
 */
const READ_ONLY_TOOLS = new Set([
	"Read",
	"Glob",
	"Grep",
	"LS",
	"WebFetch",
	"WebSearch",
]);

/**
 * Check if a tool should be recorded
 */
export function shouldRecordTool(toolName: string): boolean {
	if (RECORDABLE_TOOLS.has(toolName)) {
		return true;
	}
	if (READ_ONLY_TOOLS.has(toolName)) {
		return false;
	}
	// Default: record unknown tools (safer)
	return true;
}

/**
 * Calculate observation type based on tool and result
 */
export function getObservationType(
	toolName: string,
	success: boolean,
): ObservationType {
	if (!success) {
		return "error";
	}

	if (toolName === "Bash") {
		return "bash";
	}

	return "tool_use";
}

/**
 * Calculate importance based on context
 *
 * Importance levels:
 * - 1.0: errors (always important)
 * - 0.9: test results
 * - 0.7: file modifications
 * - 0.5: general commands
 */
export function calculateImportance(context: PostToolUseContext): number {
	// Errors are always high importance
	if (!context.success) {
		return 1.0;
	}

	const output = String(context.toolOutput || "").toLowerCase();

	// Test results
	if (
		context.toolName === "Bash" &&
		(output.includes("test") ||
			output.includes("passed") ||
			output.includes("failed"))
	) {
		return 0.9;
	}

	// File modifications
	if (
		context.toolName === "Edit" ||
		context.toolName === "Write" ||
		context.toolName === "NotebookEdit"
	) {
		return 0.7;
	}

	// General commands
	return 0.5;
}

/**
 * Format output for storage
 * Truncates long outputs and removes sensitive data
 */
export function formatOutput(output: unknown, maxLength = 2000): string {
	const str = typeof output === "string" ? output : JSON.stringify(output);

	if (str.length <= maxLength) {
		return str;
	}

	return `${str.slice(0, maxLength)}... [truncated]`;
}

/**
 * Check if content should be excluded based on privacy patterns
 */
export function shouldExclude(content: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		// Convert glob pattern to regex
		const regexPattern = pattern
			.replace(/\./g, "\\.")
			.replace(/\*/g, ".*")
			.replace(/\?/g, ".");

		const regex = new RegExp(regexPattern, "i");
		if (regex.test(content)) {
			return true;
		}
	}
	return false;
}

/**
 * Mask sensitive information in content
 */
export function maskSensitiveData(content: string): string {
	// Mask common sensitive patterns
	let masked = content;

	// API keys (various formats)
	masked = masked.replace(
		/([a-zA-Z_]*(?:api|key|token|secret|password)[a-zA-Z_]*[\s:=]+)['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
		"$1[MASKED]",
	);

	// Bearer tokens
	masked = masked.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [MASKED]");

	// Common environment variable patterns
	masked = masked.replace(
		/^([A-Z_]+_(?:KEY|SECRET|TOKEN|PASSWORD))\s*=\s*.+$/gm,
		"$1=[MASKED]",
	);

	return masked;
}

/**
 * PostToolUse Hook implementation
 */
export async function postToolUseHook(
	context: PostToolUseContext,
	options?: {
		config?: Partial<Config>;
		client?: DBClient;
	},
): Promise<PostToolUseResult> {
	const { toolName, sessionId, projectPath, success } = context;

	// Check if tool should be recorded
	if (!shouldRecordTool(toolName)) {
		return {
			observationId: null,
			recorded: false,
			type: null,
			importance: 0,
		};
	}

	// Load config
	const config = options?.config
		? { ...loadConfig(projectPath), ...options.config }
		: loadConfig(projectPath);

	// Format output
	let content = formatOutput(context.toolOutput);

	// Add error info if present
	if (context.error) {
		content = `Error: ${context.error}\n${content}`;
	}

	// Check if entire content is wrapped in <private> tags
	if (isEntirelyPrivate(content)) {
		return {
			observationId: null,
			recorded: false,
			type: null,
			importance: 0,
		};
	}

	// Strip <private> tagged content
	content = stripPrivateTags(content);

	// Check privacy exclusions
	if (shouldExclude(content, config.privacy.exclude_patterns)) {
		return {
			observationId: null,
			recorded: false,
			type: null,
			importance: 0,
		};
	}

	// Mask sensitive data
	content = maskSensitiveData(content);

	// Calculate type and importance
	const type = getObservationType(toolName, success);
	const importance = calculateImportance(context);

	// Initialize DB
	ensureProjectDirs(projectPath);
	const dbPath = getProjectDBPath(projectPath);

	const client = options?.client ?? createDBClient(dbPath);

	// Check if session exists and is active
	const session = client.getSession(sessionId);
	if (!session || session.ended_at) {
		if (!options?.client) {
			client.close();
		}
		return {
			observationId: null,
			recorded: false,
			type: null,
			importance: 0,
		};
	}

	// Create observation directly via client
	const observation = client.createObservation({
		session_id: sessionId,
		type,
		tool_name: toolName,
		content,
		importance,
		loop_run_id: context.loopContext?.runId,
		iteration: context.loopContext?.iteration,
	});

	// Close if we created the client
	if (!options?.client) {
		client.close();
	}

	return {
		observationId: observation.id,
		recorded: true,
		type,
		importance,
	};
}
