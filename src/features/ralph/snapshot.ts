/**
 * File Snapshot Manager
 *
 * Manages file snapshots for Ralph Loop rollback functionality.
 * Creates snapshots of modified files before loop execution,
 * allowing restoration on failure.
 *
 * See: docs/issues/016-file-snapshot/README.md
 */

import { execSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { getProjectDataDir } from "../../core/db/paths";

/**
 * Information about a snapshot
 */
export interface SnapshotInfo {
	runId: string;
	path: string;
	createdAt: Date;
	fileCount: number;
}

/**
 * Snapshot Manager interface
 */
export interface SnapshotManager {
	/**
	 * Create a snapshot of modified files
	 * @param runId Loop run ID
	 * @returns Path to the snapshot directory
	 */
	create(runId: string): Promise<string>;

	/**
	 * Restore files from a snapshot
	 * @param snapshotPath Path to the snapshot directory
	 */
	restore(snapshotPath: string): Promise<void>;

	/**
	 * Delete a snapshot
	 * @param snapshotPath Path to the snapshot directory
	 */
	delete(snapshotPath: string): Promise<void>;

	/**
	 * List all snapshots
	 */
	list(): Promise<SnapshotInfo[]>;

	/**
	 * Clean up old snapshots
	 * @param maxAge Maximum age in milliseconds
	 */
	cleanup(maxAge: number): Promise<number>;
}

/**
 * Get modified files using git diff
 * Returns list of file paths relative to project root
 */
export function getModifiedFiles(projectPath: string): string[] {
	try {
		// Check if this is a git repository
		const gitDir = join(projectPath, ".git");
		if (!existsSync(gitDir)) {
			return [];
		}

		// Get staged and unstaged changes
		const staged = execSync("git diff --cached --name-only", {
			cwd: projectPath,
			encoding: "utf-8",
		}).trim();

		const unstaged = execSync("git diff --name-only", {
			cwd: projectPath,
			encoding: "utf-8",
		}).trim();

		// Get untracked files
		const untracked = execSync("git ls-files --others --exclude-standard", {
			cwd: projectPath,
			encoding: "utf-8",
		}).trim();

		// Combine and deduplicate
		const files = new Set<string>();

		for (const line of staged.split("\n")) {
			if (line.trim()) files.add(line.trim());
		}
		for (const line of unstaged.split("\n")) {
			if (line.trim()) files.add(line.trim());
		}
		for (const line of untracked.split("\n")) {
			if (line.trim()) files.add(line.trim());
		}

		// Filter to only existing files
		return Array.from(files).filter((file) =>
			existsSync(join(projectPath, file)),
		);
	} catch {
		// If git fails, return empty array
		return [];
	}
}

/**
 * Get the snapshots directory path
 */
export function getSnapshotsDir(projectPath: string): string {
	return join(getProjectDataDir(projectPath), "snapshots");
}

/**
 * Create a snapshot manager for a project
 */
export function createSnapshotManager(projectPath: string): SnapshotManager {
	const snapshotsDir = getSnapshotsDir(projectPath);

	return {
		async create(runId: string): Promise<string> {
			const snapshotPath = join(snapshotsDir, runId);

			// Ensure snapshots directory exists
			mkdirSync(snapshotPath, { recursive: true });

			// Get modified files
			const modifiedFiles = getModifiedFiles(projectPath);

			// Copy each file to snapshot directory
			for (const file of modifiedFiles) {
				const srcPath = join(projectPath, file);
				const destPath = join(snapshotPath, file);

				// Ensure destination directory exists
				mkdirSync(dirname(destPath), { recursive: true });

				// Copy file
				copyFileSync(srcPath, destPath);
			}

			// Write metadata
			const metadata = {
				runId,
				createdAt: new Date().toISOString(),
				files: modifiedFiles,
			};
			writeFileSync(
				join(snapshotPath, ".snapshot-meta.json"),
				JSON.stringify(metadata, null, 2),
			);

			return snapshotPath;
		},

		async restore(snapshotPath: string): Promise<void> {
			if (!existsSync(snapshotPath)) {
				throw new Error(`Snapshot not found: ${snapshotPath}`);
			}

			// Read metadata
			const metaPath = join(snapshotPath, ".snapshot-meta.json");
			if (!existsSync(metaPath)) {
				throw new Error(
					`Invalid snapshot: missing metadata at ${snapshotPath}`,
				);
			}

			const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
			const files: string[] = metadata.files || [];

			// Restore each file
			for (const file of files) {
				const srcPath = join(snapshotPath, file);
				const destPath = join(projectPath, file);

				if (existsSync(srcPath)) {
					// Ensure destination directory exists
					mkdirSync(dirname(destPath), { recursive: true });

					// Copy file back
					copyFileSync(srcPath, destPath);
				}
			}
		},

		async delete(snapshotPath: string): Promise<void> {
			if (existsSync(snapshotPath)) {
				rmSync(snapshotPath, { recursive: true });
			}
		},

		async list(): Promise<SnapshotInfo[]> {
			if (!existsSync(snapshotsDir)) {
				return [];
			}

			const entries = readdirSync(snapshotsDir);
			const snapshots: SnapshotInfo[] = [];

			for (const entry of entries) {
				const snapshotPath = join(snapshotsDir, entry);
				const metaPath = join(snapshotPath, ".snapshot-meta.json");

				if (existsSync(metaPath)) {
					try {
						const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
						const files: string[] = metadata.files || [];

						snapshots.push({
							runId: metadata.runId || entry,
							path: snapshotPath,
							createdAt: new Date(metadata.createdAt),
							fileCount: files.length,
						});
					} catch {
						// Skip invalid snapshots
					}
				}
			}

			// Sort by creation date (newest first)
			return snapshots.sort(
				(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
			);
		},

		async cleanup(maxAge: number): Promise<number> {
			const snapshots = await this.list();
			const cutoff = Date.now() - maxAge;
			let deletedCount = 0;

			for (const snapshot of snapshots) {
				if (snapshot.createdAt.getTime() < cutoff) {
					await this.delete(snapshot.path);
					deletedCount++;
				}
			}

			return deletedCount;
		},
	};
}

/**
 * Create snapshot for a loop run (convenience function)
 */
export async function createRunSnapshot(
	projectPath: string,
	runId: string,
): Promise<string> {
	const manager = createSnapshotManager(projectPath);
	return manager.create(runId);
}

/**
 * Restore from a loop run snapshot (convenience function)
 */
export async function restoreRunSnapshot(
	projectPath: string,
	runId: string,
): Promise<void> {
	const manager = createSnapshotManager(projectPath);
	const snapshotPath = join(getSnapshotsDir(projectPath), runId);
	return manager.restore(snapshotPath);
}

/**
 * Delete a loop run snapshot (convenience function)
 */
export async function deleteRunSnapshot(
	projectPath: string,
	runId: string,
): Promise<void> {
	const manager = createSnapshotManager(projectPath);
	const snapshotPath = join(getSnapshotsDir(projectPath), runId);
	return manager.delete(snapshotPath);
}
