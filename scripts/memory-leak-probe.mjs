import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DraftService,
  ProjectStructureService,
  ProjectWorkspaceService,
  openAppRuntime,
} from '../packages/core-service/dist/index.js';
import { evaluateMemoryBudget, summarizeMemorySeries } from './memory-leak-policy.mjs';

const root = process.cwd();
const budgetPath = path.join(root, 'docs/process/MEMORY_LEAK_BUDGET.json');
const fixedClock = { now: () => new Date('2026-08-12T00:00:00.000Z') };

function requireGc() {
  if (typeof globalThis.gc !== 'function') {
    throw new Error('MEMORY_GC_UNAVAILABLE: run this probe with node --expose-gc.');
  }
  return globalThis.gc;
}

async function forceGc(passes) {
  const gc = requireGc();
  for (let index = 0; index < passes; index += 1) {
    gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function captureMemory(label, operations) {
  const usage = process.memoryUsage();
  return {
    label,
    operations,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    rssBytes: usage.rss,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

async function loadBudget() {
  return JSON.parse(await readFile(budgetPath, 'utf8'));
}

async function writeDraftOperations({ drafts, projectId, chapterId, draft, count, offset }) {
  let current = draft;
  for (let index = 0; index < count; index += 1) {
    const operationIndex = offset + index;
    const block = current.blocks[0];
    if (!block?.contentHash) throw new Error('MEMORY_FIXTURE_INVALID: active draft block is missing.');
    const prefix = `稳定态写作-${String(operationIndex).padStart(5, '0')}-`;
    const content = `${prefix}${'长篇正文'.repeat(Math.ceil((3000 - prefix.length) / 4))}`.slice(0, 3000);
    current = await drafts.applyPatch(randomUUID(), {
      projectId,
      chapterId,
      draftId: current.draftId,
      baseRevision: current.revision,
      operations: [
        {
          type: 'update',
          logicalBlockId: block.logicalBlockId,
          expectedHash: block.contentHash,
          content,
        },
      ],
    });
  }
  return current;
}

async function runProjectCycles({ workspace, workspacePath, projectId, count }) {
  for (let index = 0; index < count; index += 1) {
    const opened = await workspace.open(randomUUID(), { workspacePath });
    if (opened.projectId !== projectId) {
      throw new Error('MEMORY_FIXTURE_INVALID: project identity changed during lifecycle cycle.');
    }
    await workspace.close(randomUUID(), projectId);
  }
}

async function main() {
  const budget = await loadBudget();
  if (budget.schemaVersion !== 1) throw new Error('MEMORY_BUDGET_INVALID: unsupported schemaVersion.');
  if (!Number.isInteger(budget.gcPasses) || budget.gcPasses < 2) {
    throw new Error('MEMORY_BUDGET_INVALID: gcPasses must be an integer >= 2.');
  }

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'worldforge-memory-leak-'));
  const projectParent = path.join(temporaryRoot, 'projects');
  await mkdir(projectParent, { recursive: true });
  const runtime = await openAppRuntime({
    databasePath: path.join(temporaryRoot, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(temporaryRoot, 'app-recovery'),
    appVersion: '0.1.0',
    clock: fixedClock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(temporaryRoot, 'migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: runtime.recentProjects,
    clock: fixedClock,
  });
  const structure = new ProjectStructureService(workspace, { clock: fixedClock });
  const drafts = new DraftService(workspace, { clock: fixedClock });

  let evidence;
  try {
    const project = await workspace.create(
      randomUUID(),
      { name: 'Phase3内存稳定性', channel: '长篇' },
      projectParent,
    );
    const chapter = structure.list(project.projectId).volumes[0]?.chapters[0];
    if (!chapter) throw new Error('MEMORY_FIXTURE_INVALID: starter chapter was not created.');
    let draft = await drafts.open(randomUUID(), {
      projectId: project.projectId,
      chapterId: chapter.id,
    });

    const draftConfig = budget.draftSteadyState;
    draft = await writeDraftOperations({
      drafts,
      projectId: project.projectId,
      chapterId: chapter.id,
      draft,
      count: draftConfig.warmupOperations,
      offset: 0,
    });
    await forceGc(budget.gcPasses);
    const draftSamples = [captureMemory('warm-cache-baseline', draftConfig.warmupOperations)];
    let draftOperations = draftConfig.warmupOperations;
    for (let batch = 1; batch <= draftConfig.batches; batch += 1) {
      draft = await writeDraftOperations({
        drafts,
        projectId: project.projectId,
        chapterId: chapter.id,
        draft,
        count: draftConfig.operationsPerBatch,
        offset: draftOperations,
      });
      draftOperations += draftConfig.operationsPerBatch;
      await forceGc(budget.gcPasses);
      draftSamples.push(captureMemory(`batch-${batch}`, draftOperations));
    }
    const draftSummary = summarizeMemorySeries(draftSamples);
    const draftEvaluation = evaluateMemoryBudget(draftSummary, draftConfig.budget);

    await workspace.close(randomUUID(), project.projectId);
    await forceGc(budget.gcPasses);

    const lifecycleConfig = budget.projectLifecycle;
    await runProjectCycles({
      workspace,
      workspacePath: project.workspacePath,
      projectId: project.projectId,
      count: lifecycleConfig.warmupCycles,
    });
    await forceGc(budget.gcPasses);
    const lifecycleSamples = [captureMemory('warm-cache-baseline', lifecycleConfig.warmupCycles)];
    let lifecycleCycles = lifecycleConfig.warmupCycles;
    for (let batch = 1; batch <= lifecycleConfig.batches; batch += 1) {
      await runProjectCycles({
        workspace,
        workspacePath: project.workspacePath,
        projectId: project.projectId,
        count: lifecycleConfig.cyclesPerBatch,
      });
      lifecycleCycles += lifecycleConfig.cyclesPerBatch;
      await forceGc(budget.gcPasses);
      lifecycleSamples.push(captureMemory(`batch-${batch}`, lifecycleCycles));
    }
    const lifecycleSummary = summarizeMemorySeries(lifecycleSamples);
    const lifecycleEvaluation = evaluateMemoryBudget(lifecycleSummary, lifecycleConfig.budget);

    evidence = {
      schemaVersion: 1,
      capability: 'phase3-memory-leak',
      generatedAt: new Date().toISOString(),
      budgetStatus: budget.status,
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        gcExposed: typeof globalThis.gc === 'function',
        runner: process.env.CI ? 'ci' : 'local',
      },
      methodology: {
        gcPasses: budget.gcPasses,
        boundedCacheWarmup: true,
        note: 'Measurements begin after idempotent caches have crossed their 1000-entry retention ceiling.',
      },
      phases: {
        draftSteadyState: {
          config: draftConfig,
          samples: draftSamples,
          summary: draftSummary,
          evaluation: draftEvaluation,
        },
        projectLifecycle: {
          config: lifecycleConfig,
          samples: lifecycleSamples,
          summary: lifecycleSummary,
          evaluation: lifecycleEvaluation,
        },
      },
    };
  } finally {
    await workspace.shutdown();
    await runtime.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const performanceRoot = path.dirname(
    process.env.WORLDFORGE_M8_PERF_OUTPUT ?? path.join('test-results', 'performance', 'm8-02.json'),
  );
  const output = path.join(performanceRoot, 'phase3-memory-leak.json');
  await mkdir(performanceRoot, { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  const evaluations = Object.values(evidence.phases).map((phase) => phase.evaluation);
  if (budget.status !== 'enforced' || evaluations.some((evaluation) => !evaluation.calibrated)) {
    throw new Error(`MEMORY_BUDGET_PENDING: calibration evidence written to ${output}`);
  }
  const violations = Object.entries(evidence.phases).flatMap(([phaseName, phase]) =>
    phase.evaluation.violations.map((violation) => `${phaseName}:${violation}`),
  );
  if (violations.length > 0) {
    throw new Error(`MEMORY_LEAK_BUDGET_EXCEEDED: ${violations.join(', ')}`);
  }
  console.log(`Memory leak steady-state budgets passed. Evidence: ${output}`);
}

await main();
