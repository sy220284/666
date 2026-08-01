import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const planningPath =
  'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx';
const testPath = 'tests/unit/renderer-m3-09-workbenches.test.ts';

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  assert.notEqual(first, -1, `${label}: expected source was not found`);
  assert.equal(source.indexOf(search, first + search.length), -1, `${label}: source was not unique`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

let planning = await readFile(planningPath, 'utf8');
planning = replaceOnce(
  planning,
  "import { useCallback, useEffect, useState, type FormEvent } from 'react';",
  "import { useCallback, useState, type FormEvent } from 'react';",
  'remove unused Planning useEffect import',
);
planning = replaceOnce(
  planning,
  `import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { StructureNavigator } from '../structure/structure-navigator.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  authorCharacterArcStatusLabel,
  authorEntityTypeLabel,
  authorForeshadowingStatusLabel,
  authorPlotNodeTypeLabel,
  authorSceneBeatTypeLabel,
} from '../../presentation/author-value-format.js';`,
  `import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  authorCharacterArcStatusLabel,
  authorEntityTypeLabel,
  authorForeshadowingStatusLabel,
  authorPlotNodeTypeLabel,
  authorSceneBeatTypeLabel,
} from '../../presentation/author-value-format.js';
import { StructureNavigator } from '../structure/structure-navigator.js';`,
  'professional planning import order',
);

let test = await readFile(testPath, 'utf8');
test = replaceOnce(
  test,
  `    const [planning, canonCore, continuity, narrative, dataTools, hook, writing] =
      await Promise.all([
        readFile(
          path.join(rendererRoot, 'features/planning/professional-planning-workbench.tsx'),
          'utf8',
        ),
        readFile(path.join(rendererRoot, 'features/canon/canon-core-workbench.tsx'), 'utf8'),`,
  `    const [planning, structure, canonCore, continuity, narrative, dataTools, hook, writing] =
      await Promise.all([
        readFile(
          path.join(rendererRoot, 'features/planning/professional-planning-workbench.tsx'),
          'utf8',
        ),
        readFile(
          path.join(rendererRoot, 'features/structure/structure-navigator.tsx'),
          'utf8',
        ),
        readFile(path.join(rendererRoot, 'features/canon/canon-core-workbench.tsx'), 'utf8'),`,
  'load Shared Structure source in legacy workbench test',
);
test = replaceOnce(
  test,
  `    expect(planning).toContain('previewSplitChapter');
    expect(planning).toContain('previewMergeChapters');
    expect(planning).toContain('previewMoveBlocks');
    expect(planning).toContain('previewPermanentDelete');
    expect(planning).toContain('planHash: preview.planHash');
    expect(planning).toContain('confirmationTitle = window.prompt');`,
  `    expect(planning).toContain("from '../structure/structure-navigator.js'");
    expect(structure).toContain('previewSplitChapter');
    expect(structure).toContain('previewMergeChapters');
    expect(structure).toContain('previewMoveBlocks');
    expect(structure).toContain('previewPermanentDelete');
    expect(structure).toContain('planHash: preview.planHash');
    expect(structure).toContain('confirmationTitle = window.prompt');`,
  'move structure safety assertions to Shared Structure source',
);

assert.ok(planning.includes("import { StructureNavigator } from '../structure/structure-navigator.js';"));
assert.ok(test.includes("expect(structure).toContain('previewSplitChapter')"));
assert.ok(!test.includes("expect(planning).toContain('previewSplitChapter')"));

await writeFile(planningPath, planning);
await writeFile(testPath, test);
console.log('M9-02 final import and test contracts updated.');
