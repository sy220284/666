import { describe, expect, it } from 'vitest';

import { validateImport } from '../../scripts/check-boundaries.mjs';
import { loadWorkspaceArchitecture } from '../../scripts/check-workspaces.mjs';

describe('module boundary policy', () => {
  it('allows Core to depend on contracts, domain and prompts', async () => {
    const architecture = await loadWorkspaceArchitecture();
    const policy = architecture['packages/core-service'];
    expect(validateImport('@worldforge/core-service', '@worldforge/contracts', policy)).toBeNull();
    expect(validateImport('@worldforge/core-service', '@worldforge/domain', policy)).toBeNull();
    expect(validateImport('@worldforge/core-service', '@worldforge/prompts', policy)).toBeNull();
  });

  it('blocks Renderer and Domain from privileged dependencies', async () => {
    const architecture = await loadWorkspaceArchitecture();
    expect(
      validateImport('@worldforge/renderer', 'node:fs', architecture['apps/desktop/renderer']),
    ).toContain('Node built-ins');
    expect(
      validateImport(
        '@worldforge/domain',
        '@worldforge/core-service',
        architecture['packages/domain'],
      ),
    ).toContain('may not import');
  });
});
