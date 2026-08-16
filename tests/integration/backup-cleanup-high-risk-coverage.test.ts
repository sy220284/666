import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openAppRuntime } from "../../packages/core-service/src/app-runtime.js";
import { ProjectWorkspaceService } from "../../packages/core-service/src/project-workspace.js";
import { RecoveryService } from "../../packages/core-service/src/recovery.js";

const temporaryDirectories: string[] = [];
const collisionId = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createHarness() {
  const root = await mkdtemp(
    path.join(tmpdir(), "worldforge-backup-cleanup-coverage-"),
  );
  temporaryDirectories.push(root);
  const parent = path.join(root, "projects");
  const backupRoot = path.join(root, "backups");
  await mkdir(parent, { recursive: true });
  let current = new Date("2026-08-01T08:00:00.000Z");
  let forcedId: string | null = null;
  const clock = { now: () => current };
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, "app.sqlite"),
    migrationsDirectory: "migrations/app",
    recoveryDirectory: path.join(root, "app-recovery"),
    appVersion: "0.1.0",
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: "migrations/project",
    projectMigrationRecoveryDirectory: path.join(root, "migration-recovery"),
    appVersion: "0.1.0",
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const recovery = new RecoveryService(workspace, {
    backupRootDirectory: backupRoot,
    clock,
    idFactory: () => forcedId ?? randomUUID(),
  });
  const project = await workspace.create(
    randomUUID(),
    { name: "备份清理覆盖", channel: "长篇" },
    parent,
  );
  return {
    backupRoot,
    appRuntime,
    workspace,
    recovery,
    project,
    advance(days: number) {
      current = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
    },
    forceId(value: string | null) {
      forcedId = value;
    },
  };
}

async function inflateMetadata(
  backupRoot: string,
  projectId: string,
  backupId: string,
  sizeBytes: number,
): Promise<void> {
  const metadataPath = path.join(backupRoot, projectId, `${backupId}.json`);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    metadataPath,
    `${JSON.stringify({ ...metadata, sizeBytes }, null, 2)}\n`,
    "utf8",
  );
}

