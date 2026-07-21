import { describe, expect, it } from 'vitest';

import {
  assertLegacyOwnershipComplete,
  LEGACY_RENDERER_OWNERSHIP,
} from '../../apps/desktop/renderer/src/compat/legacy-ownership.js';
import {
  createRendererStartupDiagnostic,
  serializeRendererStartupDiagnostic,
} from '../../apps/desktop/renderer/src/runtime/startup-diagnostics.js';

const legacyDirectBridgeModules = [
  'index.ts',
  'candidate-preview-bootstrap.ts',
  'candidate-preview-ui.ts',
  'candidate-apply-bootstrap.ts',
  'candidate-apply-ui.ts',
  'canon-ui.ts',
  'continuity-ui.ts',
  'narrative-planning-ui.ts',
  'state-proposal-ui.ts',
  'scene-beat-entity-selector.ts',
  'audit-trash-reference-guard.ts',
] as const;

describe('M3-07 startup diagnostics', () => {
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

describe('M3-07 legacy ownership inventory', () => {
  it('covers every legacy module that still reads the Preload bridge directly', () => {
    expect(() => assertLegacyOwnershipComplete(legacyDirectBridgeModules)).not.toThrow();
    expect(LEGACY_RENDERER_OWNERSHIP).toHaveLength(legacyDirectBridgeModules.length);
  });

  it('fails closed when a legacy module has no migration owner', () => {
    expect(() =>
      assertLegacyOwnershipComplete([...legacyDirectBridgeModules, 'unowned-bootstrap.ts']),
    ).toThrow('Legacy ownership is missing for: unowned-bootstrap.ts.');
  });
});
