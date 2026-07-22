import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertLegacyOwnershipComplete,
  LEGACY_RENDERER_OWNERSHIP,
} from '../../apps/desktop/renderer/src/compat/legacy-ownership.js';
import {
  createRendererStartupDiagnostic,
  serializeRendererStartupDiagnostic,
} from '../../apps/desktop/renderer/src/runtime/startup-diagnostics.js';

const retiredLegacyModules = [
  'main.ts',
  'entry.ts',
  'candidate-preview-bootstrap.ts',
  'candidate-preview-ui.ts',
  'candidate-apply-bootstrap.ts',
  'candidate-apply-ui.ts',
] as const;

describe('M3 startup diagnostics', () => {
  it('creates a P0 diagnostic with copy and safe-close capabilities', () => {
    const diagnostic = createRendererStartupDiagnostic(
      {
        code: 'RENDERER_ROOT_FAILED',
        message: 'Renderer root initialization failed.',
        retryable: true,
        diagnosticId: 'diag-renderer-root',
        userAction: 'Copy diagnostics and restart Core.',
      },
      {
        occurredAt: '2026-07-21T12:00:00.000Z',
        rendererVersion: '0.1.0',
        protocolVersion: 1,
        phase: 'react-root',
      },
    );

    expect(diagnostic).toMatchObject({
      severity: 'P0',
      diagnosticId: 'diag-renderer-root',
      actions: {
        copyDiagnostics: true,
        closeSafely: true,
        restartCore: true,
      },
    });
    expect(JSON.parse(serializeRendererStartupDiagnostic(diagnostic))).toEqual(diagnostic);
  });

  it('does not offer a Core restart for a non-retryable compatibility failure', () => {
    const diagnostic = createRendererStartupDiagnostic(
      {
        code: 'LEGACY_COMPATIBILITY_FAILED',
        message: 'Legacy compatibility initialization failed.',
        retryable: false,
      },
      {
        occurredAt: '2026-07-21T12:00:00.000Z',
        rendererVersion: '0.1.0',
        protocolVersion: 1,
        phase: 'legacy-compatibility',
      },
    );

    expect(diagnostic.actions.restartCore).toBe(false);
  });
});

describe('M3-10 legacy ownership closure', () => {
  it('keeps only a side-effect-free package entry and removes startup/business modules', async () => {
    expect(LEGACY_RENDERER_OWNERSHIP).toEqual([]);
    expect(() => assertLegacyOwnershipComplete([])).not.toThrow();

    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const packageEntry = await readFile(path.join(rendererRoot, 'index.ts'), 'utf8');
    expect(packageEntry).not.toContain("import './main.js'");
    expect(packageEntry).not.toContain('document.');
    expect(packageEntry).not.toContain('window.worldforge');

    for (const module of retiredLegacyModules) {
      await expect(access(path.join(rendererRoot, module))).rejects.toThrow();
    }
  });

  it('fails closed if a retired module is reintroduced into the inventory', () => {
    expect(() => assertLegacyOwnershipComplete(['main.ts'])).toThrow(
      'Retired legacy Renderer modules remain: main.ts.',
    );
  });
});
