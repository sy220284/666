import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const sourceFile = new URL(
  '../../apps/desktop/renderer/src/features/writing/version-panel.tsx',
  import.meta.url,
);

describe('VersionPanel operation locking', () => {
  it('snapshots create form values before the exclusive command reaches autosave', async () => {
    const source = await readFile(sourceFile, 'utf8');
    const createStart = source.indexOf('const create = async');
    const previewStart = source.indexOf('const preview = async', createStart);
    const createSource = source.slice(createStart, previewStart);

    const snapshot = createSource.indexOf('const values = new FormData(form);');
    const exclusive = createSource.indexOf('await runVersionOperation');
    const flush = createSource.indexOf('await flush()');

    expect(snapshot).toBeGreaterThan(-1);
    expect(exclusive).toBeGreaterThan(snapshot);
    expect(flush).toBeGreaterThan(exclusive);
  });

  it('uses one reject-policy coordinator and acquires it before restore autosave', async () => {
    const source = await readFile(sourceFile, 'utf8');
    expect(source).toContain('rendererCommandCoordinatorFor(setPending)');
    expect(source).toContain("policy: 'reject'");

    const restoreStart = source.indexOf('const restore = async');
    const exportStart = source.indexOf('const exportVersion = async', restoreStart);
    const restoreSource = source.slice(restoreStart, exportStart);
    const exclusive = restoreSource.indexOf('await runVersionOperation');
    const flush = restoreSource.indexOf('await flush()');

    expect(exclusive).toBeGreaterThan(-1);
    expect(flush).toBeGreaterThan(exclusive);
  });
});
