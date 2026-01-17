/**
 * Configuration System
 *
 * Manages global and project-specific configurations with deep merge.
 * Priority: defaults < global (~/.config/ralph-mem/config.yaml) < project (.ralph-mem/config.yaml)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import { getGlobalConfigDir, getProjectDataDir } from "../core/db/paths";

/**
 * Success criteria types for Ralph Loop
 */
export type SuccessCriteriaType =
	| "test_pass"
	| "build_success"
	| "lint_clean"
	| "type_check"
	| "custom";

export interface SuccessCriteria {
	type: SuccessCriteriaType;
	command?: string;
	pattern?: string;
	expectedExitCode?: number;
	timeout?: number;
}

/**
 * Log level types
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Ralph Loop configuration
 */
export interface RalphConfig {
	max_iterations: number;
	max_duration_ms: number;
	no_progress_threshold: number;
	context_budget: number;
	cooldown_ms: number;
	success_criteria: SuccessCriteria[];
}

/**
 * Memory configuration
 */
export interface MemoryConfig {
	auto_inject: boolean;
	max_inject_tokens: number;
	retention_days: number;
}

/**
 * Search configuration
 */
export interface SearchConfig {
	fts_first: boolean;
	embedding_fallback: boolean;
	default_limit: number;
}

/**
 * Privacy configuration
 */
export interface PrivacyConfig {
	exclude_patterns: string[];
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
	level: LogLevel;
	file: boolean;
}

/**
 * Full configuration interface
 */
export interface Config {
	ralph: RalphConfig;
	memory: MemoryConfig;
	search: SearchConfig;
	privacy: PrivacyConfig;
	logging: LoggingConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
	ralph: {
		max_iterations: 10,
		max_duration_ms: 1800000, // 30 minutes
		no_progress_threshold: 3,
		context_budget: 50000,
		cooldown_ms: 1000,
		success_criteria: [{ type: "test_pass" }],
	},
	memory: {
		auto_inject: true,
		max_inject_tokens: 2000,
		retention_days: 30,
	},
	search: {
		fts_first: true,
		embedding_fallback: false,
		default_limit: 10,
	},
	privacy: {
		exclude_patterns: ["*.env", "*.key", "*secret*", "*password*"],
	},
	logging: {
		level: "info",
		file: false,
	},
};

/**
 * Deep merge two objects
 * Arrays are replaced, not merged
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
	const result = { ...target } as T;

	for (const key in source) {
		if (Object.prototype.hasOwnProperty.call(source, key)) {
			const sourceValue = source[key];
			const targetValue = (result as Record<string, unknown>)[key];

			if (
				sourceValue !== null &&
				typeof sourceValue === "object" &&
				!Array.isArray(sourceValue) &&
				targetValue !== null &&
				typeof targetValue === "object" &&
				!Array.isArray(targetValue)
			) {
				(result as Record<string, unknown>)[key] = deepMerge(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				);
			} else if (sourceValue !== undefined) {
				(result as Record<string, unknown>)[key] = sourceValue;
			}
		}
	}

	return result;
}

/**
 * Get the global config file path
 */
export function getGlobalConfigPath(): string {
	return join(getGlobalConfigDir(), "config.yaml");
}

/**
 * Get the project config file path
 */
export function getProjectConfigPath(projectPath: string): string {
	return join(getProjectDataDir(projectPath), "config.yaml");
}

/**
 * Load a YAML config file
 * Returns empty object if file doesn't exist
 * Throws if file exists but is invalid YAML
 */
export function loadYamlConfig(filePath: string): Partial<Config> {
	if (!existsSync(filePath)) {
		return {};
	}

	const content = readFileSync(filePath, "utf-8");
	if (!content.trim()) {
		return {};
	}

	const parsed = loadYaml(content);
	if (parsed === null || parsed === undefined) {
		return {};
	}

	if (typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Invalid config file: ${filePath} - expected object`);
	}

	return parsed as Partial<Config>;
}

/**
 * Load configuration with priority: defaults < global < project
 */
export function loadConfig(projectPath?: string): Config {
	// Start with defaults
	let config = deepMerge({} as Config, DEFAULT_CONFIG);

	// Merge global config
	const globalPath = getGlobalConfigPath();
	const globalConfig = loadYamlConfig(globalPath);
	config = deepMerge(config, globalConfig);

	// Merge project config if project path is provided
	if (projectPath) {
		const projectConfigPath = getProjectConfigPath(projectPath);
		const projectConfig = loadYamlConfig(projectConfigPath);
		config = deepMerge(config, projectConfig);
	}

	return config;
}

/**
 * Get a specific config section
 */
export function getConfigSection<K extends keyof Config>(
	section: K,
	projectPath?: string,
): Config[K] {
	const config = loadConfig(projectPath);
	return config[section];
}
