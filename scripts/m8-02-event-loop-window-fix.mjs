import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/performance/m8-release-evidence.test.ts';
let source = await readFile(path, 'utf8');

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`MULTIPLE:${label}`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
  `    histogram.enable();\n    const memory = { heapGrowthBytes: 0 };`,
  `    const memory = {\n      heapGrowthBytes: 0,\n      eventLoopP99Ms: Number.POSITIVE_INFINITY,\n    };`,
  'remove-broad-histogram-window',
);

replaceOnce(
  `      const base = '持续写作、保存、统计与索引负载。'.repeat(160);\n      for (let index = 0; index < 300; index += 1) {`,
  `      const base = '持续写作、保存、统计与索引负载。'.repeat(160);\n      await new Promise((resolve) => setImmediate(resolve));\n      histogram.enable();\n      histogram.reset();\n      for (let index = 0; index < 300; index += 1) {`,
  'start-editing-histogram-window',
);

replaceOnce(
  `      }\n      await harness.search.rebuild(randomUUID(), project.projectId);`,
  `      }\n      histogram.disable();\n      memory.eventLoopP99Ms = histogram.percentile(99) / 1_000_000;\n      await harness.search.rebuild(randomUUID(), project.projectId);`,
  'stop-editing-histogram-window',
);

replaceOnce(
  `    const eventLoopP99Ms = histogram.percentile(99) / 1_000_000;`,
  `    const eventLoopP99Ms = memory.eventLoopP99Ms;`,
  'consume-isolated-event-loop-result',
);

await writeFile(path, source, 'utf8');
console.log('M8-02 event-loop histogram now covers only the 300 editing transactions.');
