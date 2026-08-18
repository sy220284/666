import { randomUUID } from 'node:crypto';

import { ConstraintPackageSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
  type ContinuityHarness,
} from './continuity-hardening-harness.js';

function constraints(projectId: string, chapterId: string, versionId: string) {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType: 'validate',
    snapshotSource: 'fallback_live_query',
    sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
    sourceVersionIds: [versionId],
    estimatedTokens: 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

async function seedValidationRun(harness: ContinuityHarness) {
  const seeded = await seedContinuity(harness);
  await harness.versions.setFinal(randomUUID(), {
    projectId: seeded.project.projectId,
    chapterId: seeded.chapter1.id,
    versionId: seeded.version.versionId,
  });
  const run = await harness.generation.create(randomUUID(), {
    projectId: seeded.project.projectId,
    chapterId: seeded.chapter1.id,
    baseDraftId: null,
    baseDraftRevision: null,
    runType: 'validate',
    promptId: 'worldforge.validate',
    promptVersion: 1,
    outputMode: 'structured',
    providerId: 'provider-test',
    actualModel: 'model-test',
    supportStatus: 'verified',
    constraintPackage: constraints(
      seeded.project.projectId,
      seeded.chapter1.id,
      seeded.version.versionId,
    ),
    inputSources: [
      {
        sourceType: 'version',
        sourceId: seeded.version.versionId,
        sourceOrder: 0,
        contentHash: seeded.version.contentHash,
        metadata: { final: true },
      },
    ],
  });
  await harness.generation.markRunning(randomUUID(), {
    projectId: seeded.project.projectId,
    runId: run.runId,
  });
  return { seeded, run };
}

function completionInput(
  seeded: Awaited<ReturnType<typeof seedContinuity>>,
  runId: string,
  output: unknown,
) {
  return {
    projectId: seeded.project.projectId,
    chapterId: seeded.chapter1.id,
    sourceVersionId: seeded.version.versionId,
    runId,
    output,
  };
}

afterEach(cleanupContinuityHarnesses);

describe('validation high-risk authoritative boundaries', () => {
  it('rejects chapter, active-run and persisted-source mismatches before writing issues', async () => {
    const harness = await createContinuityHarness();
    try {
      const { seeded, run } = await seedValidationRun(harness);
      await expect(
        harness.validation.completeAiBatch(randomUUID(), {
          ...completionInput(seeded, run.runId, { issues: [] }),
          chapterId: seeded.chapter2.id,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_CONFLICT' });

      await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (database) => {
        database
          .prepare("UPDATE generation_runs SET status = 'succeeded', finished_at = ? WHERE id = ?")
          .run('2026-08-18T00:00:00.000Z', run.runId);
      });
      await expect(
        harness.validation.completeAiBatch(
          randomUUID(),
          completionInput(seeded, run.runId, { issues: [] }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_CONFLICT' });

      await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (database) => {
        database
          .prepare("UPDATE generation_runs SET status = 'running', finished_at = NULL WHERE id = ?")
          .run(run.runId);
        database.prepare('DELETE FROM generation_input_sources WHERE run_id = ?').run(run.runId);
      });
      await expect(
        harness.validation.completeAiBatch(
          randomUUID(),
          completionInput(seeded, run.runId, { issues: [] }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_CONFLICT' });

      expect(
        harness.workspace.readProject(seeded.project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM validation_batches').get()?.count),
        ),
      ).toBe(0);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects missing constraint packages and evidence outside the authoritative context', async () => {
    const harness = await createContinuityHarness();
    try {
      const first = await seedValidationRun(harness);
      await harness.workspace.writeProject(
        randomUUID(),
        first.seeded.project.projectId,
        (database) => {
          database
            .prepare('DELETE FROM generation_constraint_packages WHERE run_id = ?')
            .run(first.run.runId);
        },
      );
      await expect(
        harness.validation.completeAiBatch(
          randomUUID(),
          completionInput(first.seeded, first.run.runId, { issues: [] }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_CONFLICT' });
    } finally {
      await closeContinuityHarness(harness);
    }

    const secondHarness = await createContinuityHarness();
    try {
      const { seeded, run } = await seedValidationRun(secondHarness);
      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      const invalidOutputs = [
        {
          issues: [
            {
              type: 'semantic.outside-context',
              severity: 'medium',
              logicalBlockId: blockId,
              rationale: '引用了权威上下文之外的证据。',
              evidenceIds: ['external-evidence'],
              confidence: 0.5,
            },
          ],
        },
        {
          issues: [
            {
              type: 'semantic.missing-block',
              severity: 'medium',
              logicalBlockId: randomUUID(),
              rationale: '锚点不存在。',
              evidenceIds: [],
              confidence: 0.5,
            },
          ],
        },
        {
          issues: [
            {
              type: 'semantic.quote-mismatch',
              severity: 'medium',
              logicalBlockId: blockId,
              quote: '正文中不存在的逐字引文',
              rationale: '引文必须来自权威定稿。',
              evidenceIds: [blockId],
              confidence: 0.5,
            },
          ],
        },
        {
          issues: [
            {
              type: 'semantic.quote-without-anchor',
              severity: 'medium',
              quote: '没有块锚点的引文',
              rationale: '引文必须有块锚点。',
              evidenceIds: [],
              confidence: 0.5,
            },
          ],
        },
      ];

      for (const output of invalidOutputs) {
        await expect(
          secondHarness.validation.completeAiBatch(
            randomUUID(),
            completionInput(seeded, run.runId, output),
          ),
        ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });
      }
      expect(
        secondHarness.generation.get({ projectId: seeded.project.projectId, runId: run.runId }),
      ).toMatchObject({ status: 'running' });
    } finally {
      await closeContinuityHarness(secondHarness);
    }
  });

  it('rolls back the whole semantic validation commit when the run changes at the final write', async () => {
    const harness = await createContinuityHarness();
    try {
      const { seeded, run } = await seedValidationRun(harness);
      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER validation_test_run_race
          AFTER INSERT ON generation_result_refs
          WHEN NEW.run_id = '${run.runId}'
          BEGIN
            UPDATE generation_runs
               SET status = 'cancelled', finished_at = '2026-08-18T00:00:00.000Z'
             WHERE id = NEW.run_id;
          END;
        `);
      });

      await expect(
        harness.validation.completeAiBatch(
          randomUUID(),
          completionInput(seeded, run.runId, {
            issues: [
              {
                type: 'semantic.race',
                severity: 'medium',
                logicalBlockId: blockId,
                rationale: '运行状态竞争时不得提交半成品校验。',
                evidenceIds: [blockId],
                confidence: 0.8,
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_CONFLICT' });

      const persisted = harness.workspace.readProject(seeded.project.projectId, (database) => ({
        runStatus: String(
          database.prepare('SELECT status FROM generation_runs WHERE id = ?').get(run.runId)
            ?.status,
        ),
        batches: Number(
          database
            .prepare('SELECT COUNT(*) AS count FROM validation_batches WHERE generation_run_id = ?')
            .get(run.runId)?.count,
        ),
        refs: Number(
          database
            .prepare('SELECT COUNT(*) AS count FROM generation_result_refs WHERE run_id = ?')
            .get(run.runId)?.count,
        ),
      }));
      expect(persisted).toEqual({ runStatus: 'running', batches: 0, refs: 0 });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
