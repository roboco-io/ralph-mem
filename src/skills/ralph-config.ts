/**
 * /ralph config Skill
 *
 * Commands for Ralph Loop configuration:
 * - /ralph config                           # 현재 설정 조회
 * - /ralph config set ralph.max_iterations 15
 * - /ralph config init                      # 대화형 초기 설정
 *
 * See: docs/issues/027-ralph-config-command/README.md
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dump as dumpYaml } from "js-yaml";
import { getProjectDataDir } from "../core/db/paths";
import {
	type Config,
	DEFAULT_CONFIG,
	getProjectConfigPath,
	loadConfig,
	loadYamlConfig,
} from "../utils/config";

/**
 * Config key type for dot notation
 */
export type ConfigKey =
	| "ralph.max_iterations"
	| "ralph.max_duration_ms"
	| "ralph.no_progress_threshold"
	| "ralph.context_budget"
	| "ralph.cooldown_ms"
	| "memory.auto_inject"
	| "memory.max_inject_tokens"
	| "memory.retention_days"
	| "search.fts_first"
	| "search.embedding_fallback"
	| "search.default_limit"
	| "privacy.exclude_patterns"
	| "logging.level"
	| "logging.file";

/**
 * Valid config key set
 */
const VALID_CONFIG_KEYS = new Set<string>([
	"ralph.max_iterations",
	"ralph.max_duration_ms",
	"ralph.no_progress_threshold",
	"ralph.context_budget",
	"ralph.cooldown_ms",
	"memory.auto_inject",
	"memory.max_inject_tokens",
	"memory.retention_days",
	"search.fts_first",
	"search.embedding_fallback",
	"search.default_limit",
	"privacy.exclude_patterns",
	"logging.level",
	"logging.file",
]);

/**
 * Config key type definitions for validation
 */
const CONFIG_KEY_TYPES: Record<
	string,
	"number" | "boolean" | "string" | "array"
> = {
	"ralph.max_iterations": "number",
	"ralph.max_duration_ms": "number",
	"ralph.no_progress_threshold": "number",
	"ralph.context_budget": "number",
	"ralph.cooldown_ms": "number",
	"memory.auto_inject": "boolean",
	"memory.max_inject_tokens": "number",
	"memory.retention_days": "number",
	"search.fts_first": "boolean",
	"search.embedding_fallback": "boolean",
	"search.default_limit": "number",
	"privacy.exclude_patterns": "array",
	"logging.level": "string",
	"logging.file": "boolean",
};

/**
 * Arguments for /ralph config command
 */
export interface RalphConfigArgs {
	subcommand?: "set" | "init" | "get";
	key?: string;
	value?: string;
}

/**
 * Result of /ralph config command
 */
export interface RalphConfigResult {
	success: boolean;
	message: string;
	config?: Config;
	error?: string;
}

/**
 * Project init options
 */
export interface ProjectInitOptions {
	projectType?: "node" | "python" | "go" | "rust" | "other";
	testCommand?: string;
	buildCommand?: string;
}

/**
 * Parse /ralph config arguments
 */
export function parseConfigArgs(argsString: string): RalphConfigArgs {
	const args: RalphConfigArgs = {};
	const trimmed = argsString.trim();

	if (!trimmed) {
		return args;
	}

	// Tokenize
	const tokens: string[] = [];
	let current = "";
	let inQuotes = false;
	let quoteChar = "";

	for (const char of trimmed) {
		if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true;
			quoteChar = char;
		} else if (char === quoteChar && inQuotes) {
			inQuotes = false;
			quoteChar = "";
		} else if (char === " " && !inQuotes) {
			if (current) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}
	if (current) {
		tokens.push(current);
	}

	// Parse tokens
	if (tokens[0] === "set" && tokens.length >= 3) {
		args.subcommand = "set";
		args.key = tokens[1];
		args.value = tokens.slice(2).join(" ");
	} else if (tokens[0] === "init") {
		args.subcommand = "init";
	} else if (tokens[0] === "get" && tokens.length >= 2) {
		args.subcommand = "get";
		args.key = tokens[1];
	} else if (tokens[0] && !tokens[0].startsWith("-")) {
		// Treat single token as get
		args.subcommand = "get";
		args.key = tokens[0];
	}

	return args;
}

/**
 * Check if a key is valid
 */
export function isValidConfigKey(key: string): boolean {
	return VALID_CONFIG_KEYS.has(key);
}

/**
 * Get value at key path from config
 */
export function getConfigValue(config: Config, key: string): unknown {
	const [section, prop] = key.split(".") as [keyof Config, string];
	if (!section || !prop) return undefined;

	const sectionObj = config[section];
	if (!sectionObj || typeof sectionObj !== "object") return undefined;

	return (sectionObj as unknown as Record<string, unknown>)[prop];
}

/**
 * Set value at key path in partial config
 */
