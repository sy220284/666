#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'anchor missing: {path}: {old[:80]!r}')
    target.write_text(source.replace(old, new, 1), encoding='utf-8')


def append(path: str, content: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding='utf-8')
    if content.strip() in source:
        return
    target.write_text(source.rstrip() + '\n\n' + content.strip() + '\n', encoding='utf-8')


# contracts aggregation
patch(
    'packages/contracts/src/project-workspace.ts',
    "import { CoreRecoveryOperationSchema, CoreRecoveryResultSchema } from './recovery.js';\n",
    "import { CoreRecoveryOperationSchema, CoreRecoveryResultSchema } from './recovery.js';\nimport { CoreTextIoOperationSchema, CoreTextIoResultSchema } from './import-export.js';\n",
)
patch(
    'packages/contracts/src/project-workspace.ts',
    '  CoreRecoveryOperationSchema,\n]);',
    '  CoreRecoveryOperationSchema,\n  CoreTextIoOperationSchema,\n]);',
)
patch(
    'packages/contracts/src/project-workspace.ts',
    '  CoreRecoveryResultSchema,\n]);',
    '  CoreRecoveryResultSchema,\n  CoreTextIoResultSchema,\n]);',
)

patch(
    'packages/contracts/src/index.ts',
    "} from './recovery.js';\n",
    "} from './recovery.js';\nimport {\n  TEXT_IO_COMMANDS,\n  TEXT_IO_IPC_CHANNELS,\n  ImportPreviewCommandSchema,\n  ImportCommitCommandSchema,\n  ExportVersionListCommandSchema,\n  ExportVersionsCommandSchema,\n  type ImportPreviewInput,\n  type ImportPlan,\n  type ImportCommitInput,\n  type ImportCommitResult,\n  type ExportVersionCatalog,\n  type ExportVersionsInput,\n  type ExportVersionsResult,\n} from './import-export.js';\n",
)
patch(
    'packages/contracts/src/index.ts',
    "export * from './recovery.js';\n",
    "export * from './recovery.js';\nexport * from './import-export.js';\n",
)
patch(
    'packages/contracts/src/index.ts',
    '  ...RECOVERY_IPC_CHANNELS,\n',
    '  ...RECOVERY_IPC_CHANNELS,\n  ...TEXT_IO_IPC_CHANNELS,\n',
)
patch(
    'packages/contracts/src/index.ts',
    '  ...RECOVERY_COMMANDS,\n',
    '  ...RECOVERY_COMMANDS,\n  ...TEXT_IO_COMMANDS,\n',
)
patch(
    'packages/contracts/src/index.ts',
    '  DraftApplyPatchCommandSchema,\n  AiSetCredentialCommandSchema,',
    '  DraftApplyPatchCommandSchema,\n  ImportPreviewCommandSchema,\n  ImportCommitCommandSchema,\n  ExportVersionListCommandSchema,\n  ExportVersionsCommandSchema,\n  AiSetCredentialCommandSchema,',
)
patch(
    'packages/contracts/src/index.ts',
    "  readonly planning: {\n",
    "  readonly textIo: {\n    readonly previewImport: (input: ImportPreviewInput) => Promise<CommandResult<ImportPlan>>;\n    readonly commitImport: (input: ImportCommitInput) => Promise<CommandResult<ImportCommitResult>>;\n    readonly listExportVersions: (projectId: string) => Promise<CommandResult<ExportVersionCatalog>>;\n    readonly exportVersions: (input: ExportVersionsInput) => Promise<CommandResult<ExportVersionsResult>>;\n  };\n  readonly planning: {\n",
)

