import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const coreRoot = 'packages/core-service/src';

async function source(file: string): Promise<string> {
  return readFile(`${coreRoot}/${file}`, 'utf8');
}

describe('AR-13 Core控制与工具服务边界', () => {
  it('keeps the control root limited to validation and domain dispatch', async () => {
    const root = await source('utility-control-router.ts');

    expect(root).toContain('./utility-control-context.js');
    expect(root).toContain('./utility-control-lifecycle.js');
    expect(root).toContain('./utility-control-operations.js');
    expect(root).not.toContain('CoreAppDataResultSchema');
    expect(root).not.toContain('PROJECT_WORKSPACE_COMMANDS');
    expect(root).not.toContain('windowPreferencesError');
  });

  it('separates lifecycle messages from domain operation routing', async () => {
    const [lifecycle, operations] = await Promise.all([
      source('utility-control-lifecycle.ts'),
      source('utility-control-operations.ts'),
    ]);

    for (const message of [
      'core.attach-task-port',
      'core.window-preferences.get',
      'core.drain',
      'core.shutdown',
    ]) {
      expect(lifecycle).toContain(message);
      expect(operations).not.toContain(message);
    }
    for (const router of [
      'executeAppDataOperation',
      'executeProviderOperation',
      'executeGenerationOperation',
      'executeProjectOperation',
    ]) {
      expect(operations).toContain(router);
      expect(lifecycle).not.toContain(router);
    }
  });

  it('composes generation and project service groups through dedicated factories', async () => {
    const [root, generation, project] = await Promise.all([
      source('utility-service-container.ts'),
      source('utility-generation-service-container.ts'),
      source('utility-project-service-container.ts'),
    ]);

    expect(root).toContain('createUtilityGenerationServiceContainer');
    expect(root).toContain('createUtilityProjectServiceContainer');
    expect(root).not.toContain('new GenerationRunService');
    expect(root).not.toContain('new SearchToolsService');
    expect(generation).toContain('new GenerationRunService');
    expect(generation).toContain('new GenerationRuntime');
    expect(generation).toContain('new StateProposalService');
    expect(project).toContain('new SearchToolsService');
    expect(project).toContain('new ReferenceAwareStructureOperationService');
    expect(project).toContain('new CoordinatedImportExportService');
  });
});
