/**
 * Sync version from package.json to .claude-plugin/plugin.json
 * This script is called by npm version lifecycle hook
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");
const pkgPath = join(rootDir, "package.json");
const pluginPath = join(rootDir, ".claude-plugin/plugin.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));

plugin.version = pkg.version;

writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);

console.log(`Synced version to ${pkg.version}`);
