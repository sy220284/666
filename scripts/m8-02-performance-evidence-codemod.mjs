import { readFile, rm, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, received ${count}`);
  return content.replace(before, after);
}

let diff = await read('tests/performance/chinese-diff.test.ts');
diff = replaceExact(
  diff,
  `import { performance } from 'node:perf_hooks';`,
  `import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';`,
  'diff output imports',
);
diff = replaceExact(
  diff,
  `  it('keeps 5000-character first structure and complete diff P95 inside the frozen budgets', () => {`,
  `  it('keeps 5000-character first structure and complete diff P95 inside the frozen budgets', async () => {`,
  'async diff performance test',
);
diff = replaceExact(
  diff,
  `    structureSamples.sort((left, right) => left - right);
    completeSamples.sort((left, right) => left - right);
    expect(structureSamples[Math.floor(structureSamples.length * 0.95)]).toBeLessThan(500);
    expect(completeSamples[Math.floor(completeSamples.length * 0.95)]).toBeLessThan(1_200);`,
  `    structureSamples.sort((left, right) => left - right);
    completeSamples.sort((left, right) => left - right);
    const structureP95Ms =
      structureSamples[Math.max(0, Math.ceil(structureSamples.length * 0.95) - 1)] ??
      Number.POSITIVE_INFINITY;
    const completeP95Ms =
      completeSamples[Math.max(0, Math.ceil(completeSamples.length * 0.95) - 1)] ??
      Number.POSITIVE_INFINITY;
    const metrics = [
      {
        metric: 'candidate_diff_structure_p95_ms',
        dataset: '5000-character-chinese-diff',
        samples: structureSamples.length,
        result: structureP95Ms,
        budget: 500,
        passed: structureP95Ms < 500,
      },
      {
        metric: 'candidate_diff_complete_p95_ms',
        dataset: '5000-character-chinese-diff',
        samples: completeSamples.length,
        result: completeP95Ms,
        budget: 1_200,
        passed: completeP95Ms < 1_200,
      },
    ];
    expect(metrics.every((metric) => metric.passed)).toBe(true);
    const output = process.env.WORLDFORGE_DIFF_PERF_OUTPUT;
    if (output) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, \`${JSON.stringify(metrics, null, 2)}\\n\`, 'utf8');
    }`,
  'diff metrics output',
);
await write('tests/performance/chinese-diff.test.ts', diff);

let search = await read('tests/performance/search-index-performance.test.ts');
search = replaceExact(
  search,
  `import { mkdir, mkdtemp, rm } from 'node:fs/promises';`,
  `import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';`,
  'search output import',
);
search = replaceExact(
  search,
  `      console.info(
        JSON.stringify({
          benchmark: 'm4-01-search-index',
          characters: characterCount,
          rebuildMs: Number(rebuildMs.toFixed(2)),
          queryP95Ms: Number(queryP95Ms.toFixed(2)),
          querySamples: queryDurations.length,
        }),
      );
      expect(queryP95Ms).toBeLessThanOrEqual(200);`,
  `      const metrics = [
        {
          metric: 'fts_query_p95_ms',
          dataset: '1.5m-character-project',
          samples: queryDurations.length,
          result: queryP95Ms,
          budget: 200,
          passed: queryP95Ms <= 200,
        },
        {
          metric: 'fts_rebuild_ms',
          dataset: '1.5m-character-project',
          samples: 1,
          result: rebuildMs,
          budget: 10_000,
          passed: rebuildMs < 10_000,
        },
      ];
      console.info(
        JSON.stringify({
          benchmark: 'm4-01-search-index',
          characters: characterCount,
          metrics,
        }),
      );
      const output = process.env.WORLDFORGE_SEARCH_PERF_OUTPUT;
      if (output) {
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(
          output,
          \`${JSON.stringify({ characters: characterCount, metrics }, null, 2)}\\n\`,
          'utf8',
        );
      }
      expect(queryP95Ms).toBeLessThanOrEqual(200);`,
  'search metrics output',
);
await write('tests/performance/search-index-performance.test.ts', search);

let workflow = await read('.github/workflows/performance.yml');
workflow = replaceExact(
  workflow,
  `      - name: Run performance budgets and AI protocol baselines
        shell: bash
        run: |`,
  `      - name: Run performance budgets and AI protocol baselines
        shell: bash
        env:
          WORLDFORGE_M1_PERF_OUTPUT: test-results/performance/writing.json
          WORLDFORGE_DIFF_PERF_OUTPUT: test-results/performance/diff.json
          WORLDFORGE_SEARCH_PERF_OUTPUT: test-results/performance/search.json
        run: |`,
  'performance workflow environment',
);
workflow = replaceExact(
  workflow,
  `      - name: Upload performance diagnostics
        if: ${{ failure() && steps.route.outputs.run == 'true' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        with:
          name: performance-diagnostics
          path: |
            test-results/ci/performance.log
            test-results/ci/ai-eval.log
            test-results/performance/
          if-no-files-found: warn
          retention-days: 7`,
  `      - name: Upload performance evidence
        if: ${{ always() && steps.route.outputs.run == 'true' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        with:
          name: performance-evidence
          path: |
            test-results/ci/performance.log
            test-results/ci/ai-eval.log
            test-results/performance/
          if-no-files-found: error
          retention-days: 14`,
  'performance evidence artifact',
);
await write('.github/workflows/performance.yml', workflow);

await rm('scripts/m8-02-performance-evidence-codemod.mjs');
await rm('.github/workflows/m8-02-performance-evidence-codemod.yml');
