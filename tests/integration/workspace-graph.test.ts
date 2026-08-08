import { describe, expect, it } from 'vitest';

import {
  discoverWorkspaceDirectories,
  inspectWorkspaces,
} from '../../scripts/check-workspaces.mjs';
import { foundationWorkspaceDirectories } from '../../scripts/package-foundation.mjs';

describe('workspace graph', () => {
  it('discovers every workspace from pnpm patterns and binds it to an architecture layer', async () => {
    const directories = await discoverWorkspaceDirectories();
    const packages = await inspectWorkspaces();
    expect(packages.map(({ directory }) => directory)).toEqual(directories);
    expect(packages).toHaveLength(10);
    expect(packages.every(({ policy }) => typeof policy.layer === 'string')).toBe(true);
    expect(packages.map(({ manifest }) => manifest.name)).toContain('@worldforge/core-service');
    expect(packages.map(({ manifest }) => manifest.name)).toContain('@worldforge/editor-core');
  });

  it('derives Foundation package entries from the buildable workspace registry', async () => {
    const packages = await inspectWorkspaces();
    const expected = packages
      .filter(({ policy }) => policy.buildable)
      .map(({ directory }) => directory)
      .sort((left, right) => left.localeCompare(right, 'en'));

    await expect(foundationWorkspaceDirectories()).resolves.toEqual(expected);
    expect(expected).not.toContain('apps/desktop');
    expect(expected).toContain('apps/desktop/renderer');
    expect(expected).toContain('packages/core-service');
  });
});