# core service aggregation and routing
patch(
    'packages/core-service/src/index.ts',
    "export * from './recovery.js';\n",
    "export * from './recovery.js';\nexport * from './import-export.js';\n",
)
patch(
    'packages/core-service/src/utility-entry.ts',
    '  RECOVERY_COMMANDS,\n',
    '  RECOVERY_COMMANDS,\n  TEXT_IO_COMMANDS,\n',
)
patch(
    'packages/core-service/src/utility-entry.ts',
    "import { RecoveryService, RecoveryServiceError } from './recovery.js';\n",
    "import { RecoveryService, RecoveryServiceError } from './recovery.js';\nimport { ImportExportService, ImportExportServiceError } from './import-export.js';\n",
)
patch(
    'packages/core-service/src/utility-entry.ts',
    'const versions = new VersionService(projectWorkspace);\n',
    'const versions = new VersionService(projectWorkspace);\nconst textIo = new ImportExportService(projectWorkspace, recovery);\n',
)
patch(
    'packages/core-service/src/utility-entry.ts',
    '  if (error instanceof RecoveryServiceError) {\n',
    "  if (error instanceof ImportExportServiceError) {\n    switch (error.code) {\n      case 'IMPORT_FORMAT_UNSUPPORTED':\n        return 'IMPORT_FORMAT_UNSUPPORTED_001';\n      case 'IMPORT_ENCODING_UNCERTAIN':\n        return 'IMPORT_ENCODING_UNCERTAIN_002';\n      case 'IMPORT_ARCHIVE_LIMIT':\n        return 'IMPORT_ARCHIVE_LIMIT_003';\n      case 'IMPORT_CONTENT_EMPTY':\n        return 'IMPORT_CONTENT_EMPTY_004';\n      case 'IMPORT_PLAN_STALE':\n        return 'IMPORT_PLAN_STALE_005';\n      case 'IMPORT_COMMIT_FAILED':\n        return 'IMPORT_COMMIT_FAILED_006';\n      case 'EXPORT_VERSION_REQUIRED':\n        return 'EXPORT_VERSION_REQUIRED_001';\n      case 'EXPORT_TARGET_EXISTS':\n        return 'EXPORT_TARGET_EXISTS_002';\n      case 'EXPORT_WRITE_FAILED':\n        return 'EXPORT_WRITE_FAILED_003';\n    }\n  }\n  if (error instanceof RecoveryServiceError) {\n",
)
patch(
    'packages/core-service/src/utility-entry.ts',
    "      case RECOVERY_COMMANDS.exportVersion:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await recovery.exportVersion(operation.input, operation.targetDirectory),\n        });\n",
    "      case RECOVERY_COMMANDS.exportVersion:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await recovery.exportVersion(operation.input, operation.targetDirectory),\n        });\n      case TEXT_IO_COMMANDS.previewImport:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await textIo.previewImport(operation.input, operation.sourcePath),\n        });\n      case TEXT_IO_COMMANDS.commitImport:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await textIo.commitImport(requestId, operation.input),\n        });\n      case TEXT_IO_COMMANDS.listExportVersions:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: textIo.listExportVersions(operation.input.projectId),\n        });\n      case TEXT_IO_COMMANDS.exportVersions:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await textIo.exportVersions(operation.input, operation.targetDirectory),\n        });\n",
)

# desktop main file/directory selectors
patch(
    'apps/desktop/main/src/electron-main.ts',
    "  const chooseDirectory = async (\n",
    "  const chooseFile = async (\n    title: string,\n    buttonLabel: string,\n    e2eVariable: string,\n  ): Promise<string | null> => {\n    const injected = e2eSelection(e2eVariable);\n    if (injected) return injected;\n    const window = mainWindow;\n    if (!window) return null;\n    const selection = await dialog.showOpenDialog(window, {\n      title,\n      buttonLabel,\n      properties: ['openFile'],\n      filters: [{ name: '文本文件', extensions: ['txt', 'md', 'markdown'] }],\n    });\n    return selection.canceled ? null : (selection.filePaths[0] ?? null);\n  };\n  const chooseDirectory = async (\n",
)
patch(
    'apps/desktop/main/src/electron-main.ts',
    "    chooseRecoveryExportDirectory: () =>\n      chooseDirectory(\n        '选择Version导出位置',\n        '导出到这里',\n        'WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY',\n      ),\n",
    "    chooseRecoveryExportDirectory: () =>\n      chooseDirectory(\n        '选择Version导出位置',\n        '导出到这里',\n        'WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY',\n      ),\n    chooseTextImportFile: () =>\n      chooseFile('选择TXT或Markdown旧稿', '预览导入', 'WORLDFORGE_E2E_IMPORT_FILE'),\n    chooseTextExportDirectory: () =>\n      chooseDirectory('选择文本导出位置', '导出到这里', 'WORLDFORGE_E2E_TEXT_EXPORT_DIRECTORY'),\n",
)

