/**
 * Context Compressor
 *
 * Compresses observations to save context budget.
 * Uses different strategies based on observation type.
 *
 * See: docs/issues/022-compressor/README.md
 */

import type { DBClient } from "./db/client";
import type { Observation, ObservationType } from "./db/types";

/**
 * Compression function type (for AI integration)
 */
export type CompressFunction = (
	type: ObservationType,
	content: string,
	toolName?: string,
) => Promise<string>;

/**
 * Compressor interface
 */
export interface Compressor {
	compress(obs: Observation): Promise<string>;
	shouldCompress(obs: Observation): boolean;
	compressBatch(observations: Observation[]): Promise<void>;
}

/**
 * Compressor options
 */
export interface CompressorOptions {
	client: DBClient;
	compressFunction?: CompressFunction;
	maxContentLength?: number;
}

/**
 * Types that should never be compressed
 */
const SKIP_TYPES: Set<ObservationType> = new Set(["error", "success"]);

/**
 * Default max content length before compression
 */
const DEFAULT_MAX_LENGTH = 500;

/**
 * Check if content needs compression based on length
 */
export function needsCompression(content: string, maxLength: number): boolean {
	return content.length > maxLength;
}

/**
 * Simple rule-based compression for tool_use
 */
export function compressToolUse(content: string, toolName?: string): string {
	// Extract key information
	const lines = content.split("\n").filter((l) => l.trim());

	// For file operations, keep file path and status
	if (toolName === "Edit" || toolName === "Write" || toolName === "Read") {
		const pathMatch = content.match(
			/(?:path|file|edited|wrote)[:=\s]+([^\n]+)/i,
		);
		const path = pathMatch?.[1]?.trim() || "unknown file";
		const success =
			content.toLowerCase().includes("success") ||
			content.toLowerCase().includes("updated") ||
			content.toLowerCase().includes("created");
		return `${toolName}: ${path} - ${success ? "성공" : "완료"}`;
	}

	// For search tools, keep match count
	if (toolName === "Grep" || toolName === "Glob") {
		const matchCount = (content.match(/\n/g)?.length || 0) + 1;
		return `${toolName}: ${matchCount}개 결과`;
	}

	// Generic compression: first and last lines
	if (lines.length > 3) {
		return `${lines[0]}\n...(${lines.length - 2}줄 생략)...\n${lines[lines.length - 1]}`;
	}

	return content;
}

/**
 * Simple rule-based compression for bash output
 */
export function compressBash(content: string): string {
	// Extract command if present
	const commandMatch = content.match(/^\$?\s*(.+?)(?:\n|$)/);
	const command = commandMatch?.[1]?.trim() || "";

	// Count output lines
	const lines = content.split("\n").filter((l) => l.trim());
	const outputLines = command ? lines.length - 1 : lines.length;

	// Check for common patterns
	const hasError =
		content.toLowerCase().includes("error") ||
		content.toLowerCase().includes("fail");
	const hasSuccess =
		content.toLowerCase().includes("success") ||
		content.toLowerCase().includes("pass");

	let status = "";
	if (hasError) status = "오류 포함";
	else if (hasSuccess) status = "성공";
	else status = `${outputLines}줄 출력`;

	if (command) {
		return `$ ${command.slice(0, 50)}${command.length > 50 ? "..." : ""} → ${status}`;
	}

	return `Bash 실행: ${status}`;
}

/**
 * Simple rule-based compression for notes
 */
export function compressNote(content: string): string {
	const lines = content.split("\n").filter((l) => l.trim());

	if (lines.length <= 3) {
		return content;
	}

	// Keep first sentence or line
	const firstLine = lines[0];
	return `${firstLine.slice(0, 100)}${firstLine.length > 100 ? "..." : ""} (+${lines.length - 1}줄)`;
}

/**
 * Default rule-based compression function
 */
export async function defaultCompress(
	type: ObservationType,
	content: string,
	toolName?: string,
): Promise<string> {
	switch (type) {
		case "tool_use":
			return compressToolUse(content, toolName ?? undefined);
		case "bash":
			return compressBash(content);
		case "note":
			return compressNote(content);
		default:
			return content;
	}
}

/**
 * Create a compressor instance
 */
export function createCompressor(options: CompressorOptions): Compressor {
	const {
		client,
		compressFunction = defaultCompress,
		maxContentLength = DEFAULT_MAX_LENGTH,
	} = options;

	return {
		shouldCompress(obs: Observation): boolean {
			// Never compress certain types
			if (SKIP_TYPES.has(obs.type)) {
				return false;
			}

			// Don't re-compress
			if (obs.content_compressed) {
				return false;
			}

			// Check length
			return needsCompression(obs.content, maxContentLength);
		},

		async compress(obs: Observation): Promise<string> {
			if (!this.shouldCompress(obs)) {
				return obs.content;
			}

			const compressed = await compressFunction(
				obs.type,
				obs.content,
				obs.tool_name ?? undefined,
			);

			return compressed;
		},

		async compressBatch(observations: Observation[]): Promise<void> {
			const toCompress = observations.filter((obs) => this.shouldCompress(obs));

			for (const obs of toCompress) {
				const compressed = await this.compress(obs);

				// Update in database
				client.db
					.prepare(
						"UPDATE observations SET content_compressed = ? WHERE id = ?",
					)
					.run(compressed, obs.id);
			}
		},
	};
}

/**
 * Calculate compression ratio
 */
export function compressionRatio(original: string, compressed: string): number {
	if (original.length === 0) return 1;
	return compressed.length / original.length;
}

/**
 * Auto-compress old observations when budget exceeded
 */
export async function autoCompress(
	client: DBClient,
	sessionId: string,
	options?: {
		budgetThreshold?: number; // 0.0-1.0, default 0.6
		targetRatio?: number; // Target compression ratio, default 0.5
		maxObservations?: number; // Max to compress at once, default 10
		compressFunction?: CompressFunction;
	},
): Promise<{ compressed: number; savedChars: number }> {
	const threshold = options?.budgetThreshold ?? 0.6;
	const maxObs = options?.maxObservations ?? 10;

	// Get observations for session
	const observations = client.listObservations(sessionId, 100);

	// Calculate current content size
	const totalSize = observations.reduce(
		(sum, obs) => sum + obs.content.length,
		0,
	);

	// Simple budget check (you'd typically compare against config.ralph.context_budget)
	// Here we just check if there are many large observations
	const largeObs = observations.filter(
		(obs) =>
			obs.content.length > 500 &&
			!obs.content_compressed &&
			!SKIP_TYPES.has(obs.type),
	);

	if (largeObs.length === 0) {
		return { compressed: 0, savedChars: 0 };
	}

	const compressor = createCompressor({
		client,
		compressFunction: options?.compressFunction,
	});

	// Sort by importance (lowest first) and age (oldest first)
	const sorted = [...largeObs].sort((a, b) => {
		if (a.importance !== b.importance) {
			return a.importance - b.importance;
		}
		return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
	});

	// Compress up to maxObs
	const toCompress = sorted.slice(0, maxObs);
	let savedChars = 0;

	for (const obs of toCompress) {
		const compressed = await compressor.compress(obs);
		savedChars += obs.content.length - compressed.length;

		client.db
			.prepare("UPDATE observations SET content_compressed = ? WHERE id = ?")
			.run(compressed, obs.id);
	}

	return {
		compressed: toCompress.length,
		savedChars,
	};
}
