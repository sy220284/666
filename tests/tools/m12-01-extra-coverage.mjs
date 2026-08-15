import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/unit/journal-workbench-boundaries.test.ts';
let source = readFileSync(path, 'utf8');
const marker = 'covers missing Journal bridge fail-fast path';
if (!source.includes(marker)) {
  const block = String.raw`

  it('covers missing Journal bridge fail-fast path', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      worldforgeJournal: undefined,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    });
    await expect(renderWorkbench(createBridge({ providers: [] }).bridge)).rejects.toThrow();
  });`;
  const close = source.lastIndexOf('\n});');
  if (close < 0) throw new Error('JournalWorkbench test suite closing marker not found.');
  source = source.slice(0, close) + block + source.slice(close);
  writeFileSync(path, source);
}
