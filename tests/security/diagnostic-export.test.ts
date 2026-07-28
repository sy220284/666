import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createDiagnosticPreview,
  exportDiagnosticPreview,
} from '../../apps/desktop/main/src/diagnostic-export.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('safe diagnostic export', () => {
  it('uses an explicit allowlist and never includes creative content, credentials, or paths', async () => {
    const preview = createDiagnosticPreview({
      app: { version: '1.0.0', platform: 'linux', protocolVersion: 1 },
      core: {
        status: 'healthy',
        pid: 123,
        restartCount: 0,
        lastErrorCode: null,
        diagnosticId: null,
      },
      window: {
        workspaceAlignment: 'center',
        uiScalePercent: 100,
        bodyFontSize: 18,
        contentWidth: 'normal',
        displayId: 'primary',
        boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
        scaleFactor: 1,
        maximized: false,
      },
      now: new Date('2026-07-28T10:00:00.000Z'),
    });
    expect(preview.manifest.contentIncluded).toBe(false);
    expect(preview.manifest.credentialIncluded).toBe(false);
    expect(preview.manifest.excluded).toEqual(
      expect.arrayContaining([
        'project-content',
        'project-database',
        'prompts',
        'provider-credentials',
        'absolute-paths',
      ]),
    );

    const directory = await mkdtemp(join(tmpdir(), 'worldforge-diagnostics-'));
    directories.push(directory);
    const exported = await exportDiagnosticPreview(directory, preview);
    const filePath = join(directory, exported.fileName);
    const content = await readFile(filePath, 'utf8');

    expect(content).not.toContain('chapterContent');
    expect(content).not.toContain('promptText');
    expect(content).not.toContain('credentialRef');
    expect(content).not.toContain('workspacePath');
    expect(content).not.toContain(directory);
    expect(exported.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(exported.bytes).toBe(Buffer.byteLength(content));
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});
