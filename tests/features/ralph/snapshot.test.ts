import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureProjectDirs } from "../../../src/core/db/paths";
import {
	type SnapshotInfo,
	type SnapshotManager,
	createRunSnapshot,
	createSnapshotManager,
	deleteRunSnapshot,
	getModifiedFiles,
	getSnapshotsDir,
	restoreRunSnapshot,
} from "../../../src/features/ralph/snapshot";

describe("Snapshot Manager", () => {
	let testDir: string;
	let manager: SnapshotManager;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-snapshot-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		ensureProjectDirs(testDir);

		// Initialize git repo for testing
		execSync("git init", { cwd: testDir });
		execSync('git config user.email "test@test.com"', { cwd: testDir });
		execSync('git config user.name "Test User"', { cwd: testDir });

		// Create initial file and commit
		writeFileSync(join(testDir, "initial.txt"), "initial content");
		execSync("git add .", { cwd: testDir });
		execSync('git commit -m "Initial commit"', { cwd: testDir });

		manager = createSnapshotManager(testDir);
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("getModifiedFiles", () => {
		it("should detect modified files", () => {
			// Modify a file
			writeFileSync(join(testDir, "initial.txt"), "modified content");

			const files = getModifiedFiles(testDir);

			expect(files).toContain("initial.txt");
		});

		it("should detect new files", () => {
			// Create a new file
			writeFileSync(join(testDir, "new-file.txt"), "new content");

			const files = getModifiedFiles(testDir);

			expect(files).toContain("new-file.txt");
		});

		it("should detect staged files", () => {
			// Stage a new file
			writeFileSync(join(testDir, "staged.txt"), "staged content");
			execSync("git add staged.txt", { cwd: testDir });

			const files = getModifiedFiles(testDir);

			expect(files).toContain("staged.txt");
		});

		it("should return empty array for non-git directory", () => {
			const nonGitDir = join(tmpdir(), `non-git-${Date.now()}`);
			mkdirSync(nonGitDir, { recursive: true });
			writeFileSync(join(nonGitDir, "file.txt"), "content");

			const files = getModifiedFiles(nonGitDir);

			expect(files).toEqual([]);

			rmSync(nonGitDir, { recursive: true });
		});

		it("should return empty array for clean repo", () => {
			const files = getModifiedFiles(testDir);

			expect(files).toEqual([]);
		});

		it("should detect files in subdirectories", () => {
			// Create nested file
			mkdirSync(join(testDir, "subdir"), { recursive: true });
			writeFileSync(join(testDir, "subdir", "nested.txt"), "nested content");

			const files = getModifiedFiles(testDir);

			expect(files).toContain("subdir/nested.txt");
		});
	});

	describe("getSnapshotsDir", () => {
		it("should return correct path", () => {
			const dir = getSnapshotsDir(testDir);

			expect(dir).toContain(".ralph-mem");
			expect(dir).toContain("snapshots");
		});
	});

	describe("createSnapshotManager", () => {
		it("should create manager instance", () => {
			expect(manager).toBeDefined();
			expect(typeof manager.create).toBe("function");
			expect(typeof manager.restore).toBe("function");
			expect(typeof manager.delete).toBe("function");
			expect(typeof manager.list).toBe("function");
			expect(typeof manager.cleanup).toBe("function");
		});
	});

	describe("create", () => {
		it("should create snapshot of modified files", async () => {
			// Modify a file
			writeFileSync(join(testDir, "initial.txt"), "modified content");

			const snapshotPath = await manager.create("loop-001");

			expect(existsSync(snapshotPath)).toBe(true);
			expect(existsSync(join(snapshotPath, "initial.txt"))).toBe(true);

			const snapshotContent = readFileSync(
				join(snapshotPath, "initial.txt"),
				"utf-8",
			);
			expect(snapshotContent).toBe("modified content");
		});

		it("should create empty snapshot for no changes", async () => {
			const snapshotPath = await manager.create("loop-002");

			expect(existsSync(snapshotPath)).toBe(true);

			// Should have metadata but no files
			const metaPath = join(snapshotPath, ".snapshot-meta.json");
			expect(existsSync(metaPath)).toBe(true);

			const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
			expect(metadata.files).toEqual([]);
		});

		it("should preserve directory structure", async () => {
			// Create nested modified file
			mkdirSync(join(testDir, "src", "utils"), { recursive: true });
			writeFileSync(
				join(testDir, "src", "utils", "helper.ts"),
				"export const helper = () => {};",
			);

			const snapshotPath = await manager.create("loop-003");

			expect(existsSync(join(snapshotPath, "src", "utils", "helper.ts"))).toBe(
				true,
			);
		});

		it("should write metadata", async () => {
			writeFileSync(join(testDir, "file.txt"), "content");

			const snapshotPath = await manager.create("loop-004");

			const metaPath = join(snapshotPath, ".snapshot-meta.json");
			expect(existsSync(metaPath)).toBe(true);

			const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
			expect(metadata.runId).toBe("loop-004");
			expect(metadata.files).toContain("file.txt");
			expect(metadata.createdAt).toBeDefined();
		});
	});

	describe("restore", () => {
		it("should restore files from snapshot", async () => {
			// Create file and snapshot
			writeFileSync(join(testDir, "restore-test.txt"), "original");
			const snapshotPath = await manager.create("loop-005");

			// Modify file
			writeFileSync(join(testDir, "restore-test.txt"), "modified");
			expect(readFileSync(join(testDir, "restore-test.txt"), "utf-8")).toBe(
				"modified",
			);

			// Restore
			await manager.restore(snapshotPath);

			// Verify restoration
			expect(readFileSync(join(testDir, "restore-test.txt"), "utf-8")).toBe(
				"original",
			);
		});

		it("should throw error for non-existent snapshot", async () => {
			await expect(manager.restore("/non/existent/path")).rejects.toThrow(
				"Snapshot not found",
			);
		});

		it("should throw error for invalid snapshot (no metadata)", async () => {
			const invalidPath = join(getSnapshotsDir(testDir), "invalid");
			mkdirSync(invalidPath, { recursive: true });

			await expect(manager.restore(invalidPath)).rejects.toThrow(
				"Invalid snapshot",
			);
		});

		it("should restore nested files", async () => {
			// Create nested file
			mkdirSync(join(testDir, "nested"), { recursive: true });
			writeFileSync(join(testDir, "nested", "file.txt"), "nested original");

			const snapshotPath = await manager.create("loop-006");

			// Modify
			writeFileSync(join(testDir, "nested", "file.txt"), "nested modified");

			// Restore
			await manager.restore(snapshotPath);

			expect(readFileSync(join(testDir, "nested", "file.txt"), "utf-8")).toBe(
				"nested original",
			);
		});
	});

	describe("delete", () => {
		it("should delete snapshot", async () => {
			writeFileSync(join(testDir, "delete-test.txt"), "content");
			const snapshotPath = await manager.create("loop-007");

			expect(existsSync(snapshotPath)).toBe(true);

			await manager.delete(snapshotPath);

			expect(existsSync(snapshotPath)).toBe(false);
		});

		it("should not throw for non-existent snapshot", async () => {
			await expect(
				manager.delete("/non/existent/path"),
			).resolves.toBeUndefined();
		});
	});

	describe("list", () => {
		it("should return empty array for no snapshots", async () => {
			const snapshots = await manager.list();

			expect(snapshots).toEqual([]);
		});

		it("should list all snapshots", async () => {
			writeFileSync(join(testDir, "file1.txt"), "content1");
			await manager.create("loop-a");

			writeFileSync(join(testDir, "file2.txt"), "content2");
			await manager.create("loop-b");

			const snapshots = await manager.list();

			expect(snapshots.length).toBe(2);
			expect(snapshots.map((s) => s.runId)).toContain("loop-a");
			expect(snapshots.map((s) => s.runId)).toContain("loop-b");
		});

		it("should sort snapshots by date (newest first)", async () => {
			await manager.create("loop-first");
			// Small delay to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10));
			await manager.create("loop-second");

			const snapshots = await manager.list();

			expect(snapshots[0].runId).toBe("loop-second");
			expect(snapshots[1].runId).toBe("loop-first");
		});

		it("should include file count", async () => {
			writeFileSync(join(testDir, "file1.txt"), "content1");
			writeFileSync(join(testDir, "file2.txt"), "content2");
			await manager.create("loop-count");

			const snapshots = await manager.list();

			expect(snapshots[0].fileCount).toBe(2);
		});
	});

	describe("cleanup", () => {
		it("should delete old snapshots", async () => {
			await manager.create("loop-old");

			// Wait and create new snapshot
			await new Promise((resolve) => setTimeout(resolve, 50));
			await manager.create("loop-new");

			// Cleanup with 25ms max age (should delete first, keep second)
			const deleted = await manager.cleanup(25);

			expect(deleted).toBe(1);

			const remaining = await manager.list();
			expect(remaining.length).toBe(1);
			expect(remaining[0].runId).toBe("loop-new");
		});

		it("should return count of deleted snapshots", async () => {
			await manager.create("loop-1");
			await manager.create("loop-2");
			await manager.create("loop-3");

			await new Promise((resolve) => setTimeout(resolve, 20));

			const deleted = await manager.cleanup(10);

			expect(deleted).toBe(3);
		});

		it("should not delete recent snapshots", async () => {
			await manager.create("loop-recent");

			const deleted = await manager.cleanup(60000); // 1 minute

			expect(deleted).toBe(0);
		});
	});

	describe("Convenience functions", () => {
		it("createRunSnapshot should work", async () => {
			writeFileSync(join(testDir, "conv.txt"), "convenience content");

			const snapshotPath = await createRunSnapshot(testDir, "loop-conv");

			expect(existsSync(snapshotPath)).toBe(true);
			expect(existsSync(join(snapshotPath, "conv.txt"))).toBe(true);
		});

		it("restoreRunSnapshot should work", async () => {
			writeFileSync(join(testDir, "restore-conv.txt"), "original");
			await createRunSnapshot(testDir, "loop-restore-conv");

			writeFileSync(join(testDir, "restore-conv.txt"), "modified");

			await restoreRunSnapshot(testDir, "loop-restore-conv");

			expect(readFileSync(join(testDir, "restore-conv.txt"), "utf-8")).toBe(
				"original",
			);
		});

		it("deleteRunSnapshot should work", async () => {
			writeFileSync(join(testDir, "delete-conv.txt"), "content");
			const snapshotPath = await createRunSnapshot(testDir, "loop-delete-conv");

			expect(existsSync(snapshotPath)).toBe(true);

			await deleteRunSnapshot(testDir, "loop-delete-conv");

			expect(existsSync(snapshotPath)).toBe(false);
		});
	});
});
