import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  ImportCommitInputSchema,
  type ImportCommitInput,
  type ImportCommitResult,
  type ImportPlan,
  type ImportPreviewInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import {
  ImportExportService,
  ImportExportServiceError,
  type ImportExportServiceOptions,
} from './import-export.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import type { RecoveryService } from './recovery.js';

const systemClock: DatabaseClock = { now: () => new Date() };
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const PLAN_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAXIMUM_RETAINED_PLANS = 16;
const INVALIDATING_IMPORT_PLAN_ERRORS = new Set([
  'IMPORT_PLAN_STALE',
  'IMPORT_FORMAT_UNSUPPORTED',
  'IMPORT_ARCHIVE_LIMIT',
]);

interface RetainedImportPlan {
  readonly service: ImportExportService;
  readonly sourcePath: string;
  readonly createdAtMs: number;
}

export interface CoordinatedImportExportServiceOptions extends ImportExportServiceOptions {
  readonly maximumRetainedPlans?: number;
}

async function validatedImportSource(
  filePath: string,
  phase: 'preview' | 'commit',
): Promise<string> {
  try {
    if (!path.isAbsolute(filePath) && !path.win32.isAbsolute(filePath)) {
      throw new ImportExportServiceError(
        'IMPORT_FORMAT_UNSUPPORTED',
        'Import paths must be absolute paths selected by the desktop process.',
      );
    }
    const details = await lstat(filePath);
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new ImportExportServiceError(
        'IMPORT_FORMAT_UNSUPPORTED',
        'The selected import source must be a regular file.',
      );
    }
    if (details.size > MAX_IMPORT_BYTES) {
      throw new ImportExportServiceError(
        'IMPORT_ARCHIVE_LIMIT',
        'The selected text file exceeds the 20 MiB M1 import limit.',
      );
    }
    return await realpath(filePath);
  } catch (error) {
    if (error instanceof ImportExportServiceError) throw error;
    throw new ImportExportServiceError(
      phase === 'commit' ? 'IMPORT_PLAN_STALE' : 'IMPORT_FORMAT_UNSUPPORTED',
      phase === 'commit'
        ? 'The import source is no longer available after preview.'
        : 'The selected import source could not be opened safely.',
      { cause: error },
    );
  }
}

export class CoordinatedImportExportService extends ImportExportService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #recovery: RecoveryService;
  readonly #baseOptions: ImportExportServiceOptions;
  readonly #clock: DatabaseClock;
  readonly #maximumRetainedPlans: number;
  readonly #retainedPlans = new Map<string, RetainedImportPlan>();

  constructor(
    workspace: ProjectWorkspaceService,
    recovery: RecoveryService,
    options: CoordinatedImportExportServiceOptions = {},
  ) {
    super(workspace, recovery, options);
    const maximumRetainedPlans = options.maximumRetainedPlans ?? DEFAULT_MAXIMUM_RETAINED_PLANS;
    if (!Number.isInteger(maximumRetainedPlans) || maximumRetainedPlans < 1) {
      throw new Error('IMPORT_PLAN_RETENTION_LIMIT_INVALID');
    }
    this.#workspace = workspace;
    this.#recovery = recovery;
    this.#baseOptions = options;
    this.#clock = options.clock ?? systemClock;
    this.#maximumRetainedPlans = maximumRetainedPlans;
  }

  override async previewImport(
    raw: ImportPreviewInput,
    selectedPath: string,
  ): Promise<ImportPlan> {
    const sourcePath = await validatedImportSource(selectedPath, 'preview');
    const service = new ImportExportService(this.#workspace, this.#recovery, this.#baseOptions);
    const plan = await service.previewImport(raw, sourcePath);
    const createdAtMs = this.#clock.now().getTime();
    this.#pruneExpired(createdAtMs);
    this.#retainedPlans.set(plan.planId, { service, sourcePath, createdAtMs });
    this.#trimToLimit();
    return plan;
  }

  override async commitImport(
    requestId: string,
    raw: ImportCommitInput,
  ): Promise<ImportCommitResult> {
    const input = ImportCommitInputSchema.parse(raw);
    const now = this.#clock.now().getTime();
    this.#pruneExpired(now);
    const retained = this.#retainedPlans.get(input.planId);
    if (!retained) {
      throw new ImportExportServiceError(
        'IMPORT_PLAN_STALE',
        'The import plan is missing, expired or was replaced by a newer preview.',
      );
    }

    try {
      const sourcePath = await validatedImportSource(retained.sourcePath, 'commit');
      if (sourcePath !== retained.sourcePath) {
        throw new ImportExportServiceError(
          'IMPORT_PLAN_STALE',
          'The import source changed after preview.',
        );
      }
      const result = await retained.service.commitImport(requestId, input);
      this.#retainedPlans.delete(input.planId);
      return result;
    } catch (error) {
      if (
        !(error instanceof ImportExportServiceError) ||
        INVALIDATING_IMPORT_PLAN_ERRORS.has(error.code)
      ) {
        this.#retainedPlans.delete(input.planId);
      }
      throw error;
    }
  }

  #pruneExpired(now: number): void {
    for (const [planId, retained] of this.#retainedPlans) {
      if (now - retained.createdAtMs > PLAN_TTL_MS) this.#retainedPlans.delete(planId);
    }
  }

  #trimToLimit(): void {
    while (this.#retainedPlans.size > this.#maximumRetainedPlans) {
      const oldestPlanId = this.#retainedPlans.keys().next().value;
      if (typeof oldestPlanId !== 'string') return;
      this.#retainedPlans.delete(oldestPlanId);
    }
  }
}
