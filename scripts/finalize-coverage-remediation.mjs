import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const originalFormatCheck =
  'prettier --check "scripts/**/*.mjs" "apps/**/*.{ts,json,mjs,html,css}" "packages/**/*.{ts,json}" "tests/**/*.ts" "evals/**/*.{json,yaml,yml}" ".github/**/*.{yaml,yml,json,md}" ".github/governance/deferred-task-closure.mjs" "*.{json,yaml,yml,mjs,ts}"';

execFileSync(
  'pnpm',
  ['add', '--workspace-root', '--save-dev', '@vitest/coverage-v8@4.1.10'],
  { stdio: 'inherit' },
);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.scripts['format:check'] = originalFormatCheck;
packageJson.scripts['test:coverage'] =
  'pnpm test:prepare && vitest run --config vitest.coverage.config.ts';
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

let quality = fs.readFileSync('.github/workflows/quality-core.yml', 'utf8');
if (!quality.includes('  coverage:\n    name: coverage')) {
  const coverageJob = `  coverage:\n    name: coverage\n    if: \${{ inputs.draft_mode == false }}\n    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n    steps:\n      - name: Skip coverage for documentation-only Ready PR\n        if: \${{ inputs.full_suite == false }}\n        run: echo "Coverage is not required because only Markdown or docs/ files changed."\n      - uses: actions/checkout@v6\n        if: \${{ inputs.full_suite }}\n        with:\n          ref: \${{ inputs.checkout_ref || github.sha }}\n          persist-credentials: false\n      - uses: pnpm/action-setup@v4\n        if: \${{ inputs.full_suite }}\n        with:\n          version: 11.13.0\n      - uses: actions/setup-node@v6\n        if: \${{ inputs.full_suite }}\n        with:\n          node-version: 24\n          cache: pnpm\n      - name: Assert clean working tree before coverage\n        if: \${{ inputs.full_suite }}\n        run: node .github/governance/assert-clean-tree.mjs\n      - run: pnpm install --frozen-lockfile --prefer-offline\n        if: \${{ inputs.full_suite }}\n      - name: Run product source coverage threshold\n        if: \${{ inputs.full_suite }}\n        shell: bash\n        run: |\n          mkdir -p test-results/ci\n          set -o pipefail\n          pnpm test:coverage 2>&1 | tee test-results/ci/coverage.log\n      - name: Assert clean working tree after coverage\n        if: \${{ always() && inputs.full_suite }}\n        run: node .github/governance/assert-clean-tree.mjs\n      - name: Upload product source coverage\n        if: \${{ always() && inputs.full_suite }}\n        uses: actions/upload-artifact@v7\n        with:\n          name: product-source-coverage\n          path: |\n            coverage/\n            test-results/ci/coverage.log\n          if-no-files-found: warn\n          retention-days: 7\n\n`;
  const securityIndex = quality.indexOf('  security-tests:\n');
  if (securityIndex < 0) throw new Error('QUALITY_SECURITY_JOB_NOT_FOUND');
  quality = `${quality.slice(0, securityIndex)}${coverageJob}${quality.slice(securityIndex)}`;
}

