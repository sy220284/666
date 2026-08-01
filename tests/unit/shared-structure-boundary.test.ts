import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Shared Structure boundary', () => {
  it('keeps Writing independent from Planning', async () => {
    const writing = await readFile(
      'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
      'utf8',
    );
    expect(writing).toContain("from '../structure/structure-navigator.js'");
    expect(writing).not.toMatch(/from ['"]\.\.\/planning\//u);
  });

  it('exports one Shared Structure navigator for Planning and Writing', async () => {
    const [shared, planning, professional] = await Promise.all([
      readFile('apps/desktop/renderer/src/features/structure/structure-navigator.tsx', 'utf8'),
      readFile('apps/desktop/renderer/src/features/planning/planning-workbench.tsx', 'utf8'),
      readFile(
        'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx',
        'utf8',
      ),
    ]);
    expect(shared).toContain('export function StructureNavigator');
    expect(planning).toContain(
      "export { StructureNavigator } from '../structure/structure-navigator.js'",
    );
    expect(professional).not.toContain('export function StructureNavigator');
  });
});
