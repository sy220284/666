import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repositoryFile = (path: string): URL => new URL(`../../${path}`, import.meta.url);

describe('work全量验证与依赖安全覆盖', () => {
  it('固定高危传递依赖到已修复版本', async () => {
    const workspace = parseYaml(await readFile(repositoryFile('pnpm-workspace.yaml'), 'utf8')) as {
      overrides: Record<string, string>;
    };
    expect(workspace.overrides).toMatchObject({
      'brace-expansion': '5.0.9',
      undici: '7.29.0',
    });
  });

  it('提供指定ref的完整手动验证入口', async () => {
    const source = await readFile(
      repositoryFile('.github/workflows/full-work-validation.yml'),
      'utf8',
    );
    const workflow = parseYaml(source) as {
      on: {
        workflow_dispatch: {
          inputs: Record<string, unknown>;
        };
      };
      jobs: Record<
        string,
        {
          uses?: string;
          steps?: Array<{ name?: string; run?: string }>;
        }
      >;
    };

    expect(workflow.on.workflow_dispatch.inputs).toHaveProperty('ref');
    expect(workflow.on.workflow_dispatch.inputs).toHaveProperty('package_smoke');
    expect(workflow.on.workflow_dispatch.inputs).toHaveProperty('windows_ime');
    expect(workflow.jobs.quality.uses).toBe('./.github/workflows/quality-core.yml');
    expect(workflow.jobs).toHaveProperty('governance');
    expect(workflow.jobs).toHaveProperty('security');
    expect(workflow.jobs).toHaveProperty('performance');
    expect(workflow.jobs).toHaveProperty('windows-native-ime');
    expect(workflow.jobs).toHaveProperty('summary');

    const governanceCommands = (workflow.jobs.governance.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(governanceCommands).toContain('automation-layout-policy.mjs');
    expect(governanceCommands).toContain('pnpm ci:policy');
    expect(governanceCommands).toContain('scripts/evidence-policy.mjs');
    expect(governanceCommands).toContain('scripts/verified-evidence-scan.mjs');
    expect(governanceCommands).toContain('pnpm ci:ruleset');
    expect(governanceCommands).toContain('ruleset-report.json');

    const securityCommands = (workflow.jobs.security.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(securityCommands).toContain('pnpm audit --audit-level=high');
    expect(securityCommands).toContain('scan-secrets.mjs --history');
    expect(securityCommands).toContain('pnpm test:security');
  });
});
