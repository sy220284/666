import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ReferenceAwareStructureOperationService } from '../../packages/core-service/src/reference-aware-structure-operations.js';
import { StructureOperationService } from '../../packages/core-service/src/structure-operations.js';

const compatibilitySource = readFileSync(
  'packages/core-service/src/reference-aware-structure-operations.ts',
  'utf8',
);
describe('M10-13 结构永久删除单一业务引擎', () => {
  it('兼容入口只保留类型名称与依赖注入，不再实现删除业务', () => {
    expect(compatibilitySource).toContain('extends StructureOperationService');
    expect(compatibilitySource).not.toContain('SELECT ');
    expect(compatibilitySource).not.toContain('trashTarget');
    expect(compatibilitySource).not.toContain('deleteImpact');
  });

  it('兼容类型在运行时复用统一结构服务的预览、校验与执行接口', () => {
    expect(ReferenceAwareStructureOperationService.prototype).toBeInstanceOf(
      StructureOperationService,
    );
    for (const method of [
      'previewPermanentDelete',
      'assertPermanentDeleteExecutable',
      'permanentDelete',
    ] as const) {
      expect(typeof StructureOperationService.prototype[method]).toBe('function');
      expect(Object.hasOwn(ReferenceAwareStructureOperationService.prototype, method)).toBe(false);
    }
  });
});
