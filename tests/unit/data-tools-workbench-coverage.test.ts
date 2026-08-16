import { createRequire } from 'node:module';

import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { DataToolsWorkbench } from '../../apps/desktop/renderer/src/features/data-tools/data-tools-workbench.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestInstance {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly (TestInstance | string)[];
  findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
}
interface TestRenderer {
  readonly root: TestInstance;
  update(element: ReactElement): void;
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const backupA = '22222222-2222-4222-8222-222222222222';
const backupB = '33333333-3333-4333-8333-333333333333';
const versionA = '44444444-4444-4444-8444-444444444444';
const versionB = '55555555-5555-4555-8555-555555555555';
const planId = '66666666-6666-4666-8666-666666666666';
const chapterA = '77777777-7777-4777-8777-777777777777';
const chapterB = '88888888-8888-4888-8888-888888888888';

function success<T>(data: T) {
  return { state: 'success' as const, data };
}
function failure() {
  return {
    state: 'failure' as const,
    error: { code: 'MODEL_UNAVAILABLE' as const, message: 'failure', retryable: true },
  };
}
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function text(node: TestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');
}
function find(root: TestInstance, predicate: (node: TestInstance) => boolean, label: string) {
  const node = root.findAll(predicate)[0];
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
function button(root: TestInstance, label: string) {
  return find(root, (node) => node.type === 'button' && text(node).includes(label), `button ${label}`);
}
function dataNode(root: TestInstance, name: string) {
  return find(root, (node) => node.props[name] !== undefined, name);
}
function dataNodes(root: TestInstance, name: string) {
  return root.findAll((node) => node.props[name] !== undefined);
}
function invoke(node: TestInstance, name: 'onClick' | 'onChange') {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name}`);
  return handler as (event?: unknown) => unknown;
}
async function click(node: TestInstance): Promise<void> {
  await act(async () => {
    invoke(node, 'onClick')();
    await flush();
  });
}
async function change(node: TestInstance, value: unknown, checked?: boolean): Promise<void> {
  await act(async () => {
    invoke(node, 'onChange')({ target: { value, checked } });
    await flush();
  });
}

function overview(checkpoints = true) {
  return {
    databaseMode: 'read-write',
    readOnlyReason: null,
    policy: {
      dailyRetentionCount: 14,
      majorRetentionCount: 30,
      majorRetentionDays: 90,
      quotaBytes: 5 * 1024 * 1024 * 1024,
      policyVersion: 3,
    },
    space: { totalBytes: 1536, quotaBytes: 5 * 1024 * 1024 * 1024 },
    checkpoints: checkpoints
      ? [
          {
            backupId: backupA,
            displayName: '作者快照',
            operation: 'manual',
            track: 'major',
            schemaVersion: 12,
            createdAt: '2026-08-16T00:00:00.000Z',
            sizeBytes: 512,
            protectionReasons: ['作者保留'],
            sha256: 'a'.repeat(64),
            authorProtected: true,
          },
          {
            backupId: backupB,
            displayName: null,
            operation: 'daily',
            track: 'daily',
            schemaVersion: 12,
            createdAt: '2026-08-15T00:00:00.000Z',
            sizeBytes: 2 * 1024 * 1024,
            protectionReasons: [],
            sha256: 'b'.repeat(64),
            authorProtected: false,
          },
        ]
      : [],
    exportableVersions: checkpoints
      ? [
          {
            versionId: versionA,
            chapterTitle: '第一章',
            title: '定稿一',
            wordCount: 1000,
            finalized: true,
          },
          {
            versionId: versionB,
            chapterTitle: '第二章',
            title: '版本二',
            wordCount: 800,
            finalized: false,
          },
        ]
      : [],
  };
}

const exportVersions = {
  versions: [
    {
      versionId: versionA,
      volumeTitle: '第一卷',
      chapterTitle: '第一章',
      versionTitle: '定稿一',
      wordCount: 1000,
      finalized: true,
    },
    {
      versionId: versionB,
      volumeTitle: '第一卷',
      chapterTitle: '第二章',
      versionTitle: '草稿二',
      wordCount: 800,
      finalized: false,
    },
  ],
};

function importPlan(blockMode: 'single' | 'multi' | 'short' | 'empty' = 'single') {
  const firstBlocks =
    blockMode === 'multi'
      ? [{ blockType: 'paragraph', text: '甲段' }, { blockType: 'paragraph', text: '乙段' }]
      : blockMode === 'short'
        ? [{ blockType: 'paragraph', text: '甲' }]
        : blockMode === 'empty'
          ? []
          : [{ blockType: 'paragraph', text: '足够长的单段正文' }];
  return {
    planId,
    detectedEncoding: 'utf-8',
    confidence: 0.99,
    chapters: [
      { planChapterId: chapterA, title: '导入第一章', blocks: firstBlocks },
      {
        planChapterId: chapterB,
        title: '导入第二章',
        blocks: [{ blockType: 'paragraph', text: '第二章正文' }],
      },
    ],
  };
}

function bridge(overrides: Record<string, unknown> = {}): RendererBridgeAdapter {
  const recovery = {
    getOverview: vi.fn().mockResolvedValue(success(overview())),
    createDailyBackup: vi.fn().mockResolvedValue(success({ backupFileName: 'daily.wfbak' })),
    createNamedSnapshot: vi.fn().mockResolvedValue(success({ displayName: '作者快照' })),
    updatePolicy: vi.fn().mockResolvedValue(success({ policyVersion: 4 })),
    setProtection: vi.fn().mockResolvedValue(success({})),
    previewCleanup: vi.fn().mockResolvedValue(
      success({
        planHash: 'c'.repeat(64),
        reclaimableBytes: 1536,
        items: [
          { backupId: backupA, track: 'major', action: 'keep', reason: 'protected' },
          { backupId: backupB, track: 'daily', action: 'delete', reason: 'retention' },
        ],
      }),
    ),
    applyCleanup: vi.fn().mockResolvedValue(
      success({ deletedBackupIds: [backupB], releasedBytes: 1536 }),
    ),
    restoreCheckpoint: vi.fn().mockResolvedValue(success({ name: '恢复项目' })),
    exportVersion: vi
      .fn()
      .mockResolvedValue(success({ fileName: 'version.txt', sha256: 'd'.repeat(64) })),
  };
  const textIo = {
    listExportVersions: vi.fn().mockResolvedValue(success(exportVersions)),
    previewImport: vi.fn().mockResolvedValue(success(importPlan())),
    commitImport: vi.fn().mockResolvedValue(
      success({ importedChapterCount: 2, checkpointId: backupA }),
    ),
    exportVersions: vi.fn().mockResolvedValue(success({ fileName: 'book.txt', sizeBytes: 2048 })),
  };
  return contractInput<RendererBridgeAdapter>({
    recovery: { ...recovery, ...(overrides.recovery as object | undefined) },
    textIo: { ...textIo, ...(overrides.textIo as object | undefined) },
  });
}

async function render(
  adapter: RendererBridgeAdapter,
  section: 'recovery' | 'import-export',
  readOnly = false,
) {
  const onSectionChange = vi.fn();
  const onClose = vi.fn();
  const onProjectRestored = vi.fn().mockResolvedValue(undefined);
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(DataToolsWorkbench, {
        bridge: adapter,
        projectId,
        readOnly,
        section,
        onSectionChange,
        onClose,
        onProjectRestored,
      }),
    );
    await flush();
  });
  return { renderer, onSectionChange, onClose, onProjectRestored };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DataToolsWorkbench coverage', () => {
  it('covers recovery success interactions, policy controls, cleanup, restore and export', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const adapter = bridge();
    const { renderer, onSectionChange, onClose, onProjectRestored } = await render(
      adapter,
      'recovery',
    );

    expect(text(renderer.root)).toContain('作者快照');
    expect(text(renderer.root)).toContain('保护：作者保留');
    expect(text(renderer.root)).toContain('普通配额项');
    expect(text(renderer.root)).toContain('1.5 KiB');
    expect(text(renderer.root)).toContain('2.0 MiB');
    await click(button(renderer.root, '返回'));
    await click(button(renderer.root, '恢复中心'));
    await click(button(renderer.root, 'TXT / Markdown / DOCX'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSectionChange).toHaveBeenCalledWith('recovery');
    expect(onSectionChange).toHaveBeenCalledWith('import-export');

    await click(dataNode(renderer.root, 'data-create-daily-backup'));
    expect(text(renderer.root)).toContain('daily.wfbak');

    const inputs = renderer.root.findAll((node) => node.type === 'input');
    await change(inputs[0]!, '新快照');
    const note = find(renderer.root, (node) => node.type === 'textarea', 'snapshot note');
    await change(note, '重要节点');
    await click(dataNode(renderer.root, 'data-create-named-snapshot'));
    expect(text(renderer.root)).toContain('命名快照“作者快照”已创建并保护');

    const protectionButtons = dataNodes(renderer.root, 'data-toggle-backup-protection');
    await click(protectionButtons[0]!);
    expect(text(renderer.root)).toContain('已解除作者保留');
    await click(protectionButtons[1]!);
    expect(text(renderer.root)).toContain('已标记为作者保留');

    const numberInputs = renderer.root.findAll(
      (node) => node.type === 'input' && node.props.type === 'number',
    );
    await change(numberInputs[0]!, '7');
    await change(numberInputs[1]!, '20');
    await change(numberInputs[2]!, '60');
    await change(numberInputs[3]!, '1.5');
    await click(button(renderer.root, '保存策略'));
    expect(text(renderer.root)).toContain('保留策略已更新至版本 4');

    await click(dataNode(renderer.root, 'data-preview-backup-cleanup'));
    expect(text(renderer.root)).toContain('删除 1 份');
    expect(text(renderer.root)).toContain('major · keep · protected');
    await click(dataNode(renderer.root, 'data-apply-backup-cleanup'));
    expect(text(renderer.root)).toContain('已安全清理 1 份');

    await click(dataNodes(renderer.root, 'data-restore-checkpoint')[0]!);
    expect(onProjectRestored).toHaveBeenCalledOnce();
    expect(text(renderer.root)).toContain('恢复项目“恢复项目”已注册');

    await click(dataNodes(renderer.root, 'data-export-recovery-version')[0]!);
    expect(text(renderer.root)).toContain('version.txt');
    await act(async () => renderer.unmount());
  });

  it('covers recovery empty/read-only and failed command states', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const adapter = bridge({
      recovery: {
        getOverview: vi.fn().mockResolvedValue(success(overview(false))),
        createDailyBackup: vi.fn().mockResolvedValue(failure()),
      },
    });
    const { renderer } = await render(adapter, 'recovery', true);
    expect(text(renderer.root)).toContain('暂无恢复点');
    expect(text(renderer.root)).toContain('暂无可导出的历史版本');
    expect(dataNode(renderer.root, 'data-create-daily-backup').props.disabled).toBe(true);
    await click(dataNode(renderer.root, 'data-create-daily-backup'));
    expect(text(renderer.root)).toContain('操作未完成');
    await act(async () => renderer.unmount());
  });

  it('covers import/export selection, preview edits, single-block split, merge, commit and export', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '99999999-9999-4999-8999-999999999999') });
    const adapter = bridge();
    const { renderer } = await render(adapter, 'import-export');

    expect(text(renderer.root)).toContain('定稿一');
    expect(text(renderer.root)).toContain('草稿二');
    await click(dataNode(renderer.root, 'data-select-finalized-versions'));
    expect(text(renderer.root)).toContain('已选择 1 个版本');
    await click(button(renderer.root, '清空选择'));
    expect(text(renderer.root)).toContain('已选择 0 个版本');

    const choices = dataNodes(renderer.root, 'data-export-version-choice');
    await change(choices[0]!, '', true);
    await change(choices[1]!, '', true);
    expect(text(renderer.root)).toContain('已选择 2 个版本');
    await change(choices[1]!, '', false);
    expect(text(renderer.root)).toContain('已选择 1 个版本');

    const encoding = find(
      renderer.root,
      (node) => node.type === 'select' && node.props.value === 'auto',
      'encoding',
    );
    await change(encoding, 'gb18030');
    await click(dataNode(renderer.root, 'data-preview-import'));
    expect(text(renderer.root)).toContain('已预览 2 章');

    await change(dataNode(renderer.root, 'data-import-volume-title'), '新卷');
    const chapterTitles = dataNodes(renderer.root, 'data-import-chapter-title');
    await change(chapterTitles[0]!, '新第一章');
    await click(dataNodes(renderer.root, 'data-import-plan-action')[0]!);
    expect(dataNodes(renderer.root, 'data-import-chapter-title')).toHaveLength(3);
    expect(text(renderer.root)).toContain('新第一章（续）');

    const mergeButtons = renderer.root.findAll(
      (node) => node.props['data-import-plan-action'] === 'merge',
    );
    await click(mergeButtons[0]!);
    await click(dataNode(renderer.root, 'data-commit-import'));
    expect(text(renderer.root)).toContain('已导入 2 章');

    const format = dataNode(renderer.root, 'data-export-format');
    const fileName = dataNode(renderer.root, 'data-export-file-name');
    await change(format, 'markdown');
    await change(fileName, '整书');
    await click(dataNode(renderer.root, 'data-export-versions'));
    expect(text(renderer.root)).toContain('已原子导出 book.txt · 2.0 KiB');
    await act(async () => renderer.unmount());
  });

  it('covers multi-block split, insufficient split, empty split and operation failure messaging', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') });
    const previewImport = vi
      .fn()
      .mockResolvedValueOnce(success(importPlan('multi')))
      .mockResolvedValueOnce(success(importPlan('short')))
      .mockResolvedValueOnce(success(importPlan('empty')))
      .mockResolvedValueOnce(failure());
    const adapter = bridge({ textIo: { previewImport } });
    const { renderer } = await render(adapter, 'import-export', true);

    await click(dataNode(renderer.root, 'data-preview-import'));
    await click(dataNodes(renderer.root, 'data-import-plan-action')[0]!);
    expect(dataNodes(renderer.root, 'data-import-chapter-title').length).toBeGreaterThan(2);

    await click(dataNode(renderer.root, 'data-preview-import'));
    await click(dataNodes(renderer.root, 'data-import-plan-action')[0]!);
    expect(text(renderer.root)).toContain('内容不足');

    await click(dataNode(renderer.root, 'data-preview-import'));
    await click(dataNodes(renderer.root, 'data-import-plan-action')[0]!);

    await click(dataNode(renderer.root, 'data-preview-import'));
    expect(text(renderer.root)).toContain('预览失败：操作未完成');
    expect(dataNode(renderer.root, 'data-commit-import').props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('covers empty export versions state', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const adapter = bridge({
      textIo: { listExportVersions: vi.fn().mockResolvedValue(success({ versions: [] })) },
    });
    const { renderer } = await render(adapter, 'import-export');
    expect(text(renderer.root)).toContain('暂无可导出的历史版本');
    expect(dataNode(renderer.root, 'data-select-finalized-versions').props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });
});
