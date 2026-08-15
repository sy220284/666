import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/unit/journal-workbench-boundaries.test.ts';
let source = readFileSync(path, 'utf8');

function appendTest(marker, block) {
  if (source.includes(marker)) return;
  const close = source.lastIndexOf('\n});');
  if (close < 0) throw new Error('JournalWorkbench test suite closing marker not found.');
  source = source.slice(0, close) + block + source.slice(close);
}

appendTest(
  'covers missing Journal bridge fail-fast path',
  String.raw`

  it('covers missing Journal bridge fail-fast path', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      worldforgeJournal: undefined,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    });
    await expect(renderWorkbench(createBridge({ providers: [] }).bridge)).rejects.toThrow();
  });`,
);

appendTest(
  'keeps the current Journal page when loading older logs fails',
  String.raw`

  it('keeps the current Journal page when loading older logs fails', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const firstCatalog = contractInput<JournalCatalog>({
      ...catalog(),
      nextCursor: { periodEnd, id: entryId },
    });
    const list = vi.fn().mockResolvedValue({
      ok: false,
      error: { message: '更早日志读取失败。' },
    });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      list,
      generate: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
    });
    const renderer = await renderWorkbench(createBridge({ providers: [] }).bridge);
    const entries = () =>
      renderer.root.findAll(
        (node) => node.type === 'li' && node.props.className === 'journal-entry',
      );
    expect(entries()).toHaveLength(1);
    await act(async () => {
      invoke(buttonContaining(renderer.root, '加载更早日志'), 'onClick');
      await flushPromises();
    });
    expect(list).toHaveBeenCalledWith({
      projectId,
      limit: 30,
      before: { periodEnd, id: entryId },
    });
    expect(entries()).toHaveLength(1);
    await act(async () => renderer.unmount());
  });`,
);

writeFileSync(path, source);
