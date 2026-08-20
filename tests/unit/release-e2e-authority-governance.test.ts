import { describe, expect, it } from 'vitest';

import { validateReleaseConfiguration } from '../../scripts/release-acceptance.mjs';

const packageJson = {
  version: '1.0.1',
  scripts: {
    package: 'node scripts/package-desktop.mjs',
    'package:foundation': 'node scripts/package-foundation.mjs',
    'release:check': 'node scripts/release-tool.mjs check',
    'release:gate': 'node scripts/release-tool.mjs gate',
    'release:checksums': 'node scripts/release-tool.mjs checksums',
  },
};

function workflow(publishNeeds: readonly string[]): string {
  return [
    'workflow_dispatch:',
    'fetch-depth: 0',
    'package_smoke: false',
    'pnpm audit --audit-level=high',
    'node scripts/scan-secrets.mjs',
    'main-verification',
    '--distribution-trust',
    'verify-package-assets.mjs',
    'DISTRIBUTION_TRUST_MODE: allow-unsigned',
    'gh release create',
    'jobs:',
    '  release-e2e-authority:',
    '    runs-on: ubuntu-24.04',
    '  publish:',
    '    needs:',
    ...publishNeeds.map((dependency) => `      - ${dependency}`),
    '    runs-on: ubuntu-24.04',
  ].join('\n');
}

describe('release E2E authority governance', () => {
  it('accepts publication only when publish depends on the three-platform authority job', () => {
    expect(
      validateReleaseConfiguration({
        packageJson,
        workflowSource: workflow(['quality', 'release-e2e-authority', 'build']),
      }),
    ).toEqual([]);
  });

  it('rejects a release workflow that can publish without three-platform authority', () => {
    expect(
      validateReleaseConfiguration({
        packageJson,
        workflowSource: workflow(['quality', 'build']),
      }),
    ).toContain('Release publish job must depend on release-e2e-authority');
  });
});
