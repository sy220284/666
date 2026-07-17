import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('M2-03 Preview Main registration output', () => {
  it('emits Electron Main with isolated Preview IPC registration', async () => {
    const path = 'apps/desktop/main/src/electron-main.ts';
    let source = await readFile(path, 'utf8');
    source = replaceOnce(
      source,
      "import { registerIpcHandlers } from './ipc-handlers.js';",
      "import { registerCandidatePreviewIpc } from './candidate-preview-ipc.js';\nimport { registerIpcHandlers } from './ipc-handlers.js';",
    );
    source = replaceOnce(
      source,
      '  unregisterIpc = registerIpcHandlers({',
      '  const unregisterBaseIpc = registerIpcHandlers({',
    );
    source = replaceOnce(
      source,
      `  });

  const flushRendererDraft`,
      `  });
  const unregisterPreviewIpc = registerCandidatePreviewIpc({
    ipcMain,
    supervisor,
    rendererUrl,
  });
  unregisterIpc = () => {
    unregisterPreviewIpc();
    unregisterBaseIpc();
  };

  const flushRendererDraft`,
    );
    const output = await format(source, {
      filepath: path,
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    });
    console.log(`M203_PREVIEW_MAIN_BASE64=${Buffer.from(output).toString('base64')}`);
  });
});
