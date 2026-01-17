import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dump as dumpYaml } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureProjectDirs, getProjectDataDir } from "../../src/core/db/paths";
import {
	type RalphConfigArgs,
	type RalphConfigContext,
	createInitialConfig,
	createRalphConfigSkill,
	detectProjectType,
	executeRalphConfig,
	formatConfig,
	formatConfigValue,
	getConfigValue,
	getSuggestedCommands,
	isValidConfigKey,
	parseConfigArgs,
	parseConfigValue,
	setConfigValue,
	validateConfigValue,
} from "../../src/skills/ralph-config";
import { getProjectConfigPath } from "../../src/utils/config";
import { DEFAULT_CONFIG } from "../../src/utils/config";

describe("Ralph Config Skill", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-config-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		ensureProjectDirs(testDir);
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("parseConfigArgs", () => {
		it("should parse empty string as show", () => {
			const args = parseConfigArgs("");

			expect(args.subcommand).toBeUndefined();
		});

		it("should parse set command", () => {
			const args = parseConfigArgs("set ralph.max_iterations 15");

			expect(args.subcommand).toBe("set");
			expect(args.key).toBe("ralph.max_iterations");
			expect(args.value).toBe("15");
		});

		it("should parse set command with quoted value", () => {
			const args = parseConfigArgs('set logging.level "debug"');

			expect(args.subcommand).toBe("set");
			expect(args.key).toBe("logging.level");
			expect(args.value).toBe("debug");
		});

		it("should parse init command", () => {
			const args = parseConfigArgs("init");

			expect(args.subcommand).toBe("init");
		});

		it("should parse get command", () => {
			const args = parseConfigArgs("get ralph.max_iterations");

			expect(args.subcommand).toBe("get");
			expect(args.key).toBe("ralph.max_iterations");
		});

		it("should parse single key as get", () => {
			const args = parseConfigArgs("ralph.max_iterations");

			expect(args.subcommand).toBe("get");
			expect(args.key).toBe("ralph.max_iterations");
		});
	});

	describe("isValidConfigKey", () => {
		it("should return true for valid keys", () => {
			expect(isValidConfigKey("ralph.max_iterations")).toBe(true);
			expect(isValidConfigKey("memory.auto_inject")).toBe(true);
			expect(isValidConfigKey("logging.level")).toBe(true);
		});

		it("should return false for invalid keys", () => {
			expect(isValidConfigKey("invalid.key")).toBe(false);
			expect(isValidConfigKey("ralph.nonexistent")).toBe(false);
		});
	});

	describe("getConfigValue", () => {
		it("should get nested value", () => {
			const value = getConfigValue(DEFAULT_CONFIG, "ralph.max_iterations");

			expect(value).toBe(10);
		});

		it("should get boolean value", () => {
			const value = getConfigValue(DEFAULT_CONFIG, "memory.auto_inject");

			expect(value).toBe(true);
		});

		it("should return undefined for invalid key", () => {
			const value = getConfigValue(DEFAULT_CONFIG, "invalid.key");

			expect(value).toBeUndefined();
		});
	});

	describe("setConfigValue", () => {
		it("should set nested value", () => {
			const config: Record<string, Record<string, unknown>> = {};
			setConfigValue(config, "ralph.max_iterations", 20);

			expect(config.ralph.max_iterations).toBe(20);
		});

		it("should set value in existing section", () => {
			const config = { ralph: { max_iterations: 10 } };
			setConfigValue(config, "ralph.cooldown_ms", 2000);

			expect(config.ralph.cooldown_ms).toBe(2000);
		});
	});

	describe("parseConfigValue", () => {
		it("should parse number value", () => {
			const value = parseConfigValue("ralph.max_iterations", "15");

			expect(value).toBe(15);
		});

		it("should throw for invalid number", () => {
			expect(() => parseConfigValue("ralph.max_iterations", "abc")).toThrow(
				"값이 숫자여야 합니다",
			);
		});

		it("should parse boolean true", () => {
			expect(parseConfigValue("memory.auto_inject", "true")).toBe(true);
			expect(parseConfigValue("memory.auto_inject", "yes")).toBe(true);
			expect(parseConfigValue("memory.auto_inject", "1")).toBe(true);
		});

		it("should parse boolean false", () => {
			expect(parseConfigValue("memory.auto_inject", "false")).toBe(false);
			expect(parseConfigValue("memory.auto_inject", "no")).toBe(false);
			expect(parseConfigValue("memory.auto_inject", "0")).toBe(false);
		});

		it("should throw for invalid boolean", () => {
			expect(() => parseConfigValue("memory.auto_inject", "maybe")).toThrow(
				"값이 boolean이어야 합니다",
			);
		});

		it("should parse array from comma-separated string", () => {
			const value = parseConfigValue(
				"privacy.exclude_patterns",
				"*.env, *.key, *secret*",
			);

			expect(value).toEqual(["*.env", "*.key", "*secret*"]);
		});

		it("should parse array from JSON", () => {
			const value = parseConfigValue(
				"privacy.exclude_patterns",
				'["*.env", "*.key"]',
			);

			expect(value).toEqual(["*.env", "*.key"]);
		});

		it("should parse string value", () => {
			const value = parseConfigValue("logging.level", "debug");

			expect(value).toBe("debug");
		});
	});

	describe("validateConfigValue", () => {
		it("should validate number", () => {
			expect(validateConfigValue("ralph.max_iterations", 10)).toBe(true);
			expect(validateConfigValue("ralph.max_iterations", "10")).toBe(false);
		});

		it("should validate boolean", () => {
			expect(validateConfigValue("memory.auto_inject", true)).toBe(true);
			expect(validateConfigValue("memory.auto_inject", "true")).toBe(false);
		});

		it("should validate array", () => {
			expect(validateConfigValue("privacy.exclude_patterns", ["*.env"])).toBe(
				true,
			);
			expect(validateConfigValue("privacy.exclude_patterns", "*.env")).toBe(
				false,
			);
		});

		it("should validate string", () => {
			expect(validateConfigValue("logging.level", "debug")).toBe(true);
			expect(validateConfigValue("logging.level", 123)).toBe(false);
		});
	});

	describe("formatConfig", () => {
		it("should format config for display", () => {
			const message = formatConfig(DEFAULT_CONFIG, null);

			expect(message).toContain("⚙️ Ralph 설정");
			expect(message).toContain("ralph:");
			expect(message).toContain("max_iterations: 10");
			expect(message).toContain("memory:");
			expect(message).toContain("auto_inject: true");
			expect(message).toContain("(기본값 사용)");
		});

		it("should show config file path when exists", () => {
			const configPath = getProjectConfigPath(testDir);
			writeFileSync(configPath, "ralph:\n  max_iterations: 15\n");

			const message = formatConfig(DEFAULT_CONFIG, configPath);

			expect(message).toContain(configPath);
		});
	});

	describe("formatConfigValue", () => {
		it("should format scalar value", () => {
			const message = formatConfigValue("ralph.max_iterations", 10);

			expect(message).toBe("ralph.max_iterations: 10");
		});

		it("should format array value", () => {
			const message = formatConfigValue("privacy.exclude_patterns", [
				"*.env",
				"*.key",
			]);

			expect(message).toBe("privacy.exclude_patterns: [*.env, *.key]");
		});
	});

	describe("detectProjectType", () => {
		it("should detect node project", () => {
			writeFileSync(join(testDir, "package.json"), "{}");

			const type = detectProjectType(testDir);

			expect(type).toBe("node");
		});

		it("should detect python project", () => {
			writeFileSync(join(testDir, "pyproject.toml"), "");

			const type = detectProjectType(testDir);

			expect(type).toBe("python");
		});

		it("should detect go project", () => {
			writeFileSync(join(testDir, "go.mod"), "");

			const type = detectProjectType(testDir);

			expect(type).toBe("go");
		});

		it("should detect rust project", () => {
			writeFileSync(join(testDir, "Cargo.toml"), "");

			const type = detectProjectType(testDir);

			expect(type).toBe("rust");
		});

		it("should return other for unknown", () => {
			const type = detectProjectType(testDir);

			expect(type).toBe("other");
		});
	});

	describe("getSuggestedCommands", () => {
		it("should suggest node commands", () => {
			const commands = getSuggestedCommands("node");

			expect(commands.test).toBe("npm test");
			expect(commands.build).toBe("npm run build");
		});

		it("should suggest python commands", () => {
			const commands = getSuggestedCommands("python");

			expect(commands.test).toBe("pytest");
		});

		it("should suggest go commands", () => {
			const commands = getSuggestedCommands("go");

			expect(commands.test).toBe("go test ./...");
		});
	});

	describe("createInitialConfig", () => {
		it("should create config with test command", () => {
			const config = createInitialConfig({
				projectType: "node",
				testCommand: "npm test",
			});

			expect(config.ralph?.success_criteria).toBeDefined();
			expect(config.ralph?.success_criteria?.[0].command).toBe("npm test");
		});
	});

	describe("createRalphConfigSkill", () => {
		it("should show current config", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.show();

			expect(result.success).toBe(true);
			expect(result.message).toContain("⚙️ Ralph 설정");
			expect(result.config).toBeDefined();
		});

		it("should get specific value", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.get("ralph.max_iterations");

			expect(result.success).toBe(true);
			expect(result.message).toContain("10");
		});

		it("should error on invalid key for get", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.get("invalid.key");

			expect(result.success).toBe(false);
			expect(result.error).toContain("잘못된 설정 키");
		});

		it("should set value", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.set("ralph.max_iterations", "20");

			expect(result.success).toBe(true);
			expect(result.message).toContain("설정 저장됨");
			expect(result.message).toContain("20");

			// Verify persisted
			const checkResult = skill.get("ralph.max_iterations");
			expect(checkResult.message).toContain("20");
		});

		it("should error on invalid key for set", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.set("invalid.key", "value");

			expect(result.success).toBe(false);
			expect(result.error).toContain("잘못된 설정 키");
		});

		it("should error on invalid type for set", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.set("ralph.max_iterations", "not-a-number");

			expect(result.success).toBe(false);
			expect(result.error).toContain("숫자");
		});

		it("should init config", () => {
			// Create a node project
			writeFileSync(join(testDir, "package.json"), "{}");

			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.init();

			expect(result.success).toBe(true);
			expect(result.message).toContain("설정 파일 생성됨");
			expect(result.message).toContain("node");

			// Verify file created
			const configPath = getProjectConfigPath(testDir);
			expect(existsSync(configPath)).toBe(true);
		});

		it("should error if config already exists on init", () => {
			const configPath = getProjectConfigPath(testDir);
			writeFileSync(configPath, "ralph:\n  max_iterations: 15\n");

			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.init();

			expect(result.success).toBe(false);
			expect(result.error).toContain("이미 존재");
		});

		it("should execute with empty args (show)", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.execute({});

			expect(result.success).toBe(true);
			expect(result.message).toContain("⚙️ Ralph 설정");
		});

		it("should execute set command", () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			const result = skill.execute({
				subcommand: "set",
				key: "ralph.max_iterations",
				value: "25",
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("25");
		});
	});

	describe("executeRalphConfig", () => {
		it("should execute show command", async () => {
			const context: RalphConfigContext = { projectPath: testDir };

			const output = await executeRalphConfig("", context);

			expect(output).toContain("⚙️ Ralph 설정");
		});

		it("should execute set command", async () => {
			const context: RalphConfigContext = { projectPath: testDir };

			const output = await executeRalphConfig(
				"set ralph.max_iterations 30",
				context,
			);

			expect(output).toContain("✅");
			expect(output).toContain("30");
		});

		it("should show error for invalid key", async () => {
			const context: RalphConfigContext = { projectPath: testDir };

			const output = await executeRalphConfig("set invalid.key value", context);

			expect(output).toContain("❌");
			expect(output).toContain("잘못된 설정 키");
		});

		it("should show error for type mismatch", async () => {
			const context: RalphConfigContext = { projectPath: testDir };

			const output = await executeRalphConfig(
				"set ralph.max_iterations abc",
				context,
			);

			expect(output).toContain("❌");
		});
	});

	describe("Config persistence", () => {
		it("should persist and reload config", async () => {
			const context: RalphConfigContext = { projectPath: testDir };
			const skill = createRalphConfigSkill(context);

			// Set multiple values
			skill.set("ralph.max_iterations", "50");
			skill.set("memory.auto_inject", "false");
			skill.set("logging.level", "debug");

			// Create new skill instance to reload
			const skill2 = createRalphConfigSkill(context);
			const result = skill2.show();

			expect(result.config?.ralph.max_iterations).toBe(50);
			expect(result.config?.memory.auto_inject).toBe(false);
			expect(result.config?.logging.level).toBe("debug");
		});
	});
});