export function setConfigValue(
	config: Partial<Config>,
	key: string,
	value: unknown,
): void {
	const [section, prop] = key.split(".") as [keyof Config, string];
	if (!section || !prop) return;

	if (!config[section]) {
		(config as Record<string, Record<string, unknown>>)[section] = {};
	}

	(config[section] as unknown as Record<string, unknown>)[prop] = value;
}

/**
 * Parse value according to expected type
 */
export function parseConfigValue(key: string, valueStr: string): unknown {
	const expectedType = CONFIG_KEY_TYPES[key];

	switch (expectedType) {
		case "number": {
			const num = Number(valueStr);
			if (Number.isNaN(num)) {
				throw new Error(`값이 숫자여야 합니다: ${key}`);
			}
			return num;
		}
		case "boolean": {
			const lower = valueStr.toLowerCase();
			if (lower === "true" || lower === "1" || lower === "yes") {
				return true;
			}
			if (lower === "false" || lower === "0" || lower === "no") {
				return false;
			}
			throw new Error(`값이 boolean이어야 합니다 (true/false): ${key}`);
		}
		case "array": {
			// Try to parse as JSON array, otherwise split by comma
			try {
				const parsed = JSON.parse(valueStr);
				if (Array.isArray(parsed)) {
					return parsed;
				}
			} catch {
				// Not valid JSON, split by comma
			}
			return valueStr.split(",").map((s) => s.trim());
		}
		default:
			return valueStr;
	}
}

/**
 * Validate value type matches expected
 */
export function validateConfigValue(key: string, value: unknown): boolean {
	const expectedType = CONFIG_KEY_TYPES[key];

	switch (expectedType) {
		case "number":
			return typeof value === "number" && !Number.isNaN(value);
		case "boolean":
			return typeof value === "boolean";
		case "array":
			return Array.isArray(value);
		case "string":
			return typeof value === "string";
		default:
			return true;
	}
}

/**
 * Format config for display
 */
export function formatConfig(
	config: Config,
	configPath: string | null,
): string {
	const lines: string[] = [];

	lines.push("⚙️ Ralph 설정\n");

	// Ralph section
	lines.push("ralph:");
	lines.push(`  max_iterations: ${config.ralph.max_iterations}`);
	lines.push(`  max_duration_ms: ${config.ralph.max_duration_ms}`);
	lines.push(`  no_progress_threshold: ${config.ralph.no_progress_threshold}`);
	lines.push(`  context_budget: ${config.ralph.context_budget}`);
	lines.push(`  cooldown_ms: ${config.ralph.cooldown_ms}`);
	if (config.ralph.success_criteria.length > 0) {
		lines.push("  success_criteria:");
		for (const c of config.ralph.success_criteria) {
			lines.push(`    - type: ${c.type}`);
			if (c.command) lines.push(`      command: ${c.command}`);
		}
	}

	lines.push("");

	// Memory section
	lines.push("memory:");
	lines.push(`  auto_inject: ${config.memory.auto_inject}`);
	lines.push(`  max_inject_tokens: ${config.memory.max_inject_tokens}`);
	lines.push(`  retention_days: ${config.memory.retention_days}`);

	lines.push("");

	// Search section
	lines.push("search:");
	lines.push(`  fts_first: ${config.search.fts_first}`);
	lines.push(`  embedding_fallback: ${config.search.embedding_fallback}`);
	lines.push(`  default_limit: ${config.search.default_limit}`);

	lines.push("");

	// Privacy section
	lines.push("privacy:");
	lines.push(
		`  exclude_patterns: [${config.privacy.exclude_patterns.join(", ")}]`,
	);

	lines.push("");

	// Logging section
	lines.push("logging:");
	lines.push(`  level: ${config.logging.level}`);
	lines.push(`  file: ${config.logging.file}`);

	lines.push("");

	// Config path
	if (configPath && existsSync(configPath)) {
		lines.push(`설정 파일: ${configPath}`);
	} else {
		lines.push("설정 파일: (기본값 사용)");
	}

	return lines.join("\n");
}

/**
 * Format single config value
 */
export function formatConfigValue(key: string, value: unknown): string {
	if (Array.isArray(value)) {
		return `${key}: [${value.join(", ")}]`;
	}
	return `${key}: ${value}`;
}

/**
 * Save config to project path
 */
export function saveConfig(projectPath: string, config: Partial<Config>): void {
	const configPath = getProjectConfigPath(projectPath);
	const configDir = dirname(configPath);

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	const yaml = dumpYaml(config, { indent: 2 });
	writeFileSync(configPath, yaml, "utf-8");
}

/**
 * Create initial config for project
 */
export function createInitialConfig(
	options: ProjectInitOptions,
): Partial<Config> {
	const ralph = { ...DEFAULT_CONFIG.ralph };

	// Add success criteria based on project type
	if (options.testCommand) {
		ralph.success_criteria = [
			{
				type: "test_pass",
				command: options.testCommand,
			},
		];
	}

	return { ralph };
}

/**
 * Detect project type from files
 */
