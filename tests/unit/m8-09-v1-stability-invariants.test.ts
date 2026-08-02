import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { WORLD_FORGE_ERROR_CODES } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';

const source = (file: string) => readFile(path.join(process.cwd(), file), 'utf8');

describe('M8-09 V1 stability invariants', () => {
  it('keeps the old chapter session authoritative until the replacement draft loads', async () => {
    const content = await source(
      'apps/desktop/renderer/src/features/writing/use-chapter-session.ts',
    );
    const openChapter = content.slice(
      content.indexOf('const openChapter = useCallback'),
      content.indexOf('useEffect(() => {'),
    );
    expect(openChapter).toContain('const generation = ++requestGeneration.current');
    expect(openChapter).toContain('input.editor.current?.setEditable(false)');
    expect(openChapter).toContain('chapterRequestIsCurrent');
    expect(openChapter.indexOf("outcome.state !== 'success'")).toBeLessThan(
      openChapter.indexOf('input.mountEditor(outcome.data, nextChapter)'),
    );
  });

  it('does not delete committed workspaces or fail healthy opens when recent metadata fails', async () => {
    const [create, open, move, service] = await Promise.all([
      source('packages/core-service/src/project-workspace/project-create.ts'),
      source('packages/core-service/src/project-workspace/project-open.ts'),
      source('packages/core-service/src/project-workspace/project-move.ts'),
      source('packages/core-service/src/project-workspace/project-workspace-service.ts'),
    ]);
    expect(create).toContain('if (!renamed && !runtime.active)');
    expect(create).not.toContain('rm(renamed ? finalPath : stagingPath');
    expect(open).toContain('registerRecentBestEffort');
    expect(service).toContain('#registerRecentBestEffort');
    expect(service).toContain('return false');
    expect(move).toContain('requiredBytes / 10n + 64n * 1024n * 1024n');
  });

  it('implements reopen-last, request generations and retryable shutdown cleanup', async () => {
    const [startup, runtime, main] = await Promise.all([
      source('apps/desktop/renderer/src/app/use-workspace-startup.ts'),
      source('apps/desktop/renderer/src/app/use-workspace-runtime.ts'),
      source('apps/desktop/main/src/electron-main.ts'),
    ]);
    expect(startup).toContain("startupBehavior === 'reopen-last'");
    expect(runtime).toContain('attentionGeneration.current !== generation');
    expect(main).toContain('finally {');
    expect(main).toContain('if (!shutdownCompleted) shutdownInFlight = null');
  });

  it('provides specific Chinese author semantics for every official error code', () => {
    for (const code of WORLD_FORGE_ERROR_CODES) {
      const message = authorErrorMessage(code, 'English internal message');
      expect(message.title).not.toBe('操作未完成');
      expect(message.message).not.toContain('English internal message');
    }
  });

  it('invalidates replace previews and exposes search-state retry', async () => {
    const content = await source('apps/desktop/renderer/src/features/checks/search-panel.tsx');
    expect(content).toContain('重新读取搜索状态');
    expect(content.split('onChange={() => setPlan(null)}').length - 1).toBeGreaterThanOrEqual(3);
    expect(content).toContain('作品词典读取失败');
  });

  it('installs structured Main and Renderer unexpected-error boundaries', async () => {
    const guard = await source('apps/desktop/main/src/handler-guard.ts');
    const entry = await source('apps/desktop/renderer/src/react-entry.tsx');
    expect(guard).toContain("'ipc.handler.unexpected'");
    expect(guard).toContain("'COMMON_INTERNAL_999'");
    expect(entry).toContain('installGlobalRendererErrorBoundary');
  });
});