# main IPC imports/options/channels/handlers
patch(
    'apps/desktop/main/src/ipc-handlers.ts',
    '  RECOVERY_COMMANDS,\n',
    '  RECOVERY_COMMANDS,\n  TEXT_IO_COMMANDS,\n',
)
patch(
    'apps/desktop/main/src/ipc-handlers.ts',
    '  RecoveryExportCommandSchema,\n',
    '  RecoveryExportCommandSchema,\n  ImportPreviewCommandSchema,\n  ImportCommitCommandSchema,\n  ExportVersionListCommandSchema,\n  ExportVersionsCommandSchema,\n',
)
patch(
    'apps/desktop/main/src/ipc-handlers.ts',
    '  readonly chooseRecoveryExportDirectory: () => Promise<string | null>;\n',
    '  readonly chooseRecoveryExportDirectory: () => Promise<string | null>;\n  readonly chooseTextImportFile: () => Promise<string | null>;\n  readonly chooseTextExportDirectory: () => Promise<string | null>;\n',
)
patch(
    'apps/desktop/main/src/ipc-handlers.ts',
    '    IPC_CHANNELS.exportVersion,\n',
    '    IPC_CHANNELS.exportVersion,\n    IPC_CHANNELS.previewImport,\n    IPC_CHANNELS.commitImport,\n    IPC_CHANNELS.listExportVersions,\n    IPC_CHANNELS.exportVersions,\n',
)
patch(
    'apps/desktop/main/src/ipc-handlers.ts',
    "  register(IPC_CHANNELS.listStructure, async (event, raw) => {\n",
    "  register(IPC_CHANNELS.previewImport, async (event, raw) => {\n    const rejected = rejectUntrusted(event, raw);\n    if (rejected) return rejected;\n    const parsed = ImportPreviewCommandSchema.safeParse(raw);\n    if (!parsed.success) return invalidRequest(raw);\n    let sourcePath: string | null;\n    try {\n      sourcePath = await options.chooseTextImportFile();\n    } catch {\n      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');\n    }\n    if (!sourcePath) return cancelledSelection(parsed.data.requestId);\n    return invokeProject(parsed.data.requestId, {\n      operation: TEXT_IO_COMMANDS.previewImport,\n      input: parsed.data.payload,\n      sourcePath,\n    });\n  });\n\n  register(IPC_CHANNELS.commitImport, async (event, raw) => {\n    const rejected = rejectUntrusted(event, raw);\n    if (rejected) return rejected;\n    const parsed = ImportCommitCommandSchema.safeParse(raw);\n    if (!parsed.success) return invalidRequest(raw);\n    return invokeProject(parsed.data.requestId, {\n      operation: TEXT_IO_COMMANDS.commitImport,\n      input: parsed.data.payload,\n    });\n  });\n\n  register(IPC_CHANNELS.listExportVersions, async (event, raw) => {\n    const rejected = rejectUntrusted(event, raw);\n    if (rejected) return rejected;\n    const parsed = ExportVersionListCommandSchema.safeParse(raw);\n    if (!parsed.success) return invalidRequest(raw);\n    return invokeProject(parsed.data.requestId, {\n      operation: TEXT_IO_COMMANDS.listExportVersions,\n      input: parsed.data.payload,\n    });\n  });\n\n  register(IPC_CHANNELS.exportVersions, async (event, raw) => {\n    const rejected = rejectUntrusted(event, raw);\n    if (rejected) return rejected;\n    const parsed = ExportVersionsCommandSchema.safeParse(raw);\n    if (!parsed.success) return invalidRequest(raw);\n    let targetDirectory: string | null;\n    try {\n      targetDirectory = await options.chooseTextExportDirectory();\n    } catch {\n      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');\n    }\n    if (!targetDirectory) return cancelledSelection(parsed.data.requestId);\n    return invokeProject(parsed.data.requestId, {\n      operation: TEXT_IO_COMMANDS.exportVersions,\n      input: parsed.data.payload,\n      targetDirectory,\n    });\n  });\n\n  register(IPC_CHANNELS.listStructure, async (event, raw) => {\n",
)