const qualityIndex = quality.indexOf('  quality:\n');
if (qualityIndex < 0) throw new Error('QUALITY_AGGREGATE_JOB_NOT_FOUND');
const aggregateJob = `  quality:\n    name: quality\n    if: always()\n    needs:\n      - static-checks\n      - tests\n      - coverage\n      - security-tests\n      - performance-eval\n      - desktop-e2e\n      - build\n      - package-smoke\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    env:\n      DRAFT_MODE: \${{ inputs.draft_mode }}\n      PACKAGE_REQUIRED: \${{ inputs.package_smoke }}\n      SECURITY_REQUIRED: \${{ inputs.security_suite }}\n      PERFORMANCE_REQUIRED: \${{ inputs.performance_eval }}\n      STATIC_RESULT: \${{ needs.static-checks.result }}\n      TEST_RESULT: \${{ needs.tests.result }}\n      COVERAGE_RESULT: \${{ needs.coverage.result }}\n      SECURITY_RESULT: \${{ needs.security-tests.result }}\n      PERFORMANCE_RESULT: \${{ needs.performance-eval.result }}\n      E2E_RESULT: \${{ needs.desktop-e2e.result }}\n      BUILD_RESULT: \${{ needs.build.result }}\n      PACKAGE_RESULT: \${{ needs.package-smoke.result }}\n    steps:\n      - name: Enforce aggregate quality result\n        shell: bash\n        run: |\n          set -euo pipefail\n          printf 'draft=%s\\nstatic=%s\\ntests=%s\\ncoverage=%s\\nsecurity=%s\\nperformance=%s\\ne2e=%s\\nbuild=%s\\npackage=%s\\n' \\\n            "$DRAFT_MODE" "$STATIC_RESULT" "$TEST_RESULT" "$COVERAGE_RESULT" \\\n            "$SECURITY_RESULT" "$PERFORMANCE_RESULT" "$E2E_RESULT" "$BUILD_RESULT" "$PACKAGE_RESULT"\n          test "$STATIC_RESULT" = success\n          if [ "$DRAFT_MODE" = true ]; then\n            for result in "$TEST_RESULT" "$COVERAGE_RESULT" "$SECURITY_RESULT" \\\n              "$PERFORMANCE_RESULT" "$E2E_RESULT" "$BUILD_RESULT" "$PACKAGE_RESULT"; do\n              case "$result" in\n                success|skipped) ;;\n                *) exit 1 ;;\n              esac\n            done\n            exit 0\n          fi\n\n          for result in "$TEST_RESULT" "$COVERAGE_RESULT" "$E2E_RESULT" "$BUILD_RESULT"; do\n            test "$result" = success\n          done\n\n          require_optional_job() {\n            required="$1"\n            result="$2"\n            label="$3"\n            if [ "$required" = true ]; then\n              test "$result" = success || {\n                echo "$label was enabled but did not succeed: $result" >&2\n                exit 1\n              }\n              return\n            fi\n            case "$result" in\n              success|skipped) ;;\n              *)\n                echo "$label produced an invalid disabled result: $result" >&2\n                exit 1\n                ;;\n            esac\n          }\n\n          require_optional_job "$SECURITY_REQUIRED" "$SECURITY_RESULT" security-tests\n          require_optional_job "$PERFORMANCE_REQUIRED" "$PERFORMANCE_RESULT" performance-eval\n          require_optional_job "$PACKAGE_REQUIRED" "$PACKAGE_RESULT" package-smoke\n`;
quality = `${quality.slice(0, qualityIndex)}${aggregateJob}`;
fs.writeFileSync('.github/workflows/quality-core.yml', quality);

for (const temporaryWorkflow of [
  '.github/workflows/coverage-development.yml',
  '.github/workflows/coverage-finalize.yml',
  '.github/workflows/coverage-finalize-pr.yml',
]) {
  fs.rmSync(temporaryWorkflow, { force: true });
}

execFileSync('pnpm', ['format'], { stdio: 'inherit' });
execFileSync('pnpm', ['format:check'], { stdio: 'inherit' });

const outputRoot = 'test-results/ci/finalized';
const outputFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'vitest.config.ts',
  'vitest.coverage.config.ts',
  '.github/workflows/quality-core.yml',
  '.github/audit-remediations/coverage-75-2026-07-23.json',
  'tests/setup/restore-global-state.ts',
  'tests/integration/preload-ipc-core.integration.test.ts',
  'tests/unit/core-narrative-router-coverage.test.ts',
  'tests/unit/core-project-routers-coverage.test.ts',
  'tests/unit/core-utility-router-coverage.test.ts',
  'tests/unit/editor-core-lock-guard-coverage.test.ts',
  'tests/unit/ipc-handlers-branch-coverage.test.ts',
  'tests/unit/preload-bridge-coverage.test.ts',
  'tests/unit/core-recovery-supervisor-dom.test.ts',
];
for (const file of outputFiles) {
  const destination = path.join(outputRoot, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}
fs.copyFileSync('.github/workflows/quality-core.yml', path.join(outputRoot, 'quality-core.yml'));
fs.copyFileSync(
  '.github/audit-remediations/coverage-75-2026-07-23.json',
  path.join(outputRoot, 'coverage-manifest.json'),
);
fs.writeFileSync(
  path.join(outputRoot, 'deletions.json'),
  `${JSON.stringify(
    [
      '.github/workflows/coverage-development.yml',
      '.github/workflows/coverage-finalize.yml',
      '.github/workflows/coverage-finalize-pr.yml',
      'scripts/finalize-coverage-remediation.mjs',
    ],
    null,
    2,
  )}\n`,
);

console.error('FINALIZED_COVERAGE_REMEDIATION_ARTIFACT_READY');
process.exitCode = 1;
