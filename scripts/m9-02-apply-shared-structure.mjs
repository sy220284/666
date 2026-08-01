import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const professionalPath =
  'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx';
const planningModePath =
  'apps/desktop/renderer/src/features/planning/planning-mode-workbench.tsx';
const planningPath = 'apps/desktop/renderer/src/features/planning/planning-workbench.tsx';
const writingPath = 'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx';
const structurePath =
  'apps/desktop/renderer/src/features/structure/structure-navigator.tsx';
const baselinePath = 'docs/architecture/source-structure-baseline.json';
const testPath = 'tests/unit/shared-structure-boundary.test.ts';

function between(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${label}: missing start marker ${startMarker}`);
  assert.notEqual(end, -1, `${label}: missing end marker ${endMarker}`);
  assert.ok(end > start, `${label}: invalid marker order`);
  return source.slice(start, end);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  assert.notEqual(first, -1, `${label}: expected source was not found`);
  assert.equal(source.indexOf(search, first + search.length), -1, `${label}: source was not unique`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function contractNames(source) {
  const match = /import type \{\n([\s\S]*?)\n\} from '@worldforge\/contracts';/u.exec(source);
  assert.ok(match, 'professional planning contracts import was not found');
  return {
    full: match[0],
    names: match[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function contractImport(names) {
  return `import type {\n${names.map((name) => `  ${name},`).join('\n')}\n} from '@worldforge/contracts';`;
}

function usedNames(names, body) {
  return names.filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(body));
}

function referenceCount(source, name) {
  return [...source.matchAll(new RegExp(`(?:\\b${name}\\s*\\(|<${name}\\b)`, 'gu'))].length;
}

const professionalOriginal = await readFile(professionalPath, 'utf8');
const planningModeOriginal = await readFile(planningModePath, 'utf8');
const planningOriginal = await readFile(planningPath, 'utf8');
const writingOriginal = await readFile(writingPath, 'utf8');

const structureBlock = between(
  professionalOriginal,
  'interface StructureNavigatorProps {',
  'function BriefEditor({',
  'StructureNavigator block',
);

const helperDefinitions = new Map([
  [
    'InlineError',
    between(professionalOriginal, 'function InlineError({', 'function lines(', 'InlineError'),
  ],
  ['lines', between(professionalOriginal, 'function lines(', 'function nullableString(', 'lines')],
  [
    'nullableString',
    between(
      professionalOriginal,
      'function nullableString(',
      'function nullableNumber(',
      'nullableString',
    ),
  ],
  [
    'nullableNumber',
    between(
      professionalOriginal,
      'function nullableNumber(',
      'function editorTitle(',
      'nullableNumber',
    ),
  ],
  [
    'editorTitle',
    between(professionalOriginal, 'function editorTitle(', 'function statusLabel(', 'editorTitle'),
  ],
  [
    'statusLabel',
    between(professionalOriginal, 'function statusLabel(', 'function chapterMeta(', 'statusLabel'),
  ],
  [
    'chapterMeta',
    between(professionalOriginal, 'function chapterMeta(', 'function previewMessage(', 'chapterMeta'),
  ],
  [
    'previewMessage',
    between(
      professionalOriginal,
      'function previewMessage(',
      'function sortedPlotNodes(',
      'previewMessage',
    ),
  ],
]);

const movedHelpers = [...helperDefinitions.entries()]
  .filter(([name]) => referenceCount(structureBlock, name) > 0)
  .map(([, source]) => source.trimEnd())
  .join('\n\n');
const movedBody = `${structureBlock.trimEnd()}\n\n${movedHelpers}\n`;

const originalContracts = contractNames(professionalOriginal);
const structureContracts = usedNames(originalContracts.names, movedBody);
assert.deepEqual(
  structureContracts,
  ['Chapter', 'LifecycleStatus', 'ProjectStructure', 'StructureOperationPreview', 'TrashEntry', 'Volume'],
  'unexpected Shared Structure contract surface',
);

const structureSource = `import { useCallback, useEffect, useState, type FormEvent } from 'react';\n\n${contractImport(structureContracts)}\n\nimport type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';\nimport { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';\nimport { authorErrorSummary } from '../../presentation/author-error-message.js';\n\n${movedBody}`;

let professional = replaceOnce(
  professionalOriginal,
  structureBlock,
  '',
  'remove StructureNavigator block',
);
for (const [name, helperSource] of helperDefinitions) {
  if (referenceCount(professional, name) === 1) {
    professional = replaceOnce(professional, helperSource, '', `remove moved helper ${name}`);
  }
}

const remainingContracts = contractNames(professional);
const professionalWithoutContractImport = professional.replace(remainingContracts.full, '');
const remainingContractNames = usedNames(
  remainingContracts.names,
  professionalWithoutContractImport,
);
professional = professional.replace(
  remainingContracts.full,
  contractImport(remainingContractNames),
);
professional = replaceOnce(
  professional,
  "import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';\n",
  "import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';\nimport { StructureNavigator } from '../structure/structure-navigator.js';\n",
  'add Shared Structure import to professional planning',
);

const planningMode = replaceOnce(
  planningModeOriginal,
  "import {\n  PlanningWorkbench as ProfessionalPlanningWorkbench,\n  StructureNavigator,\n} from './professional-planning-workbench.js';\n\nexport { StructureNavigator };",
  "import { PlanningWorkbench as ProfessionalPlanningWorkbench } from './professional-planning-workbench.js';\n\nexport { StructureNavigator } from '../structure/structure-navigator.js';",
  'planning mode Shared Structure export',
);

const planning = replaceOnce(
  planningOriginal,
  "import { PlanningModeWorkbench, StructureNavigator } from './planning-mode-workbench.js';\n\nexport { StructureNavigator };",
  "import { PlanningModeWorkbench } from './planning-mode-workbench.js';\n\nexport { StructureNavigator } from '../structure/structure-navigator.js';",
  'planning Shared Structure export',
);

const writing = replaceOnce(
  writingOriginal,
  "import { StructureNavigator } from '../planning/planning-workbench.js';",
  "import { StructureNavigator } from '../structure/structure-navigator.js';",
  'writing Shared Structure import',
);

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const previousExceptions = baseline.allowedFeatureImports.length;
baseline.allowedFeatureImports = baseline.allowedFeatureImports.filter(
  (entry) => !(entry.from.includes('/writing/') && entry.to.includes('/planning/')),
);
assert.equal(
  previousExceptions - baseline.allowedFeatureImports.length,
  1,
  'expected exactly one writing to planning exception',
);

const boundaryTest = `import { readFile } from 'node:fs/promises';\n\nimport { describe, expect, it } from 'vitest';\n\ndescribe('Shared Structure boundary', () => {\n  it('keeps Writing independent from Planning', async () => {\n    const writing = await readFile(\n      'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',\n      'utf8',\n    );\n    expect(writing).toContain(\n      \"from '../structure/structure-navigator.js'\",\n    );\n    expect(writing).not.toMatch(/from ['\"]\\.\\.\\/planning\\//u);\n  });\n\n  it('exports one Shared Structure navigator for Planning and Writing', async () => {\n    const [shared, planning, professional] = await Promise.all([\n      readFile(\n        'apps/desktop/renderer/src/features/structure/structure-navigator.tsx',\n        'utf8',\n      ),\n      readFile(\n        'apps/desktop/renderer/src/features/planning/planning-workbench.tsx',\n        'utf8',\n      ),\n      readFile(\n        'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx',\n        'utf8',\n      ),\n    ]);\n    expect(shared).toContain('export function StructureNavigator');\n    expect(planning).toContain(\n      \"export { StructureNavigator } from '../structure/structure-navigator.js'\",\n    );\n    expect(professional).not.toContain('export function StructureNavigator');\n  });\n});\n`;

assert.ok(!professional.includes('export function StructureNavigator'));
assert.ok(writing.includes("../structure/structure-navigator.js"));
assert.ok(!writing.includes("../planning/planning-workbench.js"));
assert.ok(structureSource.split(/\r?\n/u).length <= 800, 'Shared Structure module exceeds 800 lines');

await mkdir(path.dirname(structurePath), { recursive: true });
await writeFile(structurePath, structureSource);
await writeFile(professionalPath, professional);
await writeFile(planningModePath, planningMode);
await writeFile(planningPath, planning);
await writeFile(writingPath, writing);
await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
await writeFile(testPath, boundaryTest);

console.log(
  `M9-02 extracted Shared Structure (${structureSource.split(/\r?\n/u).length} lines) and removed the writing to planning exception.`,
);
