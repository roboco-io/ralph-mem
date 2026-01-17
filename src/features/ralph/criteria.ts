/**
 * Success Criteria Evaluator
 *
 * Evaluates success criteria for Ralph Loop iterations.
 * Supports test_pass, build_success, lint_clean, type_check, and custom criteria.
 *
 * See: docs/issues/014-success-criteria/README.md
 */

import { spawn } from "node:child_process";
import type { SuccessCriteria, SuccessCriteriaType } from "../../utils/config";

/**
 * Result of evaluating a success criterion
 */
export interface EvaluationResult {
	success: boolean;
	output: string;
	reason: string;
	exitCode?: number;
	suggestions?: string[];
}

/**
 * Options for criteria evaluation
 */
export interface EvaluationOptions {
	timeout?: number;
	cwd?: string;
}

/**
 * Command configuration for each criteria type
 */
export interface CommandConfig {
	command: string;
	args: string[];
}

/**
 * Default commands for built-in criteria types
 */
const DEFAULT_COMMANDS: Record<
	Exclude<SuccessCriteriaType, "custom">,
	CommandConfig
> = {
	test_pass: { command: "npm", args: ["test"] },
	build_success: { command: "npm", args: ["run", "build"] },
	lint_clean: { command: "npm", args: ["run", "lint"] },
	type_check: { command: "npx", args: ["tsc", "--noEmit"] },
};

/**
 * Default timeout in milliseconds (2 minutes)
 */
const DEFAULT_TIMEOUT = 120000;

/**
 * Execute a command and return the result
 */
export function executeCommand(
	command: string,
	args: string[],
	options: EvaluationOptions = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const timeout = options.timeout ?? DEFAULT_TIMEOUT;
		const cwd = options.cwd ?? process.cwd();

		let stdout = "";
		let stderr = "";
		let killed = false;

		// Build full command string for shell execution
		const fullCommand =
			args.length > 0 ? `${command} ${args.join(" ")}` : command;

		const proc = spawn(fullCommand, [], {
			cwd,
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const timer = setTimeout(() => {
			killed = true;
			proc.kill("SIGTERM");
		}, timeout);

		proc.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				exitCode: killed ? -1 : (code ?? 1),
				stdout,
				stderr,
			});
		});

		proc.on("error", (error) => {
			clearTimeout(timer);
			resolve({
				exitCode: 1,
				stdout: "",
				stderr: error.message,
			});
		});
	});
}

/**
 * Parse a command string into command and args
 */
export function parseCommand(commandStr: string): CommandConfig {
	const parts = commandStr.trim().split(/\s+/);
	return {
		command: parts[0] || "",
		args: parts.slice(1),
	};
}

/**
 * Get the command configuration for a criteria
 */
export function getCommandConfig(criteria: SuccessCriteria): CommandConfig {
	if (criteria.command) {
		return parseCommand(criteria.command);
	}

	if (criteria.type === "custom") {
		return { command: "", args: [] };
	}

	return DEFAULT_COMMANDS[criteria.type];
}

/**
 * Analyze command output to extract suggestions
 * This is a simple pattern-based analysis
 */
export function extractSuggestions(
	criteriaType: SuccessCriteriaType,
	stdout: string,
	stderr: string,
): string[] {
	const suggestions: string[] = [];
	const output = stdout + stderr;

	// Test failures
	if (criteriaType === "test_pass") {
		const failedTests = output.match(/FAIL\s+[\w./]+/g);
		if (failedTests) {
			suggestions.push(
				`Fix failing tests: ${failedTests.slice(0, 3).join(", ")}`,
			);
		}
		if (output.includes("TypeError") || output.includes("ReferenceError")) {
			suggestions.push("Check for runtime errors in test files");
		}
	}

	// Build failures
	if (criteriaType === "build_success") {
		if (output.includes("Cannot find module")) {
			suggestions.push("Install missing dependencies");
		}
		if (output.includes("SyntaxError")) {
			suggestions.push("Fix syntax errors in source files");
		}
	}

	// TypeScript errors
	if (criteriaType === "type_check") {
		const tsErrors = output.match(/TS\d+:/g);
		if (tsErrors) {
			const uniqueErrors = [...new Set(tsErrors)].slice(0, 3);
			suggestions.push(`Fix TypeScript errors: ${uniqueErrors.join(", ")}`);
		}
	}

	// Lint errors
	if (criteriaType === "lint_clean") {
		if (output.includes("error")) {
			suggestions.push("Fix linting errors");
		}
		if (output.includes("warning")) {
			suggestions.push("Consider fixing linting warnings");
		}
	}

	return suggestions;
}

/**
 * Criteria Evaluator interface
 */
export interface CriteriaEvaluator {
	/**
	 * Evaluate a single criterion
	 */
	evaluate(
		criteria: SuccessCriteria,
		options?: EvaluationOptions,
	): Promise<EvaluationResult>;

	/**
	 * Evaluate multiple criteria (all must pass)
	 */
	evaluateAll(
		criteria: SuccessCriteria[],
		options?: EvaluationOptions,
	): Promise<EvaluationResult>;
}

/**
 * Create a criteria evaluator instance
 */
