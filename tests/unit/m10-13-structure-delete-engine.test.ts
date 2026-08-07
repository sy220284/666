import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const compatibilitySource = readFileSync(
  'packages/core-service/src/reference-aware-structure-operations.ts',
  'utf8',
);
const engineSource = readFileSync(
  'packages/core-service/src/structure-operations/structure-trash-operation-service.ts',
  'utf8',
);

describe('M10-13 结构永久删除单一业务引擎', () => {
  it('兼容入口只保留类型名称与依赖注入，不再实现删除业务', () => {
    expect(compatibilitySource).toContain('extends StructureOperationService');
    expect(compatibilitySource).not.toContain('SELECT ');
    expect(compatibilitySource).not.toContain('trashTarget');
    expect(compatibilitySource).not.toContain('deleteImpact');
  });

  it('统一引擎同时拥有影响计算、引用阻断、预览校验和执行', () => {
    expect(engineSource).toContain('function trashTarget');
    expect(engineSource).toContain('function deleteImpact');
    expect(engineSource).toContain('function chapterReferenceBlockers');
    expect(engineSource).toContain('function previewWithDatabase');
    expect(engineSource).toContain('permanentDelete(');
  });
});
