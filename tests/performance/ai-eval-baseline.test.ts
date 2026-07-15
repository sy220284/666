import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ModelSupportProfileSchema } from '../../packages/contracts/src/index.js';
import { SKELETON_SPIKE_PROMPT_ID } from '../../packages/prompts/src/index.js';

describe('M0-07 deterministic Eval baseline', () => {
  it('publishes only public synthetic fixtures and a reproducible protocol report', async () => {
    const catalog = JSON.parse(await readFile('evals/fixtures/catalog.json', 'utf8')) as {
      readonly fixtureSetVersion: string;
      readonly containsPrivateData: boolean;
      readonly fixtures: readonly string[];
    };
    expect(catalog).toMatchObject({
      fixtureSetVersion: 'm0-07-v1',
      containsPrivateData: false,
    });
    expect(catalog.fixtures).toContain('protocol/skeleton-output-001.yaml');

    const report = JSON.parse(
      await readFile(
        'evals/reports/deterministic-stub/deterministic-v1/skeleton/1/summary.json',
        'utf8',
      ),
    ) as {
      readonly promptId: string;
      readonly fixtureSetVersion: string;
      readonly metrics: Record<string, number>;
      readonly containsPrivateData: boolean;
    };
    expect(report).toMatchObject({
      promptId: SKELETON_SPIKE_PROMPT_ID,
      fixtureSetVersion: 'm0-07-v1',
      containsPrivateData: false,
      metrics: {
        schemaValidityRate: 1,
        requiredBeatCoverageRate: 1,
        forbiddenEventLeakageRate: 0,
      },
    });
  });

  it('records a strict deterministic-stub support profile without claiming real-model quality', async () => {
    const profile = ModelSupportProfileSchema.parse(
      JSON.parse(
        await readFile('evals/model-support/deterministic-stub-deterministic-v1.json', 'utf8'),
      ),
    );
    expect(profile).toMatchObject({
      status: 'verified',
      fixtureSetVersion: 'm0-07-v1',
      metrics: { structuredSchemaRate: 1 },
    });
    expect(profile.limitations.join(' ')).toMatch(/确定性|真实模型/);
  });
});
