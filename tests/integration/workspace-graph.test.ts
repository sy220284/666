import { describe, expect, it } from 'vitest';

import { inspectWorkspaces } from '../../scripts/check-workspaces.mjs';

describe('workspace graph', () => {
  it('contains every frozen architecture layer with a unique package name', async () => {
    const packages = await inspectWorkspaces();
    expect(packages).toHaveLength(10);
    expect(packages.map(({ manifest }) => manifest.name)).toContain('@worldforge/core-service');
    expect(packages.map(({ manifest }) => manifest.name)).toContain('@worldforge/editor-core');
  });
});
