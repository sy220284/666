import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  inspectCoveragePolicy,
  validateCoverageBaseline,
} from '../../scripts/check-coverage-policy.mjs';
import { validateCssSource } from '../../scripts/check-css-quality.mjs';
import { inspectCodeQualityPolicy } from '../../scripts/code-quality-policy.mjs';

const read = (path: string): Promise<string> => readFile(path, 'utf8');

describe('code quality governance', () => {
  it('formats TypeScript and TSX consistently across product and test sources', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };

    for (const command of [manifest.scripts.format, manifest.scripts['format:check']]) {
      expect(command).toContain('apps/**/*.{ts,tsx,json,mjs,html,css}');
      expect(command).toContain('packages/**/*.{ts,tsx,json}');
      expect(command).toContain('tests/**/*.{ts,tsx}');
    }
  });

  it('keeps ESLint behavior in configuration instead of shell rule injection', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };
    const eslintConfig = await read('eslint.config.mjs');

    expect(manifest.scripts.lint).toBe(
      'pnpm check:language && pnpm check:css && pnpm check:sql && node scripts/test-quality-audit.mjs && eslint .',
    );
    expect(manifest.scripts.lint).not.toContain('--rule');
    expect(eslintConfig).toContain("'no-unused-vars': ['error', unusedVariablesOptions]");
    expect(eslintConfig).toContain(
      "'@typescript-eslint/no-unused-vars': ['error', unusedVariablesOptions]",
    );
    expect(eslintConfig).toContain("'@typescript-eslint/no-floating-promises': 'error'");
    expect(eslintConfig).toContain('projectService: true');
    expect(eslintConfig).toContain("'react-hooks/rules-of-hooks': 'error'");
    expect(eslintConfig).toContain("'react-hooks/exhaustive-deps': 'error'");
  });

  it('includes Renderer TSX and TSX tests in coverage discovery', async () => {
    const coverage = await read('vitest.coverage.config.ts');

    expect(coverage).toContain("'apps/desktop/renderer/src/**/*.{ts,tsx}'");
    expect(coverage).toContain("'tests/unit/**/*.test.{ts,tsx}'");
    expect(coverage).toContain("'tests/integration/**/*.test.{ts,tsx}'");
  });

  it('keeps core coverage at 75 percent and freezes Renderer TSX uncovered counts', async () => {
    await expect(inspectCoveragePolicy()).resolves.toEqual({
      policy: 'dual-track',
      sourceHead: '8f62df087bb95098cf44258e99168b7303838092',
      exclusionCount: 31,
      coreThresholdPercent: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
      rendererTsxMaxUncovered: {
        statements: 2142,
        branches: 1864,
        functions: 795,
        lines: 1855,
      },
    });

    expect(
      validateCoverageBaseline({
        schemaVersion: 1,
        policy: 'dual-track',
        core: {
          pattern: '**/*.ts',
          thresholdPercent: {
            statements: 75,
            branches: 75,
            functions: 75,
            lines: 75,
          },
        },
        rendererTsx: {
          pattern: 'apps/desktop/renderer/src/**/*.tsx',
          metrics: {
            statements: { covered: 1, total: 2, maxUncovered: 2, percent: 50 },
            branches: { covered: 1, total: 2, maxUncovered: 1, percent: 50 },
            functions: { covered: 1, total: 2, maxUncovered: 1, percent: 50 },
            lines: { covered: 1, total: 2, maxUncovered: 1, percent: 50 },
          },
        },
      }),
    ).toContain('Renderer TSX statements maxUncovered must equal total - covered');
  });

  it('keeps Toolchain Export read-only, reusable, artifact-only and risk-routed', async () => {
    const [workflow, quality, authority, riskMatrixSource] = await Promise.all([
      read('.github/workflows/toolchain-export.yml'),
      read('.github/workflows/quality.yml'),
      read('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json'),
      read('docs/process/CI_RISK_MATRIX.json'),
    ]);
    const parsedAuthority = JSON.parse(authority) as {
      schemaVersion: number;
      defaultProfile: string;
      exportWorkflow: string;
      callerWorkflow: string;
      profiles: Record<string, unknown>;
      requiredBundleEntries: string[];
    };
    const riskMatrix = JSON.parse(riskMatrixSource) as {
      routes: { toolchainExport: { any: string[] } };
    };

    expect(workflow).toContain('workflow_call:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('include-hidden-files: true');
    expect(workflow).not.toContain('git push');
    expect(workflow).not.toContain('.github/toolchain-export');
    expect(quality).toContain('uses: ./.github/workflows/toolchain-export.yml');
    expect(quality).toContain("github.event.pull_request.head.ref == 'work'");
    expect(quality).toContain("github.event.pull_request.head.ref == 'governance'");
    expect(quality).toContain('ci-risk-policy.mjs toolchain-export');
    expect(riskMatrix.routes.toolchainExport.any).toContain(
      '^docs/process/CURRENT_WORKSPACE_TOOLCHAIN\\.(?:json|md)$',
    );
    expect(parsedAuthority).toMatchObject({
      schemaVersion: 1,
      defaultProfile: 'quality',
      exportWorkflow: '.github/workflows/toolchain-export.yml',
      callerWorkflow: '.github/workflows/quality.yml',
    });
    expect(parsedAuthority.profiles).toHaveProperty('formatter');
    expect(parsedAuthority.profiles).toHaveProperty('quality');
    expect(parsedAuthority.requiredBundleEntries).toEqual(
      expect.arrayContaining([
        'store',
        'node_modules',
        'node_modules/.bin',
        'node_modules/.pnpm',
        'manifest.json',
        'toolchain-authority.json',
        'SHA256SUMS.txt',
      ]),
    );
  });

  it('locks cross-platform line endings without imposing file length limits', async () => {
    const [editorConfig, attributes, structureBaseline, governance] = await Promise.all([
      read('.editorconfig'),
      read('.gitattributes'),
      read('docs/architecture/source-structure-baseline.json'),
      read('docs/architecture/CODE_QUALITY_GOVERNANCE.md'),
    ]);

    expect(editorConfig).toContain('end_of_line = lf');
    expect(editorConfig).toContain('insert_final_newline = true');
    expect(attributes).toContain('* text=auto eol=lf');
    expect(structureBaseline).not.toContain('defaultMaxLines');
    expect(structureBaseline).not.toContain('oversizedFiles');
    expect(governance).toContain('文件行数、函数数量和测试数量只用于观察');
    expect(governance).toContain('禁止为了满足视觉长度');
  });

  it('rejects malformed or remotely loaded CSS with file-local diagnostics', () => {
    expect(validateCssSource('.panel { color: var(--text); }\n')).toEqual([]);
    expect(validateCssSource("@import url('https://example.com/theme.css');\n")).toContain(
      'must not load remote CSS or assets',
    );
    expect(validateCssSource('.panel { color: red;\n')).toContain('contains unmatched braces');
  });

  it('runs the complete quality-scope policy from the permanent CI policy command', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts['ci:policy']).toContain('node scripts/check-coverage-policy.mjs');
    expect(manifest.scripts['ci:policy']).toContain('node scripts/code-quality-policy.mjs');
    expect(manifest.scripts['ci:policy']).toContain('pnpm check:license');
    expect(manifest.scripts['ci:policy']).toContain('pnpm check:docs');
    expect(manifest.scripts['ci:policy']).toContain('pnpm check:governance');
    await expect(inspectCodeQualityPolicy()).resolves.toMatchObject({
      typeAwareLint: true,
      rendererTsxCoverage: true,
      dualTrackCoverage: true,
      fileLengthGate: false,
      reusableToolchainExport: true,
      unifiedRiskRouting: true,
    });
  });
});
