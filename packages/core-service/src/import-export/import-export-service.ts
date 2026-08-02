import type {
  ExportVersionCatalog,
  ExportVersionsInput,
  ExportVersionsResult,
  ImportCommitInput,
  ImportCommitResult,
  ImportPlan,
  ImportPreviewInput,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import type { RecoveryService } from '../recovery.js';
import { ExportVersionService } from './export-version-service.js';
import { ImportCommitService } from './import-commit-service.js';
import type { ImportExportServiceOptions, ImportPlanStore } from './import-export-model.js';
import { ImportPreviewService } from './import-preview-service.js';

export class ImportExportService {
  readonly #preview: ImportPreviewService;
  readonly #commit: ImportCommitService;
  readonly #export: ExportVersionService;

  constructor(
    workspace: ProjectWorkspaceService,
    recovery: RecoveryService,
    options: ImportExportServiceOptions = {},
  ) {
    const plans: ImportPlanStore = new Map();
    this.#preview = new ImportPreviewService(workspace, plans, options);
    this.#commit = new ImportCommitService(workspace, recovery, plans, options);
    this.#export = new ExportVersionService(workspace, options);
  }

  previewImport(input: ImportPreviewInput, selectedPath: string): Promise<ImportPlan> {
    return this.#preview.previewImport(input, selectedPath);
  }

  commitImport(requestId: string, input: ImportCommitInput): Promise<ImportCommitResult> {
    return this.#commit.commitImport(requestId, input);
  }

  listExportVersions(projectId: string): ExportVersionCatalog {
    return this.#export.listExportVersions(projectId);
  }

  exportVersions(
    input: ExportVersionsInput,
    selectedDirectory: string,
  ): Promise<ExportVersionsResult> {
    return this.#export.exportVersions(input, selectedDirectory);
  }
}
