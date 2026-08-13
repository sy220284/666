import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repositoryFile = (path: string): URL => new URL(`../../${path}`, import.meta.url);
const fullValidationMarker = '<!-- full-validation-draft -->';

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

  it('普通Draft保持轻量，精确marker可在禁止合并时运行完整矩阵', async () => {
    const quality = await readFile(repositoryFile('.github/workflows/quality.yml'), 'utf8');
    expect(quality).toContain(
      "draft_mode: ${{ github.event.pull_request.draft && !contains(github.event.pull_request.body || '', '<!-- full-validation-draft -->') }}",
    );
    expect(quality).toContain(fullValidationMarker);

    const automerge = await readFile(repositoryFile('scripts/automerge.mjs'), 'utf8');
    expect(automerge).toContain('blockDrafts');
    expect(automerge).toContain('pull.draft');
  });

  it('安全与性能只认精确HTML marker，不因说明文字误触发', async () => {
    const [security, performance] = await Promise.all([
      readFile(repositoryFile('.github/workflows/security.yml'), 'utf8'),
      readFile(repositoryFile('.github/workflows/performance.yml'), 'utf8'),
    ]);
    expect(security).toContain('PR_DRAFT: ${{ github.event.pull_request.draft || false }}');
    expect(security).toContain(
      "FULL_VALIDATION_DRAFT: ${{ contains(github.event.pull_request.body || '', '<!-- full-validation-draft -->') }}",
    );
    expect(security).not.toContain(
      "contains(github.event.pull_request.body, 'full-validation-draft')",
    );

    expect(performance).toContain('PR_DRAFT: ${{ github.event.pull_request.draft || false }}');
    expect(performance).toContain(
      "FULL_VALIDATION_DRAFT: ${{ contains(github.event.pull_request.body || '', '<!-- full-validation-draft -->') }}",
    );
    expect(performance).not.toContain(
      "contains(github.event.pull_request.body || '', 'full-validation-draft')",
    );
  });

  it('产品测试与覆盖率一次执行，不再生成结果转发任务', async () => {
    const source = await readFile(repositoryFile('.github/workflows/quality-core.yml'), 'utf8');
    const workflow = parseYaml(source) as {
      jobs: Record<
        string,
        { needs?: string | string[]; steps?: Array<{ name?: string; run?: string }> }
      >;
    };
    expect(workflow.jobs['product-tests']).toBeDefined();
    expect(workflow.jobs.tests).toBeUndefined();
    expect(workflow.jobs.coverage).toBeUndefined();
    expect(workflow.jobs.build).toBeUndefined();

    const productCommands = (workflow.jobs['product-tests'].steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(productCommands.match(/pnpm install/gu)).toHaveLength(1);
    expect(productCommands.match(/pnpm test:prepare/gu)).toHaveLength(1);
    expect(
      productCommands.match(/vitest run --config vitest\.coverage\.config\.ts/gu),
    ).toHaveLength(1);
    expect(productCommands).not.toContain('vitest run tests/unit');
    expect(productCommands).not.toContain('vitest run tests/integration');
    expect(productCommands).not.toContain('vitest run tests/migration');
  });

  it('性能预算与AI评估在同一套performance测试中只执行一次', async () => {
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
    expect(commands.match(/tests\/performance --no-file-parallelism/gu)).toHaveLength(1);
    expect(commands).not.toContain('ai-output-protocol.test.ts');
    expect(commands).not.toContain('ai-eval-baseline.test.ts');
  });

  it('Ready PR密钥扫描使用增量diff，定时审计保留全历史', async () => {
    const security = await readFile(repositoryFile('.github/workflows/security.yml'), 'utf8');
    expect(security).toContain('scan-secrets.mjs --base "$BASE_SHA"');
    expect(security).toContain('scan-secrets.mjs --history');
  });
});
