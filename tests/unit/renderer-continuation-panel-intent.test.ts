import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourcePath = path.join(
  process.cwd(),
  'apps/desktop/renderer/src/features/writing/writing-workbench.tsx',
);

describe('M4-04 continuation panel intent ownership', () => {
  it('keeps the latest panel intent above the remounted panel workbench', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain(
      'const desiredPanelRef = useRef<WritingPanel>(props.panel);',
    );
    expect(source).toContain('continuationInputForPanel(snapshot, panel)');
    expect(source).toContain('panel: getDesiredPanel()');
    expect(source).toContain(
      'key={`${props.project.projectId}:${props.panel}`}',
    );
  });
});
