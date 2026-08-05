import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  detectCycles,
  resolveRelativeImport,
  sourceObservation,
  validateFeatureDependency,
} from '../../scripts/check-source-structure.mjs';

const baseline = {
  schemaVersion: 2,
  forbiddenFeatureEdges: ['writing>planning'],
  allowedFeatureImports: [
    {
      from: 'apps/desktop/renderer/src/features/writing/legacy.tsx',
      to: 'apps/desktop/renderer/src/features/planning/legacy.tsx',
      reason: 'historical exception',
    },
  ],
  allowedCycles: [],
};

describe('source structure policy', () => {
  it('detects a complete circular dependency path', () => {
    const graph = new Map([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
      ['c.ts', new Set(['a.ts'])],
    ]);

    expect(detectCycles(graph)).toEqual([['a.ts', 'b.ts', 'c.ts', 'a.ts']]);
  });

  it('allows the frozen historical feature edge but rejects a new one', () => {
    expect(
      validateFeatureDependency(
        'apps/desktop/renderer/src/features/writing/legacy.tsx',
        'apps/desktop/renderer/src/features/planning/legacy.tsx',
        baseline,
      ),
    ).toBeNull();

    expect(
      validateFeatureDependency(
        'apps/desktop/renderer/src/features/writing/new-panel.tsx',
        'apps/desktop/renderer/src/features/planning/new-panel.tsx',
        baseline,
      ),
    ).toContain('may not depend on planning');
  });

  it('reports file scale without treating it as a violation', () => {
    const source = `${'const value = 1;\n'.repeat(1_500)}export const result = value;\n`;

    expect(sourceObservation('large-feature.ts', source, 4)).toEqual({
      file: 'large-feature.ts',
      lines: 1_502,
      exports: 1,
      dependencies: 4,
    });
  });

  it('resolves ESM .js imports to TypeScript source files', () => {
    const importer = path.resolve('/repo/src/feature/entry.ts');
    const target = path.resolve('/repo/src/feature/helper.ts');
    expect(resolveRelativeImport(importer, './helper.js', new Set([importer, target]))).toBe(
      target,
    );
  });
});
