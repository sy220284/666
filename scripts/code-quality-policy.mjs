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
    coverageBaseline,
    structureBaseline,
    toolchainAuthoritySource,
    toolchainExport,
    qualityWorkflow,
    riskMatrixSource,
    editorConfig,
    gitAttributes,
  ] = await Promise.all([
    read('package.json'),
    read('eslint.config.mjs'),
    read('vitest.coverage.config.ts'),
    read('docs/architecture/coverage-baseline.json'),
    read('docs/architecture/source-structure-baseline.json'),
    read('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json'),
    read('.github/workflows/toolchain-export.yml'),
    read('.github/workflows/quality.yml'),
    read('docs/process/CI_RISK_MATRIX.json'),
    read('.editorconfig'),
    read('.gitattributes'),
  ]);

  const manifest = JSON.parse(manifestSource);
  const coveragePolicy = JSON.parse(coverageBaseline);
  const toolchainAuthority = JSON.parse(toolchainAuthoritySource);
  const riskMatrix = JSON.parse(riskMatrixSource);
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
    'node scripts/check-coverage-policy.mjs',
    'node scripts/code-quality-policy.mjs',
    'pnpm check:license',
    'pnpm check:docs',
    'pnpm check:governance',
  ]);

  const reliabilityCommand = manifest.scripts?.['test:reliability'] ?? '';
  requireTokens(violations, 'package.json#test:reliability', reliabilityCommand, [
    'pnpm test:prepare',
    'vitest run tests/reliability',
    '--no-file-parallelism',
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
    "electron: source('./tests/setup/electron-runtime-stub.ts')",
    "'apps/desktop/renderer/src/**/*.{ts,tsx}'",
    "'tests/unit/**/*.test.{ts,tsx}'",
    "'tests/integration/**/*.test.{ts,tsx}'",
    "'tests/migration/**/*.test.{ts,tsx}'",
    "'tests/security/**/*.test.{ts,tsx}'",
    "readFileSync(source('./docs/architecture/coverage-baseline.json'), 'utf8')",
    '[coverageBaseline.core.pattern]: coverageBaseline.core.thresholdPercent',
    '[coverageBaseline.rendererTsx.pattern]: rendererTsxThresholds',
  ]);

  if (coveragePolicy?.policy !== 'dual-track') {
    violations.push('coverage-baseline.json: policy must remain dual-track');
  }
  if (coveragePolicy?.core?.pattern !== '**/*.ts') {
    violations.push('coverage-baseline.json: core pattern must remain **/*.ts');
  }
  if (coveragePolicy?.rendererTsx?.pattern !== 'apps/desktop/renderer/src/**/*.tsx') {
    violations.push(
      'coverage-baseline.json: Renderer TSX pattern must remain apps/desktop/renderer/src/**/*.tsx',
    );
  }

  forbidTokens(violations, 'source-structure-baseline.json', structureBaseline, [
    'defaultMaxLines',
    'oversizedFiles',
  ]);
  requireTokens(violations, 'source-structure-baseline.json', structureBaseline, [
    'forbiddenFeatureEdges',
    'allowedFeatureImports',
    'allowedCycles',
  ]);

  if (toolchainAuthority?.schemaVersion !== 1) {
    violations.push('CURRENT_WORKSPACE_TOOLCHAIN.json: schemaVersion must remain 1');
  }
  for (const field of [
    'authorityDocument',
    'callerWorkflow',
    'exportWorkflow',
    'generator',
    'defaultProfile',
    'trustedPullRequestBranch',
  ]) {
    if (typeof toolchainAuthority?.[field] !== 'string' || !toolchainAuthority[field]) {
      violations.push(`CURRENT_WORKSPACE_TOOLCHAIN.json: missing ${field}`);
    }
  }
  if (!toolchainAuthority?.profiles?.formatter || !toolchainAuthority?.profiles?.quality) {
    violations.push(
      'CURRENT_WORKSPACE_TOOLCHAIN.json: formatter and quality profiles are required',
    );
  }
  for (const required of ['node_modules/.bin', 'node_modules/.pnpm']) {
    if (!toolchainAuthority?.requiredBundleEntries?.includes(required)) {
      violations.push(`CURRENT_WORKSPACE_TOOLCHAIN.json: missing ${required}`);
    }
  }

  requireTokens(violations, 'toolchain-export.yml', toolchainExport, [
    'workflow_call:',
    'workflow_dispatch:',
    'contents: read',
    'persist-credentials: false',
    'actions/upload-artifact@',
    'include-hidden-files: true',
    'docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json',
    'validate-authority',
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

  requireTokens(violations, 'quality.yml', qualityWorkflow, [
    'toolchain_export:',
    'uses: ./.github/workflows/toolchain-export.yml',
    "github.event.pull_request.head.ref == 'work'",
    'ci-risk-policy.mjs toolchain-export',
    'ci-risk-policy.mjs reliability',
    'reliability_suite:',
  ]);
  if (
    !Array.isArray(riskMatrix?.routes?.toolchainExport?.any) ||
    !riskMatrix.routes.toolchainExport.any.includes(
      '^docs/process/CURRENT_WORKSPACE_TOOLCHAIN\\.(?:json|md)$',
    )
  ) {
    violations.push(
      'CI_RISK_MATRIX.json: toolchainExport must cover CURRENT_WORKSPACE_TOOLCHAIN authority files',
    );
  }
  if (!Array.isArray(riskMatrix?.routes?.reliability?.any)) {
    violations.push('CI_RISK_MATRIX.json: reliability route is required');
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
    dualTrackCoverage: true,
    securityCoverageOnce: true,
    fileLengthGate: false,
    reusableToolchainExport: true,
    unifiedRiskRouting: true,
    reliabilityGate: true,
  };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await inspectCodeQualityPolicy();
  console.log(
    `Code quality policy passed: ${result.formatCommands} format commands, typed lint enabled, dual-track Renderer TSX coverage enabled, Security tests included once in product coverage, reusable toolchain export enabled, unified risk routing enabled, Reliability gate enabled, file length non-blocking.`,
  );
}
