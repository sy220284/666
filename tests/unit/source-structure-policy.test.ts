import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  detectCycles,
  resolveRelativeImport,
  validateFeatureDependency,
  validateLineBudget,
} from '../../scripts/check-source-structure.mjs';

const baseline = {
  defaultMaxLines: { ts: 1200, tsx: 800 },
  oversizedFiles: {
    'large.tsx': { maxLines: 1000, targetLines: 300, workPackage: 'AR-03' },
  },
  forbiddenFeatureEdges: ['writing>planning'],
  allowedFeatureImports: [
    {
      from: 'apps/desktop/renderer/src/features/writing/legacy.tsx',
      to: 'apps/desktop/renderer/src/features/planning/legacy.tsx',
      reason: 'AR-02',
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

  it('enforces default and registered line ceilings', () => {
    expect(validateLineBudget('small.ts', 1200, baseline)).toBeNull();
    expect(validateLineBudget('small.ts', 1201, baseline)).toContain('unregistered TS ceiling');
    expect(validateLineBudget('large.tsx', 1000, baseline)).toBeNull();
    expect(validateLineBudget('large.tsx', 1001, baseline)).toContain('AR-03 ceiling');
  });

  it('resolves ESM .js imports to TypeScript source files', () => {
    const importer = path.resolve('/repo/src/feature/entry.ts');
    const target = path.resolve('/repo/src/feature/helper.ts');
    expect(resolveRelativeImport(importer, './helper.js', new Set([importer, target]))).toBe(
      target,
    );
  });
});