describe("backup cleanup high-risk coverage", () => {
  it("uses quota pressure only after retention/protection decisions and deletes the oldest eligible records", async () => {
    const harness = await createHarness();
    try {
      const first = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "replace",
        },
      );
      harness.advance(1);
      const second = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "split-chapter",
        },
      );
      harness.advance(1);
      const newest = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "merge-chapter",
        },
      );

      for (const backup of [first, second, newest]) {
        await inflateMetadata(
          harness.backupRoot,
          harness.project.projectId,
          backup.backupId,
          70 * 1024 * 1024,
        );
      }
      await harness.recovery.updatePolicy(randomUUID(), {
        projectId: harness.project.projectId,
        authority: "author",
        dailyRetentionCount: 365,
        majorRetentionCount: 500,
        majorRetentionDays: 3650,
        quotaBytes: 100 * 1024 * 1024,
      });

      const preview = await harness.recovery.previewCleanup(
        harness.project.projectId,
      );
      expect(
        preview.items.find((item) => item.backupId === newest.backupId),
      ).toMatchObject({
        action: "protect",
        reason: "last-verified",
      });
      expect(
        preview.items.filter((item) => item.reason === "quota-pressure"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backupId: first.backupId,
            action: "delete",
          }),
          expect.objectContaining({
            backupId: second.backupId,
            action: "delete",
          }),
        ]),
      );
      expect(preview.remainingBytes).toBe(70 * 1024 * 1024);

      const result = await harness.recovery.applyCleanup(randomUUID(), {
        projectId: harness.project.projectId,
        authority: "author",
        planHash: preview.planHash,
      });
      expect(result.deletedBackupIds).toEqual(
        expect.arrayContaining([first.backupId, second.backupId]),
      );
      expect(result.remainingBytes).toBe(70 * 1024 * 1024);
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });

  it("fails closed when a preview target disappears before cleanup applies", async () => {
    const harness = await createHarness();
    try {
      const first = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "replace",
        },
      );
      harness.advance(1);
      const second = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "split-chapter",
        },
      );
      harness.advance(1);
      const newest = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "merge-chapter",
        },
      );
      for (const backup of [first, second, newest]) {
        await inflateMetadata(
          harness.backupRoot,
          harness.project.projectId,
          backup.backupId,
          70 * 1024 * 1024,
        );
      }
      await harness.recovery.updatePolicy(randomUUID(), {
        projectId: harness.project.projectId,
        authority: "author",
        dailyRetentionCount: 365,
        majorRetentionCount: 500,
        majorRetentionDays: 3650,
        quotaBytes: 100 * 1024 * 1024,
      });
      const preview = await harness.recovery.previewCleanup(
        harness.project.projectId,
      );
      expect(
        preview.items.find((item) => item.backupId === first.backupId),
      ).toMatchObject({
        action: "delete",
        reason: "quota-pressure",
      });

      await rm(
        path.join(
          harness.backupRoot,
          harness.project.projectId,
          `${first.backupId}.json`,
        ),
      );
      await expect(
        harness.recovery.applyCleanup(randomUUID(), {
          projectId: harness.project.projectId,
          authority: "author",
          planHash: preview.planHash,
        }),
      ).rejects.toMatchObject({ code: "BACKUP_CLEANUP_STALE" });
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });

  it("distinguishes major over-count retention from named backups that remain within quota", async () => {
    const harness = await createHarness();
    try {
      const named = await harness.recovery.createNamedSnapshot(randomUUID(), {
        projectId: harness.project.projectId,
        authority: "author",
        name: "阶段存档",
        note: "后续取消保护以验证命名轨保留规则",
      });
      harness.advance(1);
      const oldestMajor = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "replace",
        },
      );
      harness.advance(1);
      const retainedMajor = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "split-chapter",
        },
      );
      harness.advance(1);
      const newestMajor = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "merge-chapter",
        },
      );

      await harness.recovery.setProtection(randomUUID(), {
        projectId: harness.project.projectId,
        backupId: named.backupId,
        authority: "author",
        protected: false,
        confirmationBackupId: named.backupId,
      });

      const firstPolicy = await harness.recovery.updatePolicy(randomUUID(), {
        projectId: harness.project.projectId,
        authority: "author",
        dailyRetentionCount: 14,
        majorRetentionCount: 2,
        majorRetentionDays: 3650,
        quotaBytes: 1024 * 1024 * 1024,
      });
      const secondPolicy = await harness.recovery.updatePolicy(randomUUID(), {
        projectId: harness.project.projectId,
        authority: "author",
        dailyRetentionCount: 14,
        majorRetentionCount: 1,
        majorRetentionDays: 3650,
        quotaBytes: 1024 * 1024 * 1024,
      });
      expect([firstPolicy.policyVersion, secondPolicy.policyVersion]).toEqual([
        1, 2,
      ]);

      const preview = await harness.recovery.previewCleanup(
        harness.project.projectId,
      );
      expect(
        preview.items.find((item) => item.backupId === newestMajor.backupId),
      ).toMatchObject({
        action: "protect",
        reason: "last-verified",
      });
      expect(
        preview.items.find((item) => item.backupId === retainedMajor.backupId),
      ).toMatchObject({
        action: "retain",
        reason: "major-retention",
      });
      expect(
        preview.items.find((item) => item.backupId === oldestMajor.backupId),
      ).toMatchObject({
        action: "delete",
        reason: "major-over-limit",
      });
      expect(
        preview.items.find((item) => item.backupId === named.backupId),
      ).toMatchObject({
        action: "retain",
        reason: "within-quota",
      });
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });

  it("rolls back the database when protection metadata cannot be rewritten atomically", async () => {
    const harness = await createHarness();
    try {
      const backup = await harness.recovery.createOperationCheckpoint(
        randomUUID(),
        {
          projectId: harness.project.projectId,
          operation: "replace",
        },
      );
      const metadataPath = path.join(
        harness.backupRoot,
        harness.project.projectId,
        `${backup.backupId}.json`,
      );
      const collisionPath = `${metadataPath}.partial-${collisionId}`;
      await writeFile(collisionPath, "occupied", "utf8");
      harness.forceId(collisionId);

      try {
        await expect(
          harness.recovery.setProtection(randomUUID(), {
            projectId: harness.project.projectId,
            backupId: backup.backupId,
            authority: "author",
            protected: true,
            confirmationBackupId: null,
          }),
        ).rejects.toMatchObject({ code: "BACKUP_CREATE_FAILED" });
      } finally {
        harness.forceId(null);
      }

      const authorProtected = harness.workspace.readProject(
        harness.project.projectId,
        (database) => {
          const row = database
            .prepare(
              "SELECT author_protected AS authorProtected FROM backup_records WHERE id = ? AND project_id = ?",
            )
            .get(backup.backupId, harness.project.projectId) as
            { authorProtected: number | bigint } | undefined;
          return Number(row?.authorProtected ?? -1);
        },
      );
      expect(authorProtected).toBe(0);
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        authorProtected?: boolean;
      };
      expect(metadata.authorProtected).toBe(false);
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });
});
