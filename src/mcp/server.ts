/**
 * MCP Server for ralph-mem
 *
 * Provides memory search and observation tools via Model Context Protocol.
 * Tools:
 *   - ralph_mem_search: Search memories with Progressive Disclosure
 *   - ralph_mem_timeline: Get time-ordered observations around a point
 *   - ralph_mem_get: Get full observation details by ID
 */

import { createDBClient } from "../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../core/db/paths";
import type { ObservationType } from "../core/db/types";
import { type SearchOptions, createSearchEngine } from "../core/search";

export interface MCPTool {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export interface MCPToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface MCPToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

/**
 * MCP Tool definitions
 */
export const MCP_TOOLS: MCPTool[] = [
	{
		name: "ralph_mem_search",
		description:
			"Search memories using Progressive Disclosure. Layer 1 returns compact results (~50-100 tokens), Layer 2 adds context (~200-300 tokens), Layer 3 returns full details (~500-1000 tokens).",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query",
				},
				layer: {
					type: "number",
					description: "Detail level (1=index, 2=context, 3=full)",
					enum: [1, 2, 3],
					default: 1,
				},
				limit: {
					type: "number",
					description: "Maximum results to return",
					default: 10,
				},
				since: {
					type: "string",
					description:
						"Filter results after this date (ISO format or relative like '7d')",
				},
				types: {
					type: "array",
					items: { type: "string" },
					description:
						"Filter by observation types (tool_use, bash, error, success, note)",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "ralph_mem_timeline",
		description:
			"Get time-ordered observations around a specific observation. Useful for understanding context.",
		inputSchema: {
			type: "object",
			properties: {
				observationId: {
					type: "string",
					description: "The observation ID to center the timeline around",
				},
				before: {
					type: "number",
					description: "Number of observations before",
					default: 3,
				},
				after: {
					type: "number",
					description: "Number of observations after",
					default: 3,
				},
			},
			required: ["observationId"],
		},
	},
	{
		name: "ralph_mem_get",
		description: "Get full details of a specific observation by ID.",
		inputSchema: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "Observation ID",
				},
			},
			required: ["id"],
		},
	},
];

/**
 * Parse relative date string (e.g., "7d", "24h", "30m") to Date
 */
function parseRelativeDate(str: string): Date | null {
	const match = str.match(/^(\d+)([dhm])$/);
	if (!match) return null;

	const value = Number.parseInt(match[1], 10);
	const unit = match[2];

	const now = new Date();
	switch (unit) {
		case "d":
			return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
		case "h":
			return new Date(now.getTime() - value * 60 * 60 * 1000);
		case "m":
			return new Date(now.getTime() - value * 60 * 1000);
		default:
			return null;
	}
}

/**
 * Handle MCP tool calls
 */
export function handleToolCall(
	call: MCPToolCall,
	projectPath: string,
): MCPToolResult {
	try {
		ensureProjectDirs(projectPath);
		const dbPath = getProjectDBPath(projectPath);

		switch (call.name) {
			case "ralph_mem_search":
				return handleSearch(call.arguments, dbPath);
			case "ralph_mem_timeline":
				return handleTimeline(call.arguments, dbPath);
			case "ralph_mem_get":
				return handleGet(call.arguments, dbPath);
			default:
				return {
					content: [{ type: "text", text: `Unknown tool: ${call.name}` }],
					isError: true,
				};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: "text", text: `Error: ${message}` }],
			isError: true,
		};
	}
}