export function createCriteriaEvaluator(): CriteriaEvaluator {
	return {
		async evaluate(
			criteria: SuccessCriteria,
			options: EvaluationOptions = {},
		): Promise<EvaluationResult> {
			const commandConfig = getCommandConfig(criteria);

			// Custom type without command
			if (criteria.type === "custom" && !commandConfig.command) {
				return {
					success: false,
					output: "",
					reason: "Custom criteria requires a command",
				};
			}

			// Empty command
			if (!commandConfig.command) {
				return {
					success: false,
					output: "",
					reason: "No command specified",
				};
			}

			// Execute the command
			const timeout = criteria.timeout ?? options.timeout ?? DEFAULT_TIMEOUT;
			const result = await executeCommand(
				commandConfig.command,
				commandConfig.args,
				{
					...options,
					timeout,
				},
			);

			// Check for timeout
			if (result.exitCode === -1) {
				return {
					success: false,
					output: result.stdout + result.stderr,
					reason: "Command timed out",
					exitCode: -1,
					suggestions: ["Increase timeout or optimize the command"],
				};
			}

			// Determine expected exit code
			const expectedExitCode = criteria.expectedExitCode ?? 0;

			// Check exit code
			const success = result.exitCode === expectedExitCode;
			const output = result.stdout + result.stderr;

			// Extract suggestions on failure
			const suggestions = success
				? undefined
				: extractSuggestions(criteria.type, result.stdout, result.stderr);

			// Build reason
			let reason: string;
			if (success) {
				reason = `${criteria.type} passed`;
			} else {
				reason = `${criteria.type} failed with exit code ${result.exitCode}`;
			}

			return {
				success,
				output,
				reason,
				exitCode: result.exitCode,
				suggestions: suggestions?.length ? suggestions : undefined,
			};
		},

		async evaluateAll(
			criteria: SuccessCriteria[],
			options: EvaluationOptions = {},
		): Promise<EvaluationResult> {
			if (criteria.length === 0) {
				return {
					success: true,
					output: "",
					reason: "No criteria to evaluate",
				};
			}

			const results: EvaluationResult[] = [];
			const allOutput: string[] = [];
			const allSuggestions: string[] = [];

			for (const criterion of criteria) {
				const result = await this.evaluate(criterion, options);
				results.push(result);
				allOutput.push(`[${criterion.type}]\n${result.output}`);

				if (result.suggestions) {
					allSuggestions.push(...result.suggestions);
				}

				// Stop on first failure
				if (!result.success) {
					return {
						success: false,
						output: allOutput.join("\n\n"),
						reason: result.reason,
						exitCode: result.exitCode,
						suggestions: allSuggestions.length ? allSuggestions : undefined,
					};
				}
			}

			return {
				success: true,
				output: allOutput.join("\n\n"),
				reason: `All ${criteria.length} criteria passed`,
			};
		},
	};
}

/**
 * Judge result using Claude (placeholder for Claude integration)
 * This function would call Claude API to analyze the output
 * and provide more intelligent suggestions
 */
export interface ClaudeJudgment {
	success: boolean;
	reason: string;
	suggestions: string[];
}

export type ClaudeJudgeFunction = (
	criteriaType: SuccessCriteriaType,
	output: string,
	exitCode: number,
) => Promise<ClaudeJudgment>;

/**
 * Create a criteria evaluator with Claude-based judgment
 */
export function createCriteriaEvaluatorWithClaude(
	claudeJudge: ClaudeJudgeFunction,
): CriteriaEvaluator {
	const baseEvaluator = createCriteriaEvaluator();

	return {
		async evaluate(
			criteria: SuccessCriteria,
			options: EvaluationOptions = {},
		): Promise<EvaluationResult> {
			// First, run the basic evaluation
			const baseResult = await baseEvaluator.evaluate(criteria, options);

			// If the command timed out or had an error, return immediately
			if (baseResult.exitCode === -1 || baseResult.exitCode === undefined) {
				return baseResult;
			}

			// Use Claude to judge the result
			try {
				const judgment = await claudeJudge(
					criteria.type,
					baseResult.output,
					baseResult.exitCode,
				);

				return {
					success: judgment.success,
					output: baseResult.output,
					reason: judgment.reason,
					exitCode: baseResult.exitCode,
					suggestions: judgment.suggestions.length
						? judgment.suggestions
						: undefined,
				};
			} catch {
				// If Claude fails, fall back to basic result
				return baseResult;
			}
		},

		async evaluateAll(
			criteria: SuccessCriteria[],
			options: EvaluationOptions = {},
		): Promise<EvaluationResult> {
			if (criteria.length === 0) {
				return {
					success: true,
					output: "",
					reason: "No criteria to evaluate",
				};
			}

			const allOutput: string[] = [];
			const allSuggestions: string[] = [];

			for (const criterion of criteria) {
				const result = await this.evaluate(criterion, options);
				allOutput.push(`[${criterion.type}]\n${result.output}`);

				if (result.suggestions) {
					allSuggestions.push(...result.suggestions);
				}

				if (!result.success) {
					return {
						success: false,
						output: allOutput.join("\n\n"),
						reason: result.reason,
						exitCode: result.exitCode,
						suggestions: allSuggestions.length ? allSuggestions : undefined,
					};
				}
			}

			return {
				success: true,
				output: allOutput.join("\n\n"),
				reason: `All ${criteria.length} criteria passed`,
			};
		},
	};
}
