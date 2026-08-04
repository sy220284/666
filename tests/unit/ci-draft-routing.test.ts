import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repositoryFile = (path: string): URL => new URL(`../../${path}`, import.meta.url);

describe('CI分层与任务命令清理', () => {
  it('不再暴露已停用的任务状态变更与兼容同步命令', async () => {
    const packageJson = JSON.parse(await readFile(repositoryFile('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const command of [
      'task:activate',
      'task:reopen',
      'task:advance',
      'task:close',
      'task:close-deferred',
      'task:sync',
    ]) {
      expect(packageJson.scripts).not.toHaveProperty(command);
    }
    expect(packageJson.scripts).toMatchObject({
      'task:status': expect.any(String),
      'task:validate': expect.any(String),
      'task:preflight': expect.any(String),
      'task:branch-check': expect.any(String),
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

  it('Ready阶段合并产品测试准备并复用兼容门禁', async () => {
    const source = await readFile(repositoryFile('.github/workflows/quality-core.yml'), 'utf8');
    const workflow = parseYaml(source) as {
      jobs: Record<string, { needs?: string; steps?: Array<{ name?: string; run?: string }> }>;
    };
    expect(workflow.jobs['product-tests']).toBeDefined();
    expect(workflow.jobs.tests.needs).toBe('product-tests');
    expect(workflow.jobs.coverage.needs).toBe('product-tests');
    expect(workflow.jobs.build.needs).toBe('desktop-e2e');

    const productCommands = (workflow.jobs['product-tests'].steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(productCommands.match(/pnpm install/gu)).toHaveLength(1);
    expect(productCommands.match(/pnpm test:prepare/gu)).toHaveLength(1);
    expect(productCommands).toContain('vitest run tests/unit');
    expect(productCommands).toContain('vitest run tests/integration');
    expect(productCommands).toContain('vitest run tests/migration');
    expect(productCommands).toContain('vitest run --config vitest.coverage.config.ts');

    const buildCommands = (workflow.jobs.build.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(buildCommands).not.toContain('pnpm install');
    expect(buildCommands).not.toContain('pnpm build');
  });

  it('性能预算与AI评估共用一次依赖准备', async () => {
    const source = await readFile(repositoryFile('.github/workflows/performance.yml'), 'utf8');
    const workflow = parseYaml(source) as {
      jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    expect(workflow.jobs['ai-eval']).toBeUndefined();
    const commands = (workflow.jobs.performance.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(commands.match(/pnpm install/gu)).toHaveLength(1);
    expect(commands.match(/pnpm test:prepare/gu)).toHaveLength(1);
    expect(commands).toContain('tests/performance --no-file-parallelism');
    expect(commands).toContain('ai-output-protocol.test.ts');
    expect(commands).toContain('ai-eval-baseline.test.ts');
  });
});
