import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function normalized(file) {
  return String(file ?? '').replaceAll('\\', '/').trim();
}

function isDependencyInput(file) {
  return ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(file);
}

function isProductRuntime(file) {
  return /^(?:apps|packages|migrations)\//u.test(file);
}

function isPerformanceAuthority(file) {
  return (
    file === '.github/workflows/performance.yml' ||
    file.startsWith('tests/performance/') ||
    isDependencyInput(file)
  );
}

function isApplicationSecurityAuthority(file) {
  return (
    file === '.github/workflows/security.yml' ||
    file.startsWith('tests/security/') ||
    /^scripts\/(?:scan-secrets|release|verify-package|package-).*\.mjs$/u.test(file) ||
    isDependencyInput(file)
  );
}

export function securityPerformanceRoute(files = []) {
  const changed = files.map(normalized).filter(Boolean);
  return {
    dependencyAudit: changed.some(isDependencyInput),
    applicationSecurity: changed.some(
      (file) => isProductRuntime(file) || isApplicationSecurityAuthority(file),
    ),
    performance: changed.some((file) => isProductRuntime(file) || isPerformanceAuthority(file)),
  };
}

async function main() {
  const mode = process.argv[2];
  const input = await readFile(0, 'utf8');
  const route = securityPerformanceRoute(input.split(/\r?\n/u));
  const key =
    mode === 'dependency-audit'
      ? 'dependencyAudit'
      : mode === 'application-security'
        ? 'applicationSecurity'
        : mode === 'performance'
          ? 'performance'
          : null;
  if (!key) throw new Error(`Unknown CI risk route: ${mode ?? 'missing'}`);
  process.stdout.write(route[key] ? 'true\n' : 'false\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
