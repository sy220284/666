import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const searchRoot = 'packages/core-service/src/search';

async function source(file: string): Promise<string> {
  return readFile(`${searchRoot}/${file}`, 'utf8');
}

describe('AR-13 Search boundaries', () => {
  it('keeps the public entry as a compatibility re-export', async () => {
    const root = await readFile('packages/core-service/src/search-tools.ts', 'utf8');

    expect(root).toContain('./search/search-model.js');
    expect(root).toContain('./search/search-tools-service.js');
    expect(root).not.toContain('class SearchToolsService');
  });

  it('separates index, dictionary, preview and apply responsibilities', async () => {
    const [service, index, dictionary, preview, apply] = await Promise.all([
      source('search-tools-service.ts'),
      source('search-index-operations.ts'),
      source('search-dictionary-operations.ts'),
      source('replace-preview.ts'),
      source('replace-apply.ts'),
    ]);

    expect(service).toContain('SearchIndexOperations');
    expect(service).toContain('SearchDictionaryOperations');
    expect(service).toContain('ReplacePreviewOperations');
    expect(service).toContain('ReplaceApplyOperations');
    expect(index).toContain('rebuild');
    expect(index).not.toContain('listDictionary');
    expect(dictionary).toContain('listDictionary');
    expect(dictionary).not.toContain('previewReplace');
    expect(preview).toContain('writeProject');
    expect(preview).toContain('INSERT INTO replace_plans');
    expect(apply).toContain('createOperationCheckpoint');
    expect(apply).toContain("status = 'stale'");
  });
});
