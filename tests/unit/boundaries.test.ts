import { describe, expect, it } from 'vitest';

import { validateImport } from '../../scripts/check-boundaries.mjs';

describe('module boundary policy', () => {
  it('allows Core to depend on contracts and domain', () => {
    expect(validateImport('@worldforge/core-service', '@worldforge/contracts')).toBeNull();
    expect(validateImport('@worldforge/core-service', '@worldforge/domain')).toBeNull();
  });

  it('blocks Renderer and Domain from privileged dependencies', () => {
    expect(validateImport('@worldforge/renderer', 'node:fs')).toContain('Node built-ins');
    expect(validateImport('@worldforge/domain', '@worldforge/core-service')).toContain(
      'may not import',
    );
  });
});
