import { describe, expect, it, vi } from "vitest";
import {
	type ClaudeJudgeFunction,
	type CriteriaEvaluator,
	type EvaluationOptions,
	type EvaluationResult,
	createCriteriaEvaluator,
	createCriteriaEvaluatorWithClaude,
	executeCommand,
	extractSuggestions,
	getCommandConfig,
	parseCommand,
} from "../../../src/features/ralph/criteria";
import type { SuccessCriteria } from "../../../src/utils/config";

describe("Success Criteria Evaluator", () => {
	describe("parseCommand", () => {
		it("should parse simple command", () => {
			const result = parseCommand("npm test");

			expect(result.command).toBe("npm");
			expect(result.args).toEqual(["test"]);
		});

		it("should parse command with multiple args", () => {
			const result = parseCommand("npm run build --production");

			expect(result.command).toBe("npm");
			expect(result.args).toEqual(["run", "build", "--production"]);
		});

		it("should handle single command without args", () => {
			const result = parseCommand("ls");

			expect(result.command).toBe("ls");
			expect(result.args).toEqual([]);
		});

		it("should handle extra whitespace", () => {
			const result = parseCommand("  npm   test  ");

			expect(result.command).toBe("npm");
			expect(result.args).toEqual(["test"]);
		});

		it("should handle empty string", () => {
			const result = parseCommand("");

			expect(result.command).toBe("");
			expect(result.args).toEqual([]);
		});
	});

	describe("getCommandConfig", () => {
		it("should return default command for test_pass", () => {
			const criteria: SuccessCriteria = { type: "test_pass" };
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("npm");
			expect(config.args).toEqual(["test"]);
		});

		it("should return default command for build_success", () => {
			const criteria: SuccessCriteria = { type: "build_success" };
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("npm");
			expect(config.args).toEqual(["run", "build"]);
		});

		it("should return default command for lint_clean", () => {
			const criteria: SuccessCriteria = { type: "lint_clean" };
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("npm");
			expect(config.args).toEqual(["run", "lint"]);
		});

		it("should return default command for type_check", () => {
			const criteria: SuccessCriteria = { type: "type_check" };
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("npx");
			expect(config.args).toEqual(["tsc", "--noEmit"]);
		});

		it("should use custom command when provided", () => {
			const criteria: SuccessCriteria = {
				type: "test_pass",
				command: "bun test",
			};
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("bun");
			expect(config.args).toEqual(["test"]);
		});

		it("should return empty for custom type without command", () => {
			const criteria: SuccessCriteria = { type: "custom" };
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("");
			expect(config.args).toEqual([]);
		});

		it("should parse custom command for custom type", () => {
			const criteria: SuccessCriteria = {
				type: "custom",
				command: "./run-checks.sh",
			};
			const config = getCommandConfig(criteria);

			expect(config.command).toBe("./run-checks.sh");
			expect(config.args).toEqual([]);
		});
	});

	describe("executeCommand", () => {
		it("should execute simple command successfully", async () => {
			const result = await executeCommand("echo", ["hello"]);

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("hello");
			expect(result.stderr).toBe("");
		});

		it("should return non-zero exit code for failing command", async () => {
			const result = await executeCommand("exit 1", []);

			expect(result.exitCode).not.toBe(0);
		});

		it("should capture stderr", async () => {
			const result = await executeCommand("echo 'error message' >&2", []);

			expect(result.exitCode).toBe(0);
			expect(result.stderr.trim()).toBe("error message");
		});

		it("should handle command not found", async () => {
			const result = await executeCommand("nonexistentcommand12345", []);

			// Exit code 127 = command not found in shell
			expect(result.exitCode).not.toBe(0);
		});

		it("should timeout long running command", async () => {
			const result = await executeCommand("sleep", ["10"], {
				timeout: 100,
			});

			expect(result.exitCode).toBe(-1);
		});

		it("should use custom cwd", async () => {
			const result = await executeCommand("pwd", [], {
				cwd: "/tmp",
			});

			expect(result.exitCode).toBe(0);
			// /tmp might be a symlink to /private/tmp on macOS
			expect(result.stdout.trim()).toMatch(/\/?tmp$/);
		});
	});

	describe("extractSuggestions", () => {
		it("should extract suggestions for failed tests", () => {
			const output =
				"FAIL tests/example.test.ts\nTypeError: undefined is not a function";
			const suggestions = extractSuggestions("test_pass", output, "");

			expect(suggestions).toContain(
				"Fix failing tests: FAIL tests/example.test.ts",
			);
			expect(suggestions).toContain("Check for runtime errors in test files");
		});

		it("should extract suggestions for build failures", () => {
			const output =
				"Cannot find module 'lodash'\nSyntaxError: Unexpected token";
			const suggestions = extractSuggestions("build_success", output, "");

			expect(suggestions).toContain("Install missing dependencies");
			expect(suggestions).toContain("Fix syntax errors in source files");
		});

		it("should extract suggestions for TypeScript errors", () => {
			const output =
				"error TS2339: Property 'x' does not exist\nerror TS2304: Cannot find name 'y'";
			const suggestions = extractSuggestions("type_check", output, "");

			expect(
				suggestions.some((s) => s.includes("TS2339") || s.includes("TS2304")),
			).toBe(true);
		});

		it("should extract suggestions for lint errors", () => {
			const output =
				"error: Unexpected console statement\nwarning: Missing semicolon";
			const suggestions = extractSuggestions("lint_clean", output, "");

			expect(suggestions).toContain("Fix linting errors");
			expect(suggestions).toContain("Consider fixing linting warnings");
		});

		it("should return empty array for successful output", () => {
			const output = "All tests passed";
			const suggestions = extractSuggestions("test_pass", output, "");

			expect(suggestions).toEqual([]);
		});
	});

	describe("createCriteriaEvaluator", () => {
		let evaluator: CriteriaEvaluator;

		it("should create evaluator instance", () => {
			evaluator = createCriteriaEvaluator();

			expect(evaluator).toBeDefined();
			expect(typeof evaluator.evaluate).toBe("function");
			expect(typeof evaluator.evaluateAll).toBe("function");
		});

		describe("evaluate", () => {
			it("should evaluate successful command", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = {
					type: "custom",
					command: "echo success",
				};

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(true);
				expect(result.exitCode).toBe(0);
				expect(result.output.trim()).toBe("success");
				expect(result.reason).toContain("passed");
			});

			it("should evaluate failing command", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = {
					type: "custom",
					command: "sh -c 'exit 1'",
				};

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(false);
				expect(result.exitCode).not.toBe(0);
				expect(result.reason).toContain("failed");
			});

			it("should handle custom expected exit code", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = {
					type: "custom",
					command: "sh -c 'exit 42'",
					expectedExitCode: 42,
				};

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(true);
				expect(result.exitCode).toBe(42);
			});

			it("should handle timeout", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = {
					type: "custom",
					command: "sleep 10",
					timeout: 100,
				};

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(false);
				expect(result.exitCode).toBe(-1);
				expect(result.reason).toContain("timed out");
				expect(result.suggestions).toContain(
					"Increase timeout or optimize the command",
				);
			});

			it("should return error for custom type without command", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = { type: "custom" };

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(false);
				expect(result.reason).toContain("requires a command");
			});

			it("should use criteria timeout when specified", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = {
					type: "custom",
					command: "sleep 10",
					timeout: 100,
				};

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(false);
				expect(result.exitCode).toBe(-1);
			}, 10000);

			it("should use criteria timeout when no options timeout", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria = {
					type: "custom",
					command: "sleep 10",
					timeout: 100,
				};

				const result = await evaluator.evaluate(criteria);

				expect(result.success).toBe(false);
				expect(result.exitCode).toBe(-1);
			});
		});

		describe("evaluateAll", () => {
			it("should return success for empty criteria list", async () => {
				evaluator = createCriteriaEvaluator();

				const result = await evaluator.evaluateAll([]);

				expect(result.success).toBe(true);
				expect(result.reason).toContain("No criteria");
			});

			it("should evaluate all criteria and return success", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria[] = [
					{ type: "custom", command: "echo first" },
					{ type: "custom", command: "echo second" },
				];

				const result = await evaluator.evaluateAll(criteria);

				expect(result.success).toBe(true);
				expect(result.reason).toContain("2 criteria passed");
				expect(result.output).toContain("first");
				expect(result.output).toContain("second");
			});

			it("should stop on first failure", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria[] = [
					{ type: "custom", command: "echo first" },
					{ type: "custom", command: "node -e process.exit(1)" },
					{ type: "custom", command: "echo third" },
				];

				const result = await evaluator.evaluateAll(criteria);

				expect(result.success).toBe(false);
				expect(result.output).toContain("first");
				expect(result.output).not.toContain("third");
			});

			it("should aggregate suggestions from failed criteria", async () => {
				evaluator = createCriteriaEvaluator();
				const criteria: SuccessCriteria[] = [
					{
						type: "custom",
						command:
							"node -e \"console.log('Cannot find module lodash'); process.exit(1)\"",
					},
				];

				const result = await evaluator.evaluateAll(criteria);

				expect(result.success).toBe(false);
			});
		});
	});

	describe("createCriteriaEvaluatorWithClaude", () => {
		it("should use Claude judgment for success", async () => {
			const mockJudge: ClaudeJudgeFunction = vi.fn().mockResolvedValue({
				success: true,
				reason: "Claude says it passed",
				suggestions: [],
			});

			const evaluator = createCriteriaEvaluatorWithClaude(mockJudge);
			const criteria: SuccessCriteria = {
				type: "custom",
				command: "echo test",
			};

			const result = await evaluator.evaluate(criteria);

			expect(result.success).toBe(true);
			expect(result.reason).toBe("Claude says it passed");
			expect(mockJudge).toHaveBeenCalledWith("custom", expect.any(String), 0);
		});

		it("should use Claude judgment for failure", async () => {
			const mockJudge: ClaudeJudgeFunction = vi.fn().mockResolvedValue({
				success: false,
				reason: "Claude detected an issue",
				suggestions: ["Fix the code", "Run tests again"],
			});

			const evaluator = createCriteriaEvaluatorWithClaude(mockJudge);
			const criteria: SuccessCriteria = {
				type: "custom",
				command: "echo test",
			};

			const result = await evaluator.evaluate(criteria);

			expect(result.success).toBe(false);
			expect(result.reason).toBe("Claude detected an issue");
			expect(result.suggestions).toEqual(["Fix the code", "Run tests again"]);
		});

		it("should fall back to basic result on Claude error", async () => {
			const mockJudge: ClaudeJudgeFunction = vi
				.fn()
				.mockRejectedValue(new Error("API error"));

			const evaluator = createCriteriaEvaluatorWithClaude(mockJudge);
			const criteria: SuccessCriteria = {
				type: "custom",
				command: "echo test",
			};

			const result = await evaluator.evaluate(criteria);

			expect(result.success).toBe(true);
			expect(result.reason).toContain("passed");
		});

		it("should not call Claude on timeout", async () => {
			const mockJudge: ClaudeJudgeFunction = vi.fn();

			const evaluator = createCriteriaEvaluatorWithClaude(mockJudge);
			const criteria: SuccessCriteria = {
				type: "custom",
				command: "sleep 10",
				timeout: 100,
			};

			const result = await evaluator.evaluate(criteria);

			expect(result.success).toBe(false);
			expect(result.reason).toContain("timed out");
			expect(mockJudge).not.toHaveBeenCalled();
		});

		it("should evaluate all with Claude judgment", async () => {
			const mockJudge: ClaudeJudgeFunction = vi.fn().mockResolvedValue({
				success: true,
				reason: "Passed by Claude",
				suggestions: [],
			});

			const evaluator = createCriteriaEvaluatorWithClaude(mockJudge);
			const criteria: SuccessCriteria[] = [
				{ type: "custom", command: "echo first" },
				{ type: "custom", command: "echo second" },
			];

			const result = await evaluator.evaluateAll(criteria);

			expect(result.success).toBe(true);
			expect(mockJudge).toHaveBeenCalledTimes(2);
		});

		it("should stop evaluateAll on first Claude failure", async () => {
			let callCount = 0;
			const mockJudge: ClaudeJudgeFunction = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						success: true,
						reason: "First passed",
						suggestions: [],
					});
				}
				return Promise.resolve({
					success: false,
					reason: "Second failed",
					suggestions: ["Fix it"],
				});
			});

			const evaluator = createCriteriaEvaluatorWithClaude(mockJudge);
			const criteria: SuccessCriteria[] = [
				{ type: "custom", command: "echo first" },
				{ type: "custom", command: "echo second" },
				{ type: "custom", command: "echo third" },
			];

			const result = await evaluator.evaluateAll(criteria);

			expect(result.success).toBe(false);
			expect(result.reason).toBe("Second failed");
			expect(mockJudge).toHaveBeenCalledTimes(2);
		});
	});

	describe("Integration: Built-in criteria types", () => {
		it("should have correct default for test_pass", () => {
			const config = getCommandConfig({ type: "test_pass" });
			expect(config.command).toBe("npm");
			expect(config.args).toContain("test");
		});

		it("should have correct default for build_success", () => {
			const config = getCommandConfig({ type: "build_success" });
			expect(config.command).toBe("npm");
			expect(config.args).toContain("build");
		});

		it("should have correct default for lint_clean", () => {
			const config = getCommandConfig({ type: "lint_clean" });
			expect(config.command).toBe("npm");
			expect(config.args).toContain("lint");
		});

		it("should have correct default for type_check", () => {
			const config = getCommandConfig({ type: "type_check" });
			expect(config.command).toBe("npx");
			expect(config.args).toContain("tsc");
		});
	});
});