export function detectProjectType(
	projectPath: string,
): "node" | "python" | "go" | "rust" | "other" {
	if (existsSync(join(projectPath, "package.json"))) {
		return "node";
	}
	if (
		existsSync(join(projectPath, "pyproject.toml")) ||
		existsSync(join(projectPath, "setup.py")) ||
		existsSync(join(projectPath, "requirements.txt"))
	) {
		return "python";
	}
	if (existsSync(join(projectPath, "go.mod"))) {
		return "go";
	}
	if (existsSync(join(projectPath, "Cargo.toml"))) {
		return "rust";
	}
	return "other";
}

/**
 * Get suggested commands for project type
 */
export function getSuggestedCommands(projectType: string): {
	test: string;
	build: string;
} {
	switch (projectType) {
		case "node":
			return { test: "npm test", build: "npm run build" };
		case "python":
			return { test: "pytest", build: "pip install -e ." };
		case "go":
			return { test: "go test ./...", build: "go build" };
		case "rust":
			return { test: "cargo test", build: "cargo build" };
		default:
			return { test: "make test", build: "make build" };
	}
}

/**
 * Ralph config skill context
 */
export interface RalphConfigContext {
	projectPath: string;
}

/**
 * Create Ralph config skill instance
 */
export function createRalphConfigSkill(context: RalphConfigContext) {
	const { projectPath } = context;

	return {
		name: "/ralph config" as const,

		/**
		 * Show current config
		 */
		show(): RalphConfigResult {
			const config = loadConfig(projectPath);
			const configPath = getProjectConfigPath(projectPath);
			const message = formatConfig(config, configPath);

			return {
				success: true,
				message,
				config,
			};
		},

		/**
		 * Get a specific config value
		 */
		get(key: string): RalphConfigResult {
			if (!isValidConfigKey(key)) {
				return {
					success: false,
					message: "",
					error: `잘못된 설정 키: ${key}`,
				};
			}

			const config = loadConfig(projectPath);
			const value = getConfigValue(config, key);

			return {
				success: true,
				message: formatConfigValue(key, value),
			};
		},

		/**
		 * Set a config value
		 */
		set(key: string, valueStr: string): RalphConfigResult {
			if (!isValidConfigKey(key)) {
				return {
					success: false,
					message: "",
					error: `잘못된 설정 키: ${key}`,
				};
			}

			let value: unknown;
			try {
				value = parseConfigValue(key, valueStr);
			} catch (error) {
				return {
					success: false,
					message: "",
					error: error instanceof Error ? error.message : String(error),
				};
			}

			if (!validateConfigValue(key, value)) {
				return {
					success: false,
					message: "",
					error: `타입이 맞지 않습니다: ${key}는 ${CONFIG_KEY_TYPES[key]}이어야 합니다`,
				};
			}

			// Load existing project config and update
			const configPath = getProjectConfigPath(projectPath);
			const projectConfig = loadYamlConfig(configPath);

			setConfigValue(projectConfig, key, value);
			saveConfig(projectPath, projectConfig);

			return {
				success: true,
				message: `✅ 설정 저장됨: ${formatConfigValue(key, value)}`,
			};
		},

		/**
		 * Initialize config for project
		 */
		init(): RalphConfigResult {
			const configPath = getProjectConfigPath(projectPath);

			if (existsSync(configPath)) {
				return {
					success: false,
					message: "",
					error: `설정 파일이 이미 존재합니다: ${configPath}`,
				};
			}

			const projectType = detectProjectType(projectPath);
			const commands = getSuggestedCommands(projectType);

			const config = createInitialConfig({
				projectType,
				testCommand: commands.test,
			});

			saveConfig(projectPath, config);

			return {
				success: true,
				message: `✅ 설정 파일 생성됨: ${configPath}

프로젝트 유형: ${projectType}
테스트 명령: ${commands.test}
빌드 명령: ${commands.build}

설정 수정: /ralph config set <key> <value>
설정 조회: /ralph config`,
			};
		},

		/**
		 * Execute command
		 */
		execute(args: RalphConfigArgs): RalphConfigResult {
			if (!args.subcommand) {
				return this.show();
			}

			switch (args.subcommand) {
				case "get":
					if (!args.key) {
						return this.show();
					}
					return this.get(args.key);

				case "set":
					if (!args.key || args.value === undefined) {
						return {
							success: false,
							message: "",
							error: "사용법: /ralph config set <key> <value>",
						};
					}
					return this.set(args.key, args.value);

				case "init":
					return this.init();

				default:
					return this.show();
			}
		},

		parseArgs(argsString: string): RalphConfigArgs {
			return parseConfigArgs(argsString);
		},
	};
}

/**
 * Execute /ralph config command
 */
export async function executeRalphConfig(
	argsString: string,
	context: RalphConfigContext,
): Promise<string> {
	const skill = createRalphConfigSkill(context);
	const args = skill.parseArgs(argsString);
	const result = skill.execute(args);

	if (result.error) {
		return `❌ ${result.error}`;
	}

	return result.message;
}