# preload bridge
patch(
    'apps/desktop/preload/src/index.ts',
    '  RecoveryExportResultSchema,\n',
    '  RecoveryExportResultSchema,\n  ImportPreviewCommandSchema,\n  ImportPlanResultSchema,\n  ImportCommitCommandSchema,\n  ImportCommitResultEnvelopeSchema,\n  ExportVersionListCommandSchema,\n  ExportVersionCatalogResultSchema,\n  ExportVersionsCommandSchema,\n  ExportVersionsResultEnvelopeSchema,\n',
)
patch(
    'apps/desktop/preload/src/index.ts',
    '  project: {\n',
    "  textIo: {\n    previewImport: (input) =>\n      invoke(\n        IPC_CHANNELS.previewImport,\n        ImportPreviewCommandSchema.parse(envelope(APP_COMMANDS.previewImport, input)),\n        ImportPlanResultSchema,\n      ),\n    commitImport: (input) =>\n      invoke(\n        IPC_CHANNELS.commitImport,\n        ImportCommitCommandSchema.parse(envelope(APP_COMMANDS.commitImport, input)),\n        ImportCommitResultEnvelopeSchema,\n      ),\n    listExportVersions: (projectId) =>\n      invoke(\n        IPC_CHANNELS.listExportVersions,\n        ExportVersionListCommandSchema.parse(\n          envelope(APP_COMMANDS.listExportVersions, { projectId }),\n        ),\n        ExportVersionCatalogResultSchema,\n      ),\n    exportVersions: (input) =>\n      invoke(\n        IPC_CHANNELS.exportVersions,\n        ExportVersionsCommandSchema.parse(envelope(APP_COMMANDS.exportVersions, input)),\n        ExportVersionsResultEnvelopeSchema,\n      ),\n  },\n  project: {\n",
)

# renderer HTML
patch(
    'apps/desktop/renderer/src/index.html',
    '                    <button class="quiet-button" type="button" data-open-recovery>\n                      恢复与导出\n                    </button>\n',
    '                    <button class="quiet-button" type="button" data-open-recovery>\n                      恢复与导出\n                    </button>\n                    <button class="quiet-button" type="button" data-open-text-io>\n                      导入导出\n                    </button>\n',
)
patch(
    'apps/desktop/renderer/src/index.html',
    '    <dialog class="boundary-dialog" data-boundary-dialog aria-labelledby="boundary-dialog-title">\n',
    '''    <dialog class="settings-dialog text-io-dialog" data-text-io-dialog aria-labelledby="text-io-title">
      <div class="settings-dialog__body text-io-dialog__body">
        <p class="eyebrow">TXT · MARKDOWN · VERSION</p>
        <h2 id="text-io-title">旧稿导入与稳定稿导出</h2>
        <p data-text-io-status role="status"></p>
        <section class="text-io-section">
          <header><h3>导入预览</h3><span>预览阶段不写项目数据库</span></header>
          <div class="text-io-controls">
            <label>编码
              <select data-import-encoding>
                <option value="auto">自动识别</option>
                <option value="utf-8">UTF-8</option>
                <option value="utf-16le">UTF-16 LE</option>
                <option value="utf-16be">UTF-16 BE</option>
                <option value="gb18030">GB18030</option>
              </select>
            </label>
            <button class="quiet-button" type="button" data-preview-import>选择文件并预览</button>
            <label>新卷标题<input data-import-volume-title value="导入稿" maxlength="240" /></label>
            <button class="primary-button" type="button" data-commit-import disabled>确认导入</button>
          </div>
          <div class="text-io-plan" data-import-plan-list></div>
        </section>
        <section class="text-io-section">
          <header><h3>从Version导出</h3><span>只导出明确选择的不可变Version</span></header>
          <div class="text-io-controls">
            <label>格式<select data-export-format><option value="txt">TXT</option><option value="markdown">Markdown</option></select></label>
            <label>文件名<input data-export-file-name value="WorldForge-稳定稿" maxlength="240" /></label>
            <button class="quiet-button" type="button" data-refresh-export-versions>刷新Version</button>
            <button class="primary-button" type="button" data-export-versions>导出所选</button>
          </div>
          <div class="text-io-export-list" data-export-version-list></div>
        </section>
      </div>
      <footer><button class="quiet-button" type="button" data-close-text-io>关闭</button></footer>
    </dialog>

    <dialog class="boundary-dialog" data-boundary-dialog aria-labelledby="boundary-dialog-title">
''',
)

