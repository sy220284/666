import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourcePath = path.join(
  process.cwd(),
  'apps/desktop/renderer/src/features/checks/search-panel.tsx',
);

describe('全文搜索面板异步通道', () => {
  it('为搜索、替换、作品词典和索引保留独立代次与等待状态', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain(
      "type SearchPanelRequestLane = 'search' | 'replace' | 'dictionary' | 'index';",
    );
    expect(source).toContain('new RequestGenerationGroup<SearchPanelRequestLane>()');
    expect(source).toContain("beginRequest('search')");
    expect(source).toContain("beginRequest('replace')");
    expect(source).toContain("beginRequest('dictionary')");
    expect(source).toContain("beginRequest('index')");
    expect(source).toContain('setSearchPending(false)');
    expect(source).toContain('setReplacePending(false)');
    expect(source).toContain('setDictionaryPending(false)');
    expect(source).toContain('setIndexPending(false)');
    expect(source).toContain('requests.current.invalidateAll()');
  });

  it('作品词典等待状态不参与搜索与替换工具区互斥', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain(
      'const searchToolsPending = searchPending || replacePending || indexPending;',
    );
    expect(source).not.toContain(
      'searchPending || replacePending || dictionaryPending || indexPending',
    );
    expect(source).toContain('disabled={dictionaryPending || readOnly}');
  });
});
