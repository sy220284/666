import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function requireTokens(violations, file, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) violations.push(`${file}: missing ${token}`);
  }
}

function forbidTokens(violations, file, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) violations.push(`${file}: forbidden ${token}`);
  }
}

export async function inspectCodeQualityPolicy(repositoryRoot = DEFAULT_ROOT) {
  const read = (file) => readFile(path.join(repositoryRoot, file), 'utf8');
  const [
    manifestSource,
    eslintConfig,
    coverageConfig,
    structureBaseline,
    toolchainExport,
    editorConfig,
    gitAttributes,
  ] = await Promise.all([
    read('package.json'),
    read('eslint.config.mjs'),
    read('vitest.coverage.config.ts'),
    read('docs/architecture/source-structure-baseline.json'),
    read('.github/workflows/toolchain-export.yml'),
    read('.editorconfig'),
    read('.gitattributes'),
  ]);

  const manifest = JSON.parse(manifestSource);
  const violations = [];
  const formatCommands = [manifest.scripts?.format ?? '', manifest.scripts?.['format:check'] ?? ''];

  for (const [index, command] of formatCommands.entries()) {
    const label = index === 0 ? 'package.json#format' : 'package.json#format:check';
    requireTokens(violations, label, command, [
      'apps/**/*.{ts,tsx,json,mjs,html,css}',
      'packages/**/*.{ts,tsx,json}',
      'tests/**/*.{ts,tsx}',
    ]);
  }

  const lintCommand = manifest.scripts?.lint ?? '';
  requireTokens(violations, 'package.json#lint', lintCommand, [
    'pnpm check:language',
    'pnpm check:css',
    'pnpm check:sql',
    'node scripts/test-quality-audit.mjs',
    'eslint .',
  ]);
  forbidTokens(violations, 'package.json#lint', lintCommand, ['--rule']);

  const ciPolicyCommand = manifest.scripts?.['ci:policy'] ?? '';
  requireTokens(violations, 'package.json#ci:policy', ciPolicyCommand, [
    'node scripts/workflow-structure-policy.mjs',
    'node scripts/ci-policy.mjs',
    'node scripts/code-quality-policy.mjs',
  ]);

  requireTokens(violations, 'eslint.config.mjs', eslintConfig, [
    "'no-unused-vars': ['error', unusedVariablesOptions]",
    "'@typescript-eslint/no-unused-vars': ['error', unusedVariablesOptions]",
    'projectService: true',
    "'@typescript-eslint/await-thenable': 'error'",
    "'@typescript-eslint/no-floating-promises': 'error'",
    "'@typescript-eslint/no-misused-promises'",
    "'@typescript-eslint/switch-exhaustiveness-check': 'error'",
  ]);

  requireTokens(violations, 'vitest.coverage.config.ts', coverageConfig, [
    "'apps/desktop/renderer/src/**/*.{ts,tsx}'",
    "'tests/unit/**/*.test.{ts,tsx}'",
    "'tests/integration/**/*.test.{ts,tsx}'",
    "'tests/migration/**/*.test.{ts,tsx}'",
    "'tests/security/**/*.test.{ts,tsx}'",
  ]);

  forbidTokens(violations, 'source-structure-baseline.json', structureBaseline, [
    'defaultMaxLines',
    'oversizedFiles',
  ]);
  requireTokens(violations, 'source-structure-baseline.json', structureBaseline, [
    'forbiddenFeatureEdges',
    'allowedFeatureImports',
    'allowedCycles',
  ]);

  requireTokens(violations, 'toolchain-export.yml', toolchainExport, [
    'workflow_dispatch:',
    'contents: read',
    'persist-credentials: false',
    'actions/upload-artifact@',
  ]);
  forbidTokens(violations, 'toolchain-export.yml', toolchainExport, [
    'contents: write',
    'persist-credentials: true',
    'git push',
    '.github/toolchain-export',
  ]);
  if (/^\s*push:/mu.test(toolchainExport)) {
    violations.push('toolchain-export.yml: push trigger is forbidden');
  }

  requireTokens(violations, '.editorconfig', editorConfig, [
    'charset = utf-8',
    'end_of_line = lf',
    'insert_final_newline = true',
    'indent_style = space',
  ]);
  requireTokens(violations, '.gitattributes', gitAttributes, [
    '* text=auto eol=lf',
    '*.bat text eol=crlf',
    '*.cmd text eol=crlf',
  ]);

  if (violations.length > 0) throw new Error(violations.sort().join('\n'));
  return {
    formatCommands: formatCommands.length,
    typeAwareLint: true,
    rendererTsxCoverage: true,
    fileLengthGate: false,
  };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await inspectCodeQualityPolicy();
  console.log(
    `Code quality policy passed: ${result.formatCommands} format commands, typed lint enabled, Renderer TSX covered, file length non-blocking.`,
  );
}
