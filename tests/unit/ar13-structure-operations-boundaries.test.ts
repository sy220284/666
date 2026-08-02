import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = 'packages/core-service/src/structure-operations.ts';
const modules = [
  'packages/core-service/src/structure-operations/structure-operation-model.ts',
  'packages/core-service/src/structure-operations/structure-operation-preview-service.ts',
  'packages/core-service/src/structure-operations/structure-operation-execution-service.ts',
  'packages/core-service/src/structure-operations/structure-trash-operation-service.ts',
  'packages/core-service/src/structure-operations/structure-operation-service.ts',
] as const;

function lines(source: string): number {
  return source.trimEnd().split(/\r?\n/u).length;
}

describe('AR-13 Structure Operations boundaries', () => {
  it('keeps the public entry as a compatibility facade', async () => {
    const source = await readFile(root, 'utf8');
    expect(source).toContain('./structure-operations/structure-operation-service.js');
    expect(source).toContain('./structure-operations/structure-operation-model.js');
    expect(source).not.toContain('class StructureOperationService');
    expect(lines(source)).toBeLessThanOrEqual(5);
  });

  it('separates preview, execution and permanent-delete transactions', async () => {
    const [model, preview, execution, trash, service] = await Promise.all(
      modules.map((file) => readFile(file, 'utf8')),
    );

    expect(model).toContain('export interface StructureOperationServiceOptions');
    expect(preview).toContain('export class StructureOperationPreviewService');
    expect(preview).toContain('previewSplit');
    expect(preview).not.toContain('permanentDelete(');
    expect(execution).toContain('export class StructureOperationExecutionService');
    expect(execution).toContain('executeSplit');
    expect(execution).toContain('#previewSplitInTransaction');
    expect(trash).toContain('export class StructureTrashOperationService');
    expect(trash).toContain('previewPermanentDelete');
    expect(trash).toContain('permanentDelete(');
    expect(service).toContain('StructureOperationPreviewService');
    expect(service).toContain('StructureOperationExecutionService');
    expect(service).toContain('StructureTrashOperationService');
  });

  it('keeps each module within the frozen AR-13 budget', async () => {
    const budgets = [240, 320, 400, 300, 150] as const;
    const sources = await Promise.all(modules.map((file) => readFile(file, 'utf8')));
    sources.forEach((source, index) => expect(lines(source)).toBeLessThanOrEqual(budgets[index]));
  });
});
