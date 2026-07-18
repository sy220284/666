import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('M2-03 Apply chain output', () => {
  it('emits exact protocol, Utility and Main registration changes', async () => {
    const projectPath = 'packages/contracts/src/project-workspace.ts';
    let project = await readFile(projectPath, 'utf8');
    project = replaceOnce(
      project,
      "} from './candidate-preview-core.js';\n",
      "} from './candidate-preview-core.js';\nimport {\n  CoreCandidateApplyOperationSchema,\n  CoreCandidateApplyResultSchema,\n} from './candidate-apply-core.js';\n",
    );
    project = replaceOnce(
      project,
      '  CoreCandidatePreviewOperationSchema,\n  CoreVersionOperationSchema,',
      '  CoreCandidatePreviewOperationSchema,\n  CoreCandidateApplyOperationSchema,\n  CoreVersionOperationSchema,',
    );
    project = replaceOnce(
      project,
      '  CoreCandidatePreviewResultSchema,\n  CoreVersionResultSchema,',
      '  CoreCandidatePreviewResultSchema,\n  CoreCandidateApplyResultSchema,\n  CoreVersionResultSchema,',
    );
    project = replaceOnce(
      project,
      "export * from './candidate-preview-core.js';\n",
      "export * from './candidate-preview-core.js';\nexport * from './candidate-apply-core.js';\n",
    );

    const utilityPath = 'packages/core-service/src/utility-entry.ts';
    let utility = await readFile(utilityPath, 'utf8');
    utility = replaceOnce(
      utility,
      `      case CANDIDATE_APPLY_COMMANDS.previewCandidate:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: candidateApply.preview(operation.input),\n        });\n`,
      `      case CANDIDATE_APPLY_COMMANDS.previewCandidate:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: candidateApply.preview(operation.input),\n        });\n      case CANDIDATE_APPLY_COMMANDS.applyCandidate:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await candidateApply.apply(requestId, operation.input),\n        });\n`,
    );

    const mainPath = 'apps/desktop/main/src/electron-main.ts';
    let main = await readFile(mainPath, 'utf8');
    main = replaceOnce(
      main,
      "import { registerCandidatePreviewIpc } from './candidate-preview-ipc.js';\n",
      "import { registerCandidateApplyIpc } from './candidate-apply-ipc.js';\nimport { registerCandidatePreviewIpc } from './candidate-preview-ipc.js';\n",
    );
    main = replaceOnce(
      main,
      `  const unregisterPreviewIpc = registerCandidatePreviewIpc({\n    ipcMain,\n    supervisor,\n    rendererUrl,\n  });\n  unregisterIpc = () => {\n    unregisterPreviewIpc();\n    unregisterBaseIpc();\n  };\n`,
      `  const unregisterPreviewIpc = registerCandidatePreviewIpc({\n    ipcMain,\n    supervisor,\n    rendererUrl,\n  });\n  const unregisterApplyIpc = registerCandidateApplyIpc({\n    ipcMain,\n    supervisor,\n    rendererUrl,\n  });\n  unregisterIpc = () => {\n    unregisterApplyIpc();\n    unregisterPreviewIpc();\n    unregisterBaseIpc();\n  };\n`,
    );

    console.log(`M203_APPLY_PROJECT_BASE64=${Buffer.from(project).toString('base64')}`);
    console.log(`M203_APPLY_UTILITY_BASE64=${Buffer.from(utility).toString('base64')}`);
    console.log(`M203_APPLY_MAIN_BASE64=${Buffer.from(main).toString('base64')}`);
  });
});
