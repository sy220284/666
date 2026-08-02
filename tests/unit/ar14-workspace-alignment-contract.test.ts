import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');

describe('AR-14 workspace alignment contract', () => {
  it('keeps left and right React page alignment rules after CSS responsibility split', async () => {
    const themes = await readFile(path.join(rendererRoot, 'styles/themes.css'), 'utf8');

    expect(themes).toContain("body[data-workspace-alignment='left'] .react-home-page");
    expect(themes).toContain("body[data-workspace-alignment='left'] .react-settings-page");
    expect(themes).toContain("body[data-workspace-alignment='right'] .react-home-page");
    expect(themes).toContain("body[data-workspace-alignment='right'] .react-settings-page");
    expect(themes).toMatch(
      /data-workspace-alignment='left'[\s\S]*?margin-left: 0;[\s\S]*?margin-right: auto;/u,
    );
    expect(themes).toMatch(
      /data-workspace-alignment='right'[\s\S]*?margin-left: auto;[\s\S]*?margin-right: 0;/u,
    );
  });
});
