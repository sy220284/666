import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { WORLD_FORGE_ERROR_CODES } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';

const root = process.cwd();
const source = (file: string): Promise<string> => readFile(path.join(root, file), 'utf8');

describe('M8-09 V1.0稳定性回归', () => {
  it('为全部正式错误码提供作者语义且不泄漏英文fallback', () => {
    for (const code of WORLD_FORGE_ERROR_CODES) {
      const message = authorErrorMessage(code, 'Internal technical failure.');
      expect(message.title).not.toBe('操作未完成');
      expect(message.message).not.toContain('Internal technical failure');
      expect(message.suggestedAction).toBeTruthy();
    }
    expect(
      authorErrorMessage('UNKNOWN_ERROR', 'Internal technical failure.').message,
    ).not.toContain('Internal technical failure');
  });

  it('保持章节和当前稿在读取成功后原子切换', async () => {
    const content = await source(
      'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
    );
    expect(content).toContain('const chapterOpenGeneration = useRef(0);');
    expect(content).toContain('currentEditor.setEditable(false)');
    expect(content).not.toContain(
      'setChapter(nextChapter);\n      activeChapter.current = nextChapter;',
    );
    expect(content).toContain('mountEditor(outcome.data, nextChapter);');
  });

  it('最近作品辅助写入失败不会删除已提交作品目录', async () => {
    const content = await source('packages/core-service/src/project-workspace.ts');
    expect(content).toContain('async #registerRecentBestEffort');
    expect(content).toContain('if (!this.#active && !committed)');
    expect(content).not.toContain('rm(renamed ? finalPath : stagingPath');
  });

  it('启动重开、跨作品隔离和退出重试具有代码级守卫', async () => {
    const [shell, main] = await Promise.all([
      source('apps/desktop/renderer/src/app/app-shell-m3.tsx'),
      source('apps/desktop/main/src/electron-main.ts'),
    ]);
    expect(shell).toContain("resolvedSettings.startupBehavior === 'reopen-last'");
    expect(shell).toContain('let active = true;');
    expect(shell).toContain('worldforge:unexpected-renderer-error');
    expect(main).toContain('finally {\n        if (!allowQuit) shutdownInFlight = null;');
  });
});
