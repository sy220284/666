import { readFileSync, writeFileSync } from 'node:fs';

const testPath = 'tests/unit/journal-workbench-boundaries.test.ts';
let source = readFileSync(testPath, 'utf8');
const marker = 'covers reload failures, pagination and AI lifecycle fallbacks';
if (!source.includes(marker)) {
  const block = String.raw`

  it('covers reload failures, pagination and AI lifecycle fallbacks', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const baseCatalog = catalog();
    const quietBridge = createBridge({ providers: [] }).bridge;

    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list: vi.fn().mockResolvedValue({ ok: false, error: { message: '回读失败。' } }),
    });
    let renderer = await renderWorkbench(quietBridge);
    expect(textContent(renderer.root)).toContain('创作日志读取失败：回读失败。');
    await act(async () => renderer.unmount());

    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list: vi.fn().mockRejectedValue('非 Error 读取失败'),
    });
    renderer = await renderWorkbench(quietBridge);
    expect(textContent(renderer.root)).toContain('创作日志读取失败。');
    await act(async () => renderer.unmount());

    const olderEntryId = '55555555-5555-4555-8555-555555555555';
    const firstCatalog = contractInput<JournalCatalog>({
      ...baseCatalog,
      entries: [{ ...entry(), aiSummary: '已有智能复盘' }],
      nextCursor: { periodEnd, id: entryId },
    });
    const olderCatalog = contractInput<JournalCatalog>({
      ...baseCatalog,
      entries: [{ ...entry(), id: olderEntryId, authorNote: null, aiSummary: null }],
      nextCursor: null,
    });
    const list = vi.fn().mockResolvedValue({ ok: true, data: olderCatalog });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      list,
      generate: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
    });
    renderer = await renderWorkbench(createBridge().bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    expect(textContent(renderer.root)).toContain('已有智能复盘');
    await act(async () => {
      invoke(buttonContaining(renderer.root, '加载更早日志'), 'onClick');
      await flushPromises();
    });
    expect(list).toHaveBeenCalledWith({
      projectId,
      limit: 30,
      before: { periodEnd, id: entryId },
    });
    expect(
      renderer.root.findAll(
        (node) => node.type === 'li' && node.props.className === 'journal-entry',
      ),
    ).toHaveLength(2);
    await act(async () => renderer.unmount());

    const markAiFailed = vi.fn().mockResolvedValue({
      ok: false,
      error: { message: '失败状态回写未完成。' },
    });
    const failureCatalog = catalog();
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      generate: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      markAiFailed,
    });
    const failedStart = vi.fn().mockResolvedValue({
      state: 'failure',
      error: { code: 'AI_CONNECTION_FAILED_003', message: '连接失败。' },
    });
    renderer = await renderWorkbench(createBridge({ start: failedStart }).bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    await act(async () => {
      invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(markAiFailed).toHaveBeenCalledWith({
      projectId,
      entryId,
      generationRunId: null,
    });
    expect(textContent(renderer.root)).toContain('智能复盘未启动');
    await act(async () => renderer.unmount());

    const timers = [];
    const runningCatalog = catalog();
    installWindow(
      {
        catchUp: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        list: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        generate: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        updateNote: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
      },
      timers,
    );
    const getRun = vi.fn().mockResolvedValue({
      state: 'success',
      data: { runId, projectId, status: 'running' },
    });
    renderer = await renderWorkbench(createBridge({ getRun }).bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    await act(async () => {
      invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(timers.length).toBeGreaterThan(0);
    const latePoll = timers.at(-1);
    await act(async () => renderer.unmount());
    await act(async () => {
      latePoll?.();
      await flushPromises();
    });
    expect(getRun).toHaveBeenCalled();
  });`;
  const close = source.lastIndexOf('\n});');
  if (close < 0) throw new Error('JournalWorkbench test suite closing marker not found.');
  source = source.slice(0, close) + block + source.slice(close);
  writeFileSync(testPath, source);
}

const manifestPath = 'tests/e2e/visual-baselines/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.source = {
  verifiedHead: '60748382fc50dd0d78c4b3103dee3e30771cf4eb',
  qualityRunId: 31884427843,
  artifactId: 9247141115,
  artifactDigest: 'sha256:0f9020f2765db3a29723ac92a4cf48f9e51a211375e05ebb0aa73a10b46aeb52',
};
manifest.stabilityWitness = {
  verifiedHead: 'b0d24b0a58a74aa6e209b83ce40fe965287b469e',
  qualityRunId: 31887999518,
  artifactId: 9248002461,
  artifactDigest: 'sha256:d9c0295c485871c4d89c7bd22b5d1529451e911de44d58e5e3632088e63c43eb',
};
const hashes = new Map([
  ['theme-a-light-2560x1440.png', 'e5a91d82de2f03f9a2e49e44e8b25795be723c316b194f7069ac0487d62ba589'],
  ['theme-a-dark-2560x1440.png', 'e777dd420703b2ce0e7073f23ea1038852698b47fe109218c938823cb4071ef5'],
  ['theme-b-light-2560x1440.png', '06904fbbb6eae1e649ad2f6f6f01d0ae2a1e06c2841de70a75ed439edccf3b4f'],
  ['theme-b-dark-2560x1440.png', '82376598c5258bca976a6e25ed092d5d0e02f07ef5f3e5d6faa98043fa985d10'],
]);
for (const baseline of manifest.baselines) {
  const sha256 = hashes.get(baseline.snapshotName);
  if (!sha256) throw new Error(`Unexpected baseline: ${baseline.snapshotName}`);
  baseline.sha256 = sha256;
  baseline.width = 2560;
  baseline.height = 1440;
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
