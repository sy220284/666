import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function replaceExact(relative, before, after) {
  const target = path.join(root, relative);
  const source = await readFile(target, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${relative}: expected one match, found ${count}`);
  await writeFile(target, source.replace(before, after));
}

await replaceExact(
  'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
  `  readonly readDraftText?: () => string;
  readonly writeClipboardText?: (text: string) => Promise<void>;`,
  `  readonly readDraftText?: () => string;
  readonly writeClipboardText?: (text: string) => Promise<void>;
  readonly flushDraft?: () => Promise<boolean>;`,
);
await replaceExact(
  'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
  `  const readDraftText = options.readDraftText ?? defaultDraftText;
  const writeClipboardText = options.writeClipboardText ?? defaultClipboardWrite;
  const surface = options.surface ?? createDomCoreRecoverySurface();`,
  `  const readDraftText = options.readDraftText ?? defaultDraftText;
  const writeClipboardText = options.writeClipboardText ?? defaultClipboardWrite;
  const flushDraft = options.flushDraft ?? (() => Promise.resolve(true));
  const surface = options.surface ?? createDomCoreRecoverySurface();`,
);
await replaceExact(
  'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
  `  let rememberedProject: RecoverableProjectIdentity | null = null;
  let recovering = false;
  let message = '正在检查本地服务运行状态。';`,
  `  let rememberedProject: RecoverableProjectIdentity | null = null;
  let recovering = false;
  let draftCopied = false;
  let message = '正在检查本地服务运行状态。';`,
);
await replaceExact(
  'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
  `    message = '正在重启本地服务；当前编辑器内容不会被清空。';
    publish();

    restartPromise = (async (): Promise<boolean> => {
      try {
        const outcome = await options.bridge.app.restartCore();`,
  `    message = '正在确认当前稿安全状态，再重启本地服务。';
    publish();

    restartPromise = (async (): Promise<boolean> => {
      try {
        let safelyFlushed = false;
        try {
          safelyFlushed = await flushDraft();
        } catch {
          safelyFlushed = false;
        }
        if (!isCurrent(epoch)) return false;
        if (!safelyFlushed && !draftCopied) {
          message = '当前稿尚未安全保存。请先复制当前正文，再重启本地服务。';
          return false;
        }
        const outcome = await options.bridge.app.restartCore();`,
);
await replaceExact(
  'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
  `        message = projectToOpen
          ? '本地服务与作品已恢复，可以重新保存当前窗口中的正文。'
          : '本地服务已恢复；当前没有可自动重新打开的最近作品。';
        return true;`,
  `        message = projectToOpen
          ? '本地服务与作品已恢复，可以重新保存当前窗口中的正文。'
          : '本地服务已恢复；当前没有可自动重新打开的最近作品。';
        draftCopied = false;
        return true;`,
);
await replaceExact(
  'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
  `      await writeClipboardText(text);
      if (!isCurrent(epoch)) return false;
      message = '当前窗口正文已复制到剪贴板。';`,
  `      await writeClipboardText(text);
      if (!isCurrent(epoch)) return false;
      draftCopied = true;
      message = '当前窗口正文已复制到剪贴板。';`,
);

await replaceExact(
  'apps/desktop/renderer/src/react-entry.tsx',
  `const coreRecovery = createCoreRecoverySupervisor({ bridge });`,
  `const coreRecovery = createCoreRecoverySupervisor({ bridge, flushDraft: flushRegisteredDraft });`,
);

await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `import { resolveAiReadiness } from '../runtime/ai-readiness.js';
import { flushRegisteredDraft } from '../runtime/draft-flush-registry.js';`,
  `import { resolveAiReadiness } from '../runtime/ai-readiness.js';
import { deriveCapabilityMatrix } from '../runtime/capability-matrix.js';
import { flushRegisteredDraft } from '../runtime/draft-flush-registry.js';`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `  const aiReadiness = useMemo(
    () => resolveAiReadiness(providers, verifiedProviderIds),
    [providers, verifiedProviderIds],
  );`,
  `  const aiReadiness = useMemo(
    () => resolveAiReadiness(providers, verifiedProviderIds),
    [providers, verifiedProviderIds],
  );
  const capabilities = useMemo(
    () =>
      deriveCapabilityMatrix({
        hydrated,
        coreStatus,
        project: activeProject,
        providerCount: providers.length,
        verifiedProviderCount: verifiedProviderIds.size,
      }),
    [activeProject, coreStatus, hydrated, providers.length, verifiedProviderIds],
  );`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `  const availability = {
    home: true,
    planning: true,
    writing: true,
    canon: true,
    checks: true,
    settings: true,
  } as const;`,
  `  const availability = capabilities.navigation;`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `  const restartCore = async (): Promise<void> => {
    setPendingKey('app.restartCore');`,
  `  const restartCore = async (): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('当前稿尚未安全保存，已阻止重启本地服务。');
      return;
    }
    setPendingKey('app.restartCore');`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `            <button
              className="quiet-button"
              data-open-continuity
              type="button"`,
  `            <button
              className="quiet-button"
              data-open-continuity
              disabled={!capabilities.project.canonReadable || Boolean(pendingKey)}
              title={
                capabilities.project.canonReadable
                  ? undefined
                  : '当前作品处于恢复保护状态，连续性账本暂不可读取。'
              }
              type="button"`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `            <button
              className="quiet-button"
              data-open-narrative-planning
              type="button"`,
  `            <button
              className="quiet-button"
              data-open-narrative-planning
              disabled={!capabilities.project.canonReadable || Boolean(pendingKey)}
              title={
                capabilities.project.canonReadable
                  ? undefined
                  : '当前作品处于恢复保护状态，伏笔与弧光暂不可读取。'
              }
              type="button"`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `            <button
              className="quiet-button"
              data-open-state-proposals
              type="button"`,
  `            <button
              className="quiet-button"
              data-open-state-proposals
              disabled={!capabilities.project.canonReadable || Boolean(pendingKey)}
              title={
                capabilities.project.canonReadable
                  ? undefined
                  : '当前作品处于恢复保护状态，设定更新建议暂不可读取。'
              }
              type="button"`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `            <button
              className="quiet-button"
              data-open-recovery
              type="button"`,
  `            <button
              className="quiet-button"
              data-open-recovery
              disabled={
                (!capabilities.project.restoreAvailable &&
                  !capabilities.project.exportAvailable) ||
                Boolean(pendingKey)
              }
              type="button"`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `            <button
              className="quiet-button"
              data-open-text-io
              type="button"`,
  `            <button
              className="quiet-button"
              data-open-text-io
              disabled={!capabilities.project.exportAvailable || Boolean(pendingKey)}
              title={
                capabilities.project.exportAvailable
                  ? undefined
                  : '当前作品无法安全导入或导出。'
              }
              type="button"`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `              disabled={activeProject.databaseMode === 'read-only' || Boolean(pendingKey)}`,
  `              disabled={!capabilities.project.moveAvailable || Boolean(pendingKey)}`,
);
await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `              pendingKey={pendingKey}
              providerAvailable={aiReadiness.status === 'ready'}`,
  `              pendingKey={pendingKey}
              projectCapabilities={capabilities.project}
              providerAvailable={aiReadiness.status === 'ready'}`,
);

await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `import type { AppDisclosureMode, PrimaryNavigationId } from '../../shell/app-shell-model.js';`,
  `import type { ProjectCapabilities } from '../../runtime/capability-matrix.js';
import type { AppDisclosureMode, PrimaryNavigationId } from '../../shell/app-shell-model.js';`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `  readonly providerAvailable: boolean;
  readonly onboardingRequest: number;`,
  `  readonly providerAvailable: boolean;
  readonly projectCapabilities: ProjectCapabilities;
  readonly onboardingRequest: number;`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `            pending={Boolean(props.pendingKey)}
            providerAvailable={props.providerAvailable}`,
  `            pending={Boolean(props.pendingKey)}
            projectCapabilities={props.projectCapabilities}
            providerAvailable={props.providerAvailable}`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `  readonly providerAvailable: boolean;
  readonly onContinue: () => void;`,
  `  readonly providerAvailable: boolean;
  readonly projectCapabilities: ProjectCapabilities;
  readonly onContinue: () => void;`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `  providerAvailable,
  onContinue,`,
  `  providerAvailable,
  projectCapabilities,
  onContinue,`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `<button className="primary-button" data-continue-writing type="button" onClick={onContinue}>
          继续写作
        </button>
        <button className="quiet-button" type="button" onClick={() => onNavigate('planning')}>
          作品规划
        </button>
        <button className="quiet-button" type="button" onClick={() => onNavigate('canon')}>
          人物与设定
        </button>
        <button className="quiet-button" type="button" onClick={onOpenRecovery}>
          恢复中心
        </button>`,
  `<button
          className="primary-button"
          data-continue-writing
          disabled={!projectCapabilities.draftReadable || pending}
          title={
            projectCapabilities.draftReadable
              ? undefined
              : '当前作品仅允许恢复与安全导出，正文暂不可读取。'
          }
          type="button"
          onClick={onContinue}
        >
          继续写作
        </button>
        <button
          className="quiet-button"
          disabled={!projectCapabilities.structureReadable || pending}
          type="button"
          onClick={() => onNavigate('planning')}
        >
          作品规划
        </button>
        <button
          className="quiet-button"
          disabled={!projectCapabilities.canonReadable || pending}
          type="button"
          onClick={() => onNavigate('canon')}
        >
          人物与设定
        </button>
        <button
          className="quiet-button"
          disabled={
            (!projectCapabilities.restoreAvailable && !projectCapabilities.exportAvailable) || pending
          }
          type="button"
          onClick={onOpenRecovery}
        >
          恢复中心
        </button>`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/home/home-page.tsx',
  `          disabled={readOnly || pending}`,
  `          disabled={!projectCapabilities.moveAvailable || pending}`,
);

await replaceExact(
  'tests/unit/core-recovery-supervisor-branch-coverage.test.ts',
  `    draft?: string;
    clipboardReject?: boolean;`,
  `    draft?: string;
    clipboardReject?: boolean;
    flush?: boolean;
    flushReject?: boolean;`,
);
await replaceExact(
  'tests/unit/core-recovery-supervisor-branch-coverage.test.ts',
  `  const writeClipboardText = vi.fn(async () => {
    if (overrides.clipboardReject) throw new Error('clipboard failed');
  });`,
  `  const writeClipboardText = vi.fn(async () => {
    if (overrides.clipboardReject) throw new Error('clipboard failed');
  });
  const flushDraft = vi.fn(async () => {
    if (overrides.flushReject) throw new Error('flush failed');
    return overrides.flush ?? true;
  });`,
);
await replaceExact(
  'tests/unit/core-recovery-supervisor-branch-coverage.test.ts',
  `    readDraftText: () => overrides.draft ?? '草稿正文',
    writeClipboardText,`,
  `    readDraftText: () => overrides.draft ?? '草稿正文',
    writeClipboardText,
    flushDraft,`,
);
await replaceExact(
  'tests/unit/core-recovery-supervisor-branch-coverage.test.ts',
  `    writeClipboardText,
  };`,
  `    writeClipboardText,
    flushDraft,
  };`,
);
await replaceExact(
  'tests/unit/core-recovery-supervisor-branch-coverage.test.ts',
  `  it.each([
    [failure('RESTART_FAILED'), 'unreachable', '操作未完成'],`,
  `  it('blocks restart until a failed draft flush is copied to the clipboard', async () => {
    const value = harness({ flush: false });
    await expect(value.supervisor.restart()).resolves.toBe(false);
    expect(value.restartCore).not.toHaveBeenCalled();
    expect(value.surface.states.at(-1)?.message).toContain('先复制当前正文');

    await expect(value.supervisor.copyDraft()).resolves.toBe(true);
    await expect(value.supervisor.restart()).resolves.toBe(true);
    expect(value.restartCore).toHaveBeenCalledOnce();
    expect(value.flushDraft).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown flush as unsafe and does not restart', async () => {
    const value = harness({ flushReject: true });
    await expect(value.supervisor.restart()).resolves.toBe(false);
    expect(value.restartCore).not.toHaveBeenCalled();
  });

  it.each([
    [failure('RESTART_FAILED'), 'unreachable', '操作未完成'],`,
);

await writeFile(
  path.join(root, 'tests/unit/app-shell-capability-actions.test.ts'),
  `import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('application shell capability actions', () => {
  it('uses the shared capability matrix for navigation and project actions', async () => {
    const shell = await readFile('apps/desktop/renderer/src/app/app-shell-m3.tsx', 'utf8');
    const home = await readFile('apps/desktop/renderer/src/features/home/home-page.tsx', 'utf8');
    expect(shell).toContain('const capabilities = useMemo');
    expect(shell).toContain('const availability = capabilities.navigation');
    expect(shell).toContain('projectCapabilities={capabilities.project}');
    expect(shell).toContain('!capabilities.project.moveAvailable');
    expect(home).toContain('!projectCapabilities.draftReadable');
    expect(home).toContain('!projectCapabilities.structureReadable');
    expect(home).toContain('!projectCapabilities.canonReadable');
  });

  it('flushes the active draft before a settings-triggered Core restart', async () => {
    const shell = await readFile('apps/desktop/renderer/src/app/app-shell-m3.tsx', 'utf8');
    const restart = shell.indexOf('const restartCore = async');
    const flush = shell.indexOf('if (!(await flushWriting()))', restart);
    const bridge = shell.indexOf('await bridge.app.restartCore()', restart);
    expect(flush).toBeGreaterThan(restart);
    expect(bridge).toBeGreaterThan(flush);
  });
});
`,
);
