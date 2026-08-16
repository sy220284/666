import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repositoryFile = (path: string): URL => new URL(`../../${path}`, import.meta.url);

type WorkflowStep = {
  name?: string;
  run?: string;
};

type WorkflowJob = {
  needs?: string | string[];
  steps?: WorkflowStep[];
  uses?: string;
  with?: Record<string, unknown>;
  strategy?: {
    matrix?: {
      shard?: number[];
      include?: Array<Record<string, unknown>>;
    };
  };
};

type Workflow = {
  jobs: Record<string, WorkflowJob>;
};

describe('三平台E2E执行治理', () => {
  it('Quality Core把Linux完整E2E拆成三个单worker分片并保留统一权威', async () => {
    const source = await readFile(repositoryFile('.github/workflows/quality-core.yml'), 'utf8');
    const workflow = parseYaml(source) as Workflow;
    const shard = workflow.jobs['desktop-e2e-shard'];
    const authority = workflow.jobs['desktop-e2e'];

    expect(source).toContain('desktop_e2e:');
    expect(shard.strategy?.matrix?.shard).toEqual([1, 2, 3]);
    expect(shard.steps?.map((step) => step.run ?? '').join('\n')).toContain(
      'run-electron-e2e.mjs --shard=${{ matrix.shard }}/3',
    );
    expect(authority.needs).toBe('desktop-e2e-shard');
    expect(authority.steps?.[0]?.name).toBe('Run Electron E2E and capture diagnostics');
    expect(workflow.jobs.quality.needs).toContain('linux-platform-experience');
  });

  it('平台体验从核心E2E中隔离，避免分片重复执行', async () => {
    const source = await readFile(repositoryFile('tests/e2e/playwright.config.ts'), 'utf8');
    expect(source).not.toContain("'platform-experience.spec.ts'");
    expect(source).toContain('workers: 1');
    expect(source).toContain('fullyParallel: false');
  });

  it('Release在永久release工作流中执行三平台九分片、三端体验与Windows真拼音', async () => {
    const source = await readFile(repositoryFile('.github/workflows/release.yml'), 'utf8');
    const workflow = parseYaml(source) as Workflow;
    const matrix = workflow.jobs['release-core-e2e'].strategy?.matrix?.include as Array<{
      platform: string;
      shard: number;
    }>;
    const platformMatrix = workflow.jobs['release-platform-experience'].strategy?.matrix
      ?.include as Array<{ platform: string }>;

    expect(matrix).toHaveLength(9);
    for (const platform of ['linux', 'windows', 'macos']) {
      expect(matrix.filter((item) => item.platform === platform).map((item) => item.shard)).toEqual(
        [1, 2, 3],
      );
    }
    expect(platformMatrix.map((item) => item.platform)).toEqual(['linux', 'windows', 'macos']);
    expect(workflow.jobs['release-windows-native-ime']).toBeDefined();
    expect(workflow.jobs['release-e2e-authority'].needs).toEqual([
      'release-core-e2e',
      'release-platform-experience',
      'release-windows-native-ime',
    ]);
    await expect(
      readFile(repositoryFile('.github/workflows/release-e2e.yml'), 'utf8'),
    ).rejects.toThrow();
  });

  it('Release发布链必须等待三平台E2E权威且不重复执行源码启动验收', async () => {
    const source = await readFile(repositoryFile('.github/workflows/release.yml'), 'utf8');
    const workflow = parseYaml(source) as Workflow;

    expect(workflow.jobs.quality.with?.desktop_e2e).toBe(false);
    expect(workflow.jobs['release-status-ready'].needs).toContain('release-e2e-authority');
    expect(workflow.jobs.publish.needs).toContain('release-e2e-authority');
    expect(workflow.jobs['release-status-final'].needs).toContain('release-e2e-authority');
    expect(source).not.toContain('Run platform startup smoke');
  });

  it('三平台体验证据包含平台截图并升级证据结构版本', async () => {
    const source = await readFile(repositoryFile('tests/e2e/platform-experience.spec.ts'), 'utf8');
    expect(source).toContain("path.join(evidenceDirectory(), 'screenshots', platformId())");
    expect(source).toContain("assertions.push('screenshot-captured')");
    expect(source).toContain('schemaVersion: 3');
  });
});