function handleSearch(
	args: Record<string, unknown>,
	dbPath: string,
): MCPToolResult {
	const query = args.query as string;
	const layer = (args.layer as 1 | 2 | 3) ?? 1;
	const limit = (args.limit as number) ?? 10;
	const sinceStr = args.since as string | undefined;
	const types = args.types as ObservationType[] | undefined;

	const options: SearchOptions = { layer, limit, types };

	// Parse since date
	if (sinceStr) {
		// Try relative date first
		const relativeDate = parseRelativeDate(sinceStr);
		if (relativeDate) {
			options.since = relativeDate;
		} else {
			// Try ISO date
			const isoDate = new Date(sinceStr);
			if (!Number.isNaN(isoDate.getTime())) {
				options.since = isoDate;
			}
		}
	}

	const engine = createSearchEngine(dbPath);
	try {
		const results = engine.search(query, options);

		if (results.length === 0) {
			return {
				content: [{ type: "text", text: "No results found." }],
			};
		}

		// Format results based on layer
		const formatted = results.map((r, i) => {
			const parts = [`${i + 1}. [${r.id}] (score: ${r.score.toFixed(2)})`];

			if (r.summary) {
				parts.push(`   ${r.summary}`);
			}

			if (layer >= 2 && r.createdAt) {
				parts.push(`   Time: ${r.createdAt.toISOString()}`);
				if (r.type) parts.push(`   Type: ${r.type}`);
				if (r.toolName) parts.push(`   Tool: ${r.toolName}`);
			}

			if (layer >= 3 && r.content) {
				parts.push(`   Content: ${r.content}`);
			}

			return parts.join("\n");
		});

		return {
			content: [
				{
					type: "text",
					text: `Found ${results.length} results:\n\n${formatted.join("\n\n")}`,
				},
			],
		};
	} finally {
		engine.close();
	}
}

function handleTimeline(
	args: Record<string, unknown>,
	dbPath: string,
): MCPToolResult {
	const observationId = args.observationId as string;
	const before = (args.before as number) ?? 3;
	const after = (args.after as number) ?? 3;

	const client = createDBClient(dbPath);
	try {
		// Get the target observation
		const target = client.getObservation(observationId);
		if (!target) {
			return {
				content: [
					{ type: "text", text: `Observation not found: ${observationId}` },
				],
				isError: true,
			};
		}

		// Get observations before
		const beforeObs = client.db
			.prepare(
				`
				SELECT * FROM observations
				WHERE session_id = ? AND created_at < ?
				ORDER BY created_at DESC
				LIMIT ?
			`,
			)
			.all(target.session_id, target.created_at, before) as Array<{
			id: string;
			type: string;
			tool_name: string | null;
			content: string;
			created_at: string;
		}>;

		// Get observations after
		const afterObs = client.db
			.prepare(
				`
				SELECT * FROM observations
				WHERE session_id = ? AND created_at > ?
				ORDER BY created_at ASC
				LIMIT ?
			`,
			)
			.all(target.session_id, target.created_at, after) as Array<{
			id: string;
			type: string;
			tool_name: string | null;
			content: string;
			created_at: string;
		}>;

		// Format timeline
		const formatObs = (
			o: {
				id: string;
				type: string;
				tool_name: string | null;
				content: string;
				created_at: string;
			},
			marker = "",
		) => {
			const summary =
				o.content.slice(0, 100) + (o.content.length > 100 ? "..." : "");
			return `${marker}[${o.id}] ${o.created_at}\n   Type: ${o.type}${o.tool_name ? `, Tool: ${o.tool_name}` : ""}\n   ${summary}`;
		};

		const lines = [
			"=== Timeline ===",
			"",
			...beforeObs.reverse().map((o) => formatObs(o)),
			"",
			formatObs(target, ">>> "),
			"",
			...afterObs.map((o) => formatObs(o)),
		];

		return {
			content: [{ type: "text", text: lines.join("\n") }],
		};
	} finally {
		client.close();
	}
}

function handleGet(
	args: Record<string, unknown>,
	dbPath: string,
): MCPToolResult {
	const id = args.id as string;

	const client = createDBClient(dbPath);
	try {
		const obs = client.getObservation(id);
		if (!obs) {
			return {
				content: [{ type: "text", text: `Observation not found: ${id}` }],
				isError: true,
			};
		}

		const details = [
			`ID: ${obs.id}`,
			`Session: ${obs.session_id}`,
			`Type: ${obs.type}`,
			`Tool: ${obs.tool_name ?? "N/A"}`,
			`Importance: ${obs.importance}`,
			`Created: ${obs.created_at}`,
			"",
			"Content:",
			obs.content,
		];

		return {
			content: [{ type: "text", text: details.join("\n") }],
		};
	} finally {
		client.close();
	}
}
