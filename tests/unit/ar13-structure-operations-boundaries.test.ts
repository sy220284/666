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

  it('keeps cohesive modules without restoring a file-length gate', async () => {
    const [sources, governance] = await Promise.all([
      Promise.all(modules.map((file) => readFile(file, 'utf8'))),
      readFile('docs/architecture/CODE_QUALITY_GOVERNANCE.md', 'utf8'),
    ]);

    expect(sources.every((source) => source.trim().length > 0)).toBe(true);
    expect(governance).toContain('文件行数、函数数量和测试数量只用于观察');
    expect(governance).toContain('禁止为了满足视觉长度');
  });
});
