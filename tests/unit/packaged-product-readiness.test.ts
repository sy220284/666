import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('packaged product readiness', () => {
  it('waits for productReady rather than renderer mount alone', async () => {
    const main = await readFile('apps/desktop/main/src/electron-main.ts', 'utf8');
    const smoke = await readFile('scripts/smoke-packaged-desktop.mjs', 'utf8');
    expect(main).toContain('document.body.dataset.productReady === "true"');
    expect(main).not.toContain('document.body.dataset.rendererReady === "true"');
    expect(smoke).toContain("productReady: 'true'");
  });
});
