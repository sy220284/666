import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

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
    expect(eslintConfig).toContain("'@typescript-eslint/no-unused-vars': unusedVariablesRule");
    expect(eslintConfig).toContain("'@typescript-eslint/no-floating-promises': 'error'");
    expect(eslintConfig).toContain('projectService: true');
  });

  it('includes Renderer TSX and TSX tests in coverage discovery', async () => {
    const coverage = await read('vitest.coverage.config.ts');

    expect(coverage).toContain("'apps/desktop/renderer/src/**/*.{ts,tsx}'");
    expect(coverage).toContain("'tests/unit/**/*.test.{ts,tsx}'");
    expect(coverage).toContain("'tests/integration/**/*.test.{ts,tsx}'");
  });

  it('keeps Toolchain Export read-only and artifact-only', async () => {
    const workflow = await read('.github/workflows/toolchain-export.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('branches:\n      - work');
    expect(workflow).not.toContain('git push');
    expect(workflow).not.toContain('.github/toolchain-export');
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

    expect(manifest.scripts['ci:policy']).toContain('node scripts/code-quality-policy.mjs');
    await expect(inspectCodeQualityPolicy()).resolves.toMatchObject({
      typeAwareLint: true,
      rendererTsxCoverage: true,
      fileLengthGate: false,
    });
  });
});
