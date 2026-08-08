import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = 'packages/core-service/src/search-index.ts';
const modules = [
  'packages/core-service/src/search-index/search-index-model.ts',
  'packages/core-service/src/search-index/search-index-writer.ts',
  'packages/core-service/src/search-index/search-index-query.ts',
  'packages/core-service/src/search-index/search-index-service.ts',
] as const;

describe('AR-13 Search Index boundaries', () => {
  it('keeps the public entry as a compatibility re-export', async () => {
    const source = await readFile(root, 'utf8');
    expect(source).toContain("export * from './search-index/search-index-model.js';");
    expect(source).toContain("export * from './search-index/search-index-service.js';");
  });

  it('separates model, writer, query and service responsibilities', async () => {
    const sources = await Promise.all(modules.map((file) => readFile(file, 'utf8')));
    expect(sources[0]).toContain('export class SearchIndexServiceError');
    expect(sources[1]).toContain('export function indexTarget');
    expect(sources[2]).toContain('export function authoritativeLike');
    expect(sources[3]).toContain('export class SearchIndexService');
  });
});
