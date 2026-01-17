/**
 * ralph-mem: Persistent context management plugin for Claude Code
 *
 * Combines claude-mem's intelligent context management with Ralph Loop's
 * "succeed until done" philosophy.
 */

export const VERSION = "0.1.0";

// Core Layer exports
export * from "./core/store";
export * from "./core/search";

// Hook exports
export { sessionStartHook } from "./hooks/session-start";
export { sessionEndHook } from "./hooks/session-end";
export { userPromptSubmitHook } from "./hooks/user-prompt-submit";
export { postToolUseHook } from "./hooks/post-tool-use";
export { stopHook } from "./hooks/stop";

// MCP exports
export * from "./mcp";

// Skill exports (to be implemented)
export { ralphSkill } from "./skills/ralph";
export { memSearchSkill } from "./skills/mem-search";
export { memInjectSkill } from "./skills/mem-inject";
export { memForgetSkill } from "./skills/mem-forget";
export { memStatusSkill } from "./skills/mem-status";

// Plugin lifecycle
export async function activate(): Promise<void> {
	console.log(`ralph-mem v${VERSION} activated`);
}

export async function deactivate(): Promise<void> {
	console.log("ralph-mem deactivated");
}