# renderer TS imports, elements, state and implementation
patch(
    'apps/desktop/renderer/src/index.ts',
    "} from '@worldforge/editor-core';\n",
    "} from '@worldforge/editor-core';\nimport type { ImportPlan, ImportPlanChapter, ExportVersionChoice } from '@worldforge/contracts';\n",
)
patch(
    'apps/desktop/renderer/src/index.ts',
    "const moveProjectButton = document.querySelector<HTMLButtonElement>('[data-move-project]');\n",
    "const moveProjectButton = document.querySelector<HTMLButtonElement>('[data-move-project]');\nconst openTextIoButton = document.querySelector<HTMLButtonElement>('[data-open-text-io]');\nconst textIoDialog = document.querySelector<HTMLDialogElement>('[data-text-io-dialog]');\nconst textIoStatus = document.querySelector<HTMLElement>('[data-text-io-status]');\nconst importEncoding = document.querySelector<HTMLSelectElement>('[data-import-encoding]');\nconst previewImportButton = document.querySelector<HTMLButtonElement>('[data-preview-import]');\nconst commitImportButton = document.querySelector<HTMLButtonElement>('[data-commit-import]');\nconst importVolumeTitle = document.querySelector<HTMLInputElement>('[data-import-volume-title]');\nconst importPlanList = document.querySelector<HTMLElement>('[data-import-plan-list]');\nconst refreshExportVersionsButton = document.querySelector<HTMLButtonElement>('[data-refresh-export-versions]');\nconst exportVersionList = document.querySelector<HTMLElement>('[data-export-version-list]');\nconst exportFormat = document.querySelector<HTMLSelectElement>('[data-export-format]');\nconst exportFileName = document.querySelector<HTMLInputElement>('[data-export-file-name]');\nconst exportVersionsButton = document.querySelector<HTMLButtonElement>('[data-export-versions]');\nconst closeTextIoButton = document.querySelector<HTMLButtonElement>('[data-close-text-io]');\n",
)
patch(
    'apps/desktop/renderer/src/index.ts',
    'let currentFindIndex = -1;\n',
    'let currentFindIndex = -1;\nlet activeImportPlan: ImportPlan | null = null;\nlet exportVersionChoices: ExportVersionChoice[] = [];\n',
)
append(
    'apps/desktop/renderer/src/index.ts',
    r'''
function setTextIoStatus(message: string, error = false): void {
  if (!textIoStatus) return;
  textIoStatus.textContent = message;
  textIoStatus.classList.toggle('is-error', error);
}

function planBody(chapter: ImportPlanChapter): string {
  return chapter.blocks
    .map((block) => (block.blockType === 'separator' ? '***' : block.text))
    .join('\n\n');
}

function bodyBlocks(value: string): ImportPlanChapter['blocks'] {
  const blocks = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split(/\n\s*\n/gu)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) =>
      text === '***'
        ? ({ blockType: 'separator', text: '' } as const)
        : ({ blockType: 'paragraph', text } as const),
    );
  return blocks.length ? blocks : [{ blockType: 'paragraph', text: '' }];
}

function renderImportPlan(): void {
  if (!importPlanList) return;
  importPlanList.replaceChildren();
  const plan = activeImportPlan;
  if (!plan) {
    importPlanList.textContent = '请选择TXT或Markdown文件生成预览。';
    if (commitImportButton) commitImportButton.disabled = true;
    return;
  }
  plan.chapters.forEach((chapter, index) => {
    const row = document.createElement('article');
    row.className = 'text-io-plan-row';
    row.dataset.importPlanChapter = chapter.planChapterId;
    row.innerHTML = `<header><strong>章节 ${index + 1}</strong><div></div></header><input data-import-chapter-title maxlength="240" /><textarea data-import-chapter-body rows="6"></textarea>`;
    const title = row.querySelector<HTMLInputElement>('[data-import-chapter-title]')!;
    const body = row.querySelector<HTMLTextAreaElement>('[data-import-chapter-body]')!;
    title.value = chapter.title;
    body.value = planBody(chapter);
    const actions = row.querySelector<HTMLElement>('header div')!;
    for (const [label, action] of [
      ['上移', 'up'],
      ['下移', 'down'],
      ['拆分', 'split'],
      ['合并下一章', 'merge'],
      ['移除', 'remove'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet-button';
      button.textContent = label;
      button.dataset.importPlanAction = action;
      button.dataset.importPlanChapterId = chapter.planChapterId;
      button.disabled =
        (action === 'up' && index === 0) ||
        ((action === 'down' || action === 'merge') && index === plan.chapters.length - 1) ||
        (action === 'remove' && plan.chapters.length === 1);
      actions.append(button);
    }
    importPlanList.append(row);
  });
  if (commitImportButton) commitImportButton.disabled = activeProject?.databaseMode !== 'read-write';
}

function chaptersFromPlanEditor(): ImportPlanChapter[] {
  const plan = activeImportPlan;
  if (!plan || !importPlanList) return [];
  return plan.chapters.map((chapter) => {
    const row = importPlanList.querySelector<HTMLElement>(
      `[data-import-plan-chapter="${chapter.planChapterId}"]`,
    );
    const title = row?.querySelector<HTMLInputElement>('[data-import-chapter-title]')?.value.trim();
    const body = row?.querySelector<HTMLTextAreaElement>('[data-import-chapter-body]')?.value ?? '';
    return {
      planChapterId: chapter.planChapterId,
      title: title || chapter.title,
      blocks: body === planBody(chapter) ? chapter.blocks : bodyBlocks(body),
    };
  });
}

function updatePlanFromEditor(): void {
  if (!activeImportPlan) return;
  activeImportPlan = { ...activeImportPlan, chapters: chaptersFromPlanEditor() };
}

async function refreshExportCatalog(): Promise<void> {
  const project = activeProject;
  if (!project || !exportVersionList) return;
  const result = await window.worldforge.textIo.listExportVersions(project.projectId);
  exportVersionList.replaceChildren();
  if (!result.ok) {
    setTextIoStatus(`Version读取失败 · ${result.error.code}`, true);
    return;
  }
  exportVersionChoices = result.data.versions;
  if (!exportVersionChoices.length) {
    exportVersionList.textContent = '当前项目没有可导出的Version。';
    return;
  }
  for (const version of exportVersionChoices) {
    const label = document.createElement('label');
    label.className = 'text-io-export-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = version.versionId;
    checkbox.dataset.exportVersionChoice = '';
    checkbox.checked = version.finalized;
    const detail = document.createElement('span');
    detail.textContent = `${version.volumeTitle} / ${version.chapterTitle} · ${version.versionTitle} · ${version.wordCount}字${version.finalized ? ' · 定稿' : ''}`;
    label.append(checkbox, detail);
    exportVersionList.append(label);
  }
}

openTextIoButton?.addEventListener('click', () => {
  textIoDialog?.showModal();
  setTextIoStatus('预览不会修改项目；确认导入前会创建已验证恢复点。');
  renderImportPlan();
  void refreshExportCatalog();
});
closeTextIoButton?.addEventListener('click', () => textIoDialog?.close());
previewImportButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project) return;
    previewImportButton.disabled = true;
    setTextIoStatus('请选择TXT或Markdown文件…');
    const encoding = importEncoding?.value ?? 'auto';
    const result = await window.worldforge.textIo.previewImport({
      projectId: project.projectId,
      encoding: encoding as 'auto' | 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030',
    });
    previewImportButton.disabled = false;
    if (!result.ok) {
      if (result.error.code === 'COMMON_CANCELLED_004') return setTextIoStatus('已取消选择。');
      return setTextIoStatus(`预览失败 · ${result.error.code}`, true);
    }
    activeImportPlan = result.data;
    if (importVolumeTitle && importVolumeTitle.value === '导入稿') {
      importVolumeTitle.value = result.data.fileName.replace(/\.(?:txt|md|markdown)$/iu, '');
    }
    setTextIoStatus(
      `已识别 ${result.data.format.toUpperCase()} · ${result.data.detectedEncoding} · ${result.data.confidence} · ${result.data.chapters.length}章`,
    );
    renderImportPlan();
  })();
});

importPlanList?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-import-plan-action]');
  const action = button?.dataset.importPlanAction;
  const id = button?.dataset.importPlanChapterId;
  if (!activeImportPlan || !action || !id) return;
  updatePlanFromEditor();
  const chapters = [...activeImportPlan.chapters];
  const index = chapters.findIndex((chapter) => chapter.planChapterId === id);
  if (index < 0) return;
  if (action === 'up' && index > 0) [chapters[index - 1], chapters[index]] = [chapters[index]!, chapters[index - 1]!];
  if (action === 'down' && index < chapters.length - 1) [chapters[index + 1], chapters[index]] = [chapters[index]!, chapters[index + 1]!];
  if (action === 'remove' && chapters.length > 1) chapters.splice(index, 1);
  if (action === 'merge' && index < chapters.length - 1) {
    const current = chapters[index]!;
    const next = chapters[index + 1]!;
    chapters.splice(index, 2, { ...current, blocks: [...current.blocks, ...next.blocks] });
  }
  if (action === 'split') {
    const current = chapters[index]!;
    const midpoint = Math.max(1, Math.floor(current.blocks.length / 2));
    let left = current.blocks.slice(0, midpoint);
    let right = current.blocks.slice(midpoint);
    if (!right.length) {
      const block = left[0]!;
      const text = block.text;
      const point = Math.max(1, Math.floor(text.length / 2));
      left = [{ ...block, text: text.slice(0, point) }];
      right = [{ ...block, text: text.slice(point) }];
    }
    chapters.splice(
      index,
      1,
      { ...current, blocks: left },
      {
        planChapterId: crypto.randomUUID(),
        title: `${current.title}（下）`,
        blocks: right,
      },
    );
  }
  activeImportPlan = { ...activeImportPlan, chapters };
  renderImportPlan();
});

commitImportButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project || !activeImportPlan || project.databaseMode !== 'read-write') return;
    updatePlanFromEditor();
    const volumeTitle = importVolumeTitle?.value.trim() ?? '';
    if (!volumeTitle) return setTextIoStatus('请输入新卷标题。', true);
    commitImportButton.disabled = true;
    setTextIoStatus('正在创建恢复点并以单事务导入…');
    const result = await window.worldforge.textIo.commitImport({
      projectId: project.projectId,
      planId: activeImportPlan.planId,
      volumeTitle,
      chapters: activeImportPlan.chapters,
    });
    commitImportButton.disabled = false;
    if (!result.ok) return setTextIoStatus(`导入失败 · ${result.error.code}`, true);
    setTextIoStatus(`已导入 ${result.data.importedChapterCount} 章；恢复点与导入基线Version已创建。`);
    activeImportPlan = null;
    renderImportPlan();
    await refreshProjectStructure();
    await refreshExportCatalog();
  })();
});

refreshExportVersionsButton?.addEventListener('click', () => void refreshExportCatalog());
exportVersionsButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project || !exportVersionList) return;
    const versionIds = Array.from(
      exportVersionList.querySelectorAll<HTMLInputElement>('[data-export-version-choice]:checked'),
      (input) => input.value,
    );
    if (!versionIds.length) return setTextIoStatus('请至少选择一个Version。', true);
    const format = exportFormat?.value === 'markdown' ? 'markdown' : 'txt';
    const fileName = exportFileName?.value.trim() ?? '';
    if (!fileName) return setTextIoStatus('请输入导出文件名。', true);
    exportVersionsButton.disabled = true;
    const result = await window.worldforge.textIo.exportVersions({
      projectId: project.projectId,
      versionIds,
      format,
      fileName,
    });
    exportVersionsButton.disabled = false;
    if (!result.ok) {
      if (result.error.code === 'COMMON_CANCELLED_004') return setTextIoStatus('已取消导出。');
      return setTextIoStatus(`导出失败 · ${result.error.code}`, true);
    }
    setTextIoStatus(`已原子导出 ${result.data.fileName} · ${result.data.sha256.slice(0, 12)}…`);
  })();
});
''',
)

append(
    'apps/desktop/renderer/src/styles.css',
    r'''
.text-io-dialog { width: min(1040px, calc(100vw - 32px)); }
.text-io-dialog__body { max-height: min(760px, calc(100vh - 120px)); overflow: auto; }
.text-io-section { display: grid; gap: 12px; margin-top: 18px; padding: 16px; border: 1px solid var(--border-color, #d8d4cc); border-radius: 12px; }
.text-io-section > header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
.text-io-section h3 { margin: 0; }
.text-io-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
.text-io-controls label { display: grid; gap: 4px; min-width: 150px; }
.text-io-plan, .text-io-export-list { display: grid; gap: 10px; }
.text-io-plan-row { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border-color, #d8d4cc); border-radius: 10px; }
.text-io-plan-row header { display: flex; justify-content: space-between; gap: 8px; }
.text-io-plan-row header div { display: flex; flex-wrap: wrap; gap: 6px; }
.text-io-plan-row textarea { width: 100%; resize: vertical; }
.text-io-export-row { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border: 1px solid var(--border-color, #d8d4cc); border-radius: 8px; }
''',
)

print('M1-09 integration patches applied')
