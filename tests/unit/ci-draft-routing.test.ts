import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const repositoryFile = (path: string): URL => new URL(`../../${path}`, import.meta.url);

describe('CI分层与任务命令清理', () => {
  it('不再暴露已停用的任务状态变更命令', async () => {
    const packageJson = JSON.parse(await readFile(repositoryFile('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const command of [
      'task:activate',
      'task:reopen',
      'task:advance',
      'task:close',
      'task:close-deferred',
    ]) {
      expect(packageJson.scripts).not.toHaveProperty(command);
    }
    expect(packageJson.scripts).toMatchObject({
      'task:status': expect.any(String),
      'task:validate': expect.any(String),
      'task:preflight': expect.any(String),
      'task:branch-check': expect.any(String),
      'task:sync': expect.any(String),
    });
  });

  it('Draft只运行轻量质量检查，Ready再运行完整矩阵', async () => {
    const quality = await readFile(repositoryFile('.github/workflows/quality.yml'), 'utf8');
    expect(quality).toContain('draft_mode: ${{ github.event.pull_request.draft }}');
    expect(quality).toContain(
      'github.event.pull_request.draft == false && contains(github.event.pull_request.body',
    );
  });

  it('Draft不重复安装安全与性能测试依赖', async () => {
    const [security, performance] = await Promise.all([
      readFile(repositoryFile('.github/workflows/security.yml'), 'utf8'),
      readFile(repositoryFile('.github/workflows/performance.yml'), 'utf8'),
    ]);
    expect(security).toContain('PR_DRAFT: ${{ github.event.pull_request.draft || false }}');
    expect(security).toContain('Dependency audit deferred until the pull request is Ready.');
    expect(security).toContain(
      'Application security tests deferred until the pull request is Ready.',
    );
    expect(security).toContain('full history runs when Ready');
    expect(performance).toContain('PR_DRAFT: ${{ github.event.pull_request.draft || false }}');
    expect(performance).toContain(
      'Performance and AI evaluation are deferred until the pull request is Ready.',
    );
  });
});
