import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('writing workbench panel lifecycle', () => {
  it('isolates panel sessions while restoring the latest persisted continuation', async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        'apps/desktop/renderer/src/features/writing/writing-workbench.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('key={`${props.project.projectId}:${props.panel}`}');
    expect(source).toContain("type SaveContinuation = RendererBridgeAdapter['project']['saveContinuation']");
    expect(source).toContain("if (outcome.state === 'success') onContinuation(outcome.data)");
    expect(source).toContain('latestContinuation?.projectId === props.project.projectId');
  });
});
