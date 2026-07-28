import { appendFileSync, mkdirSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const diagnosticDirectory = 'test-results/codemod';
const diagnosticPath = `${diagnosticDirectory}/backup-failure-ledger.txt`;
mkdirSync(diagnosticDirectory, { recursive: true });

async function read(file) {
  return readFile(file, 'utf8');
}

async function write(file, content) {
  await writeFile(file, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  appendFileSync(diagnosticPath, `${label}: matches=${count}\n`, 'utf8');
  if (count !== 1) {
    appendFileSync(
      diagnosticPath,
      `FAILED ${label}\nEXPECTED START\n${before.slice(0, 800)}\nEXPECTED END\n`,
      'utf8',
    );
    throw new Error(`${label}: expected exactly one match, received ${count}`);
  }
  return content.replace(before, after);
}

await write(
  'migrations/project/0029_backup_failure_ledger.sql',
  `CREATE TABLE backup_failures (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN (
    'manual-protection', 'import', 'replace', 'split-chapter', 'merge-chapter',
    'move-blocks', 'permanent-delete', 'migration'
  )),
  backup_track TEXT NOT NULL CHECK(backup_track IN ('daily', 'major', 'named')),
  error_code TEXT NOT NULL CHECK(error_code IN (
    'BACKUP_CREATE_FAILED', 'BACKUP_VERIFY_FAILED', 'BACKUP_SPACE_LOW'
  )),
  occurred_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK(resolved_at IS NULL OR resolved_at >= occurred_at)
) STRICT;

CREATE INDEX idx_backup_failures_project_open
ON backup_failures(project_id, resolved_at, occurred_at DESC);

UPDATE projects SET schema_version = 29;
`,
);

let contracts = await read('packages/contracts/src/recovery.ts');
contracts = replaceExact(
  contracts,
  `export const BackupTrackSchema = z.enum(['daily', 'major', 'named']);
export const BackupProtectionReasonSchema`,
  `export const BackupTrackSchema = z.enum(['daily', 'major', 'named']);
export const BackupFailureCodeSchema = z.enum([
  'BACKUP_CREATE_FAILED',
  'BACKUP_VERIFY_FAILED',
  'BACKUP_SPACE_LOW',
]);
export const BackupFailureRecordSchema = z.strictObject({
  failureId: z.uuid(),
  projectId: ProjectIdSchema,
  operation: RecoveryOperationSchema,
  track: BackupTrackSchema,
  errorCode: BackupFailureCodeSchema,
  occurredAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export const BackupProtectionReasonSchema`,
  'backup failure contracts',
);
contracts = replaceExact(
  contracts,
  `  checkpoints: z.array(BackupRecordSchema),
  policy: BackupPolicySchema,`,
  `  checkpoints: z.array(BackupRecordSchema),
  backupFailures: z.array(BackupFailureRecordSchema),
  policy: BackupPolicySchema,`,
  'overview backup failures',
);
contracts = replaceExact(
  contracts,
  `export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type BackupPolicy`,
  `export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type BackupFailureCode = z.infer<typeof BackupFailureCodeSchema>;
export type BackupFailureRecord = z.infer<typeof BackupFailureRecordSchema>;
export type BackupPolicy`,
  'backup failure types',
);
await write('packages/contracts/src/recovery.ts', contracts);

let recovery = await read('packages/core-service/src/recovery.ts');
recovery = replaceExact(
  recovery,
  `  BackupRecordSchema,
  BackupCleanupPreviewSchema,`,
  `  BackupRecordSchema,
  BackupFailureRecordSchema,
  BackupCleanupPreviewSchema,`,
  'recovery failure schema import',
);
recovery = replaceExact(
  recovery,
  `  type BackupRecord,
  type BackupCleanupItem,`,
  `  type BackupRecord,
  type BackupFailureCode,
  type BackupFailureRecord,
  type BackupCleanupItem,`,
  'recovery failure type import',
);
recovery = replaceExact(
  recovery,
  `    return this.#createBackup(requestId, input, {
      track: named ? 'named' : 'major',`,
  `    return this.#createTrackedBackup(requestId, input, {
      track: named ? 'named' : 'major',`,
  'track operation checkpoint failure',
);
recovery = replaceExact(
  recovery,
  `    return this.#createBackup(
      requestId,
      { projectId: input.projectId, operation: 'manual-protection' },`,
  `    return this.#createTrackedBackup(
      requestId,
      { projectId: input.projectId, operation: 'manual-protection' },`,
  'track daily failure',
);
recovery = replaceExact(
  recovery,
  `    return this.#createBackup(
      requestId,
      { projectId: input.projectId, operation: 'manual-protection' },
      {
        track: 'named',`,
  `    return this.#createTrackedBackup(
      requestId,
      { projectId: input.projectId, operation: 'manual-protection' },
      {
        track: 'named',`,
  'track named failure',
);
recovery = replaceExact(
  recovery,
  `  async #createBackup(
    requestId: string,`,
  `  async #createTrackedBackup(
    requestId: string,
    input: RecoveryCreateInput,
    classification: {
      readonly track: BackupRecord['track'];
      readonly displayName: string | null;
      readonly note: string | null;
      readonly authorProtected: boolean;
      readonly migrationProtected: boolean;
    },
  ): Promise<BackupRecord> {
    try {
      return await this.#createBackup(requestId, input, classification);
    } catch (error) {
      await this.#recordBackupFailure(input, classification.track, error);
      throw error;
    }
  }

  async #recordBackupFailure(
    input: RecoveryCreateInput,
    track: BackupRecord['track'],
    error: unknown,
  ): Promise<void> {
    const allowed = new Set<BackupFailureCode>([
      'BACKUP_CREATE_FAILED',
      'BACKUP_VERIFY_FAILED',
      'BACKUP_SPACE_LOW',
    ]);
    const errorCode =
      error instanceof RecoveryServiceError && allowed.has(error.code as BackupFailureCode)
        ? (error.code as BackupFailureCode)
        : 'BACKUP_CREATE_FAILED';
    const failure = BackupFailureRecordSchema.parse({
      failureId: this.#idFactory(),
      projectId: input.projectId,
      operation: input.operation,
      track,
      errorCode,
      occurredAt: this.#clock.now().toISOString(),
      resolvedAt: null,
    });
    try {
      await this.#workspace.writeProject(this.#idFactory(), input.projectId, (database) => {
        database
          .prepare(
            \`INSERT INTO backup_failures(
               id, project_id, operation, backup_track, error_code, occurred_at, resolved_at
             ) VALUES(?, ?, ?, ?, ?, ?, NULL)\`,
          )
          .run(
            failure.failureId,
            failure.projectId,
            failure.operation,
            failure.track,
            failure.errorCode,
            failure.occurredAt,
          );
      });
    } catch {
      // Best effort only: the original backup failure remains authoritative.
    }
  }

  async #createBackup(
    requestId: string,`,
  'backup failure helper',
);
recovery = replaceExact(
  recovery,
  `            .run(
              record.backupId,
              record.projectId,
              record.operation,
              record.backupFileName,
              record.sizeBytes,
              record.sha256,
              record.createdAt,
              record.verifiedAt,
              record.track,
              record.displayName,
              record.note,
              record.authorProtected ? 1 : 0,
              record.migrationProtected ? 1 : 0,
              record.schemaVersion,
            );`,
  `            .run(
              record.backupId,
              record.projectId,
              record.operation,
              record.backupFileName,
              record.sizeBytes,
              record.sha256,
              record.createdAt,
              record.verifiedAt,
              record.track,
              record.displayName,
              record.note,
              record.authorProtected ? 1 : 0,
              record.migrationProtected ? 1 : 0,
              record.schemaVersion,
            );
          database
            .prepare(
              \`UPDATE backup_failures
                  SET resolved_at = ?
                WHERE project_id = ? AND backup_track = ? AND resolved_at IS NULL\`,
            )
            .run(record.verifiedAt, record.projectId, record.track);`,
  'resolve backup failures on success',
);
recovery = replaceExact(
  recovery,
  `    const policy = this.#readPolicy(projectId);
    const space = {`,
  `    let backupFailures: BackupFailureRecord[] = [];
    try {
      backupFailures = this.#workspace.readProject(projectId, (database) =>
        database
          .prepare(
            \`SELECT id AS failureId, project_id AS projectId, operation,
                    backup_track AS track, error_code AS errorCode,
                    occurred_at AS occurredAt, resolved_at AS resolvedAt
               FROM backup_failures
              WHERE project_id = ? AND resolved_at IS NULL
              ORDER BY occurred_at DESC, id DESC
              LIMIT 20\`,
          )
          .all(projectId)
          .map((row) => BackupFailureRecordSchema.parse(row)),
      );
    } catch {
      backupFailures = [];
    }
    const policy = this.#readPolicy(projectId);
    const space = {`,
  'read backup failure ledger',
);
recovery = replaceExact(
  recovery,
  `      checkpoints,
      policy,`,
  `      checkpoints,
      backupFailures,
      policy,`,
  'return backup failures',
);
await write('packages/core-service/src/recovery.ts', recovery);

let attention = await read('apps/desktop/renderer/src/runtime/workspace-attention.ts');
attention = replaceExact(
  attention,
  `export type WorkspaceAttentionSource = 'candidate' | 'proposal' | 'validation' | 'search';`,
  `export type WorkspaceAttentionSource =
  | 'candidate'
  | 'proposal'
  | 'validation'
  | 'search'
  | 'recovery';`,
  'recovery attention source',
);
attention = replaceExact(
  attention,
  `  readonly searchFailedCount: number;
  readonly unavailableSources`,
  `  readonly searchFailedCount: number;
  readonly backupFailureCount: number;
  readonly unavailableSources`,
  'backup failure attention field',
);
attention = replaceExact(
  attention,
  `  searchFailedCount: 0,
  unavailableSources: [],`,
  `  searchFailedCount: 0,
  backupFailureCount: 0,
  unavailableSources: [],`,
  'empty backup failure attention',
);
attention = replaceExact(
  attention,
  `  readonly searchState: {
    readonly status: SearchIndexStatus;
    readonly failedCount: number;
  } | null;
  readonly unavailableSources`,
  `  readonly searchState: {
    readonly status: SearchIndexStatus;
    readonly failedCount: number;
  } | null;
  readonly backupFailures?: readonly unknown[];
  readonly unavailableSources`,
  'attention input backup failures',
);
attention = replaceExact(
  attention,
  `    searchFailedCount: input.searchState?.failedCount ?? 0,
    unavailableSources`,
  `    searchFailedCount: input.searchState?.failedCount ?? 0,
    backupFailureCount: input.backupFailures?.length ?? 0,
    unavailableSources`,
  'summarize backup failures',
);
attention = replaceExact(
  attention,
  `  const [candidateOutcome, proposalOutcome, validationOutcome, searchOutcome] = await Promise.all([`,
  `  const [candidateOutcome, proposalOutcome, validationOutcome, searchOutcome, recoveryOutcome] =
    await Promise.all([`,
  'load recovery attention tuple',
);
attention = replaceExact(
  attention,
  `    guarded(() => bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' })),
  ]);`,
  `    guarded(() => bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' })),
    guarded(() => bridge.recovery.getOverview(projectId, { mode: 'replace' })),
  ]);`,
  'load recovery overview',
);
attention = replaceExact(
  attention,
  `  if (searchOutcome?.state !== 'success') unavailableSources.push('search');`,
  `  if (searchOutcome?.state !== 'success') unavailableSources.push('search');
  if (recoveryOutcome?.state !== 'success') unavailableSources.push('recovery');`,
  'recovery unavailable',
);
attention = replaceExact(
  attention,
  `    searchState: searchOutcome?.state === 'success' ? searchOutcome.data : null,
    unavailableSources,`,
  `    searchState: searchOutcome?.state === 'success' ? searchOutcome.data : null,
    backupFailures:
      recoveryOutcome?.state === 'success' ? recoveryOutcome.data.backupFailures : [],
    unavailableSources,`,
  'recovery attention result',
);
await write('apps/desktop/renderer/src/runtime/workspace-attention.ts', attention);

let appShell = await read('apps/desktop/renderer/src/app/app-shell-m3.tsx');
appShell = replaceExact(
  appShell,
  `    if (workspaceAttention.searchFailedCount > 0) {`,
  `    if (workspaceAttention.backupFailureCount > 0) {
      arbitrator.publish({
        id: 'backup-failed',
        priority: 'P2',
        message: \`有\${workspaceAttention.backupFailureCount}次备份失败尚未由后续成功备份解除。\`,
        persistence: 'sticky',
        createdAt: 57,
      });
    }
    if (workspaceAttention.searchFailedCount > 0) {`,
  'backup failure status',
);
appShell = replaceExact(
  appShell,
  `      globalStatus.id === 'search-failed' ||
      globalStatus.id === 'search-stale'`,
  `      globalStatus.id === 'search-failed' ||
      globalStatus.id === 'search-stale' ||
      globalStatus.id === 'backup-failed'`,
  'backup failure action',
);
appShell = replaceExact(
  appShell,
  `      return { label: '打开检查', run: () => void transitionToRoute('checks') };`,
  `      return globalStatus.id === 'backup-failed'
        ? { label: '打开恢复中心', run: () => void transitionToRoute('recovery') }
        : { label: '打开检查', run: () => void transitionToRoute('checks') };`,
  'backup recovery action',
);
await write('apps/desktop/renderer/src/app/app-shell-m3.tsx', appShell);

let attentionTest = await read('tests/unit/workspace-attention.test.ts');
attentionTest = replaceExact(
  attentionTest,
  `        searchState: { status: 'stale', failedCount: 2 },`,
  `        searchState: { status: 'stale', failedCount: 2 },
        backupFailures: [{ failureId: 'failure-1' }],`,
  'attention test backup failure input',
);
attentionTest = replaceExact(
  attentionTest,
  `      searchFailedCount: 2,
      unavailableSources: [],`,
  `      searchFailedCount: 2,
      backupFailureCount: 1,
      unavailableSources: [],`,
  'attention test backup failure output',
);
attentionTest = replaceExact(
  attentionTest,
  `        searchState: null,
        unavailableSources: ['proposal', 'search'],`,
  `        searchState: null,
        backupFailures: [],
        unavailableSources: ['proposal', 'search', 'recovery'],`,
  'attention unavailable recovery',
);
attentionTest = replaceExact(
  attentionTest,
  `    ).toEqual(['proposal', 'search']);`,
  `    ).toEqual(['proposal', 'search', 'recovery']);`,
  'attention unavailable expected',
);
await write('tests/unit/workspace-attention.test.ts', attentionTest);

await write(
  'tests/migration/backup-failure-ledger-migration.test.ts',
  `import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const directories: string[] = [];
const clock = { now: () => new Date('2026-07-28T08:45:00.000Z') };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

describe('M8-02 backup failure ledger migration', () => {
  it('creates a strict project-scoped failure ledger at schema 29', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-failure-migration-'));
    directories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const project = await workspace.create(
      randomUUID(),
      { name: '备份失败账本', channel: '长篇' },
      parent,
    );
    await workspace.shutdown();
    await runtime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readBigInts: true,
      enableForeignKeyConstraints: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: 29n,
      });
      expect(
        database.prepare("SELECT strict FROM pragma_table_list WHERE name = 'backup_failures'").get(),
      ).toEqual({ strict: 1n });
      expect(() =>
        database
          .prepare(
            `INSERT INTO backup_failures(
               id, project_id, operation, backup_track, error_code, occurred_at, resolved_at
             ) VALUES(?, ?, 'import', 'daily', 'UNKNOWN', ?, NULL)`,
          )
          .run(randomUUID(), project.projectId, clock.now().toISOString()),
      ).toThrow();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
`,
);

await write(
  'tests/integration/recovery-failure-ledger.test.ts',
  `import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const directories: string[] = [];
const clock = { now: () => new Date('2026-07-28T08:50:00.000Z') };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

describe('backup failure ledger', () => {
  it('persists a privacy-safe failure and resolves it after a successful backup on the same track', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-failure-ledger-'));
    directories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    let freeBytes = 0n;
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const recovery = new RecoveryService(workspace, {
      backupRootDirectory: path.join(root, 'backups'),
      clock,
      freeBytes: async () => freeBytes,
    });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '备份失败账本', channel: '长篇' },
        parent,
      );
      await expect(
        recovery.createDailyBackup(randomUUID(), { projectId: project.projectId }),
      ).rejects.toMatchObject({ code: 'BACKUP_SPACE_LOW' });

      const failed = await recovery.getOverview(project.projectId);
      expect(failed.backupFailures).toEqual([
        expect.objectContaining({
          projectId: project.projectId,
          track: 'daily',
          errorCode: 'BACKUP_SPACE_LOW',
          resolvedAt: null,
        }),
      ]);
      expect(JSON.stringify(failed.backupFailures)).not.toContain(project.workspacePath);

      freeBytes = 10_000_000_000n;
      await recovery.createDailyBackup(randomUUID(), { projectId: project.projectId });
      const resolved = await recovery.getOverview(project.projectId);
      expect(resolved.backupFailures).toEqual([]);
      expect(
        workspace.readProject(project.projectId, (database) =>
          database
            .prepare(
              `SELECT error_code AS errorCode, resolved_at AS resolvedAt
                 FROM backup_failures WHERE project_id = ?`,
            )
            .get(project.projectId),
        ),
      ).toMatchObject({ errorCode: 'BACKUP_SPACE_LOW', resolvedAt: expect.any(String) });
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
`,
);

const migrationFiles = await readdir('tests/migration');
for (const name of migrationFiles.filter((item) => item.endsWith('.test.ts'))) {
  const file = path.join('tests/migration', name);
  const content = await read(file);
  const next = content.replaceAll('schema_version: 28n', 'schema_version: 29n');
  if (next !== content) await write(file, next);
}

let schemaDoc = await read('docs/database/DATABASE_SCHEMA.md');
if (!schemaDoc.includes('## 备份失败账本（Schema 29）')) {
  schemaDoc += `

## 备份失败账本（Schema 29）

- \`backup_failures\`只记录项目ID、备份轨道、操作类型、稳定错误码和发生/解除时间，不记录路径、正文或异常消息。
- 失败记录保持未解除，直至同项目同轨道产生已验证备份；Recovery Overview仅返回未解除记录。
- 该表是StatusArbiter展示备份失败的唯一权威来源，Renderer不得从瞬时错误消息推导历史状态。
`;
}
await write('docs/database/DATABASE_SCHEMA.md', schemaDoc);

await rm('scripts/m8-02-backup-failure-ledger-codemod.mjs');
await rm('.github/workflows/m8-02-backup-failure-ledger-codemod.yml');
