import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const matrixPath = path.join(root, 'docs', 'process', 'CI_RISK_MATRIX.json');

function normalized(file) {
  return String(file ?? '')
    .replaceAll('\\', '/')
    .trim();
}

function compilePatterns(patterns, label) {
  if (!Array.isArray(patterns)) throw new Error(`${label} must be an array of regex strings`);
  return patterns.map((pattern) => {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      throw new Error(`${label} contains an invalid pattern`);
    }
    return new RegExp(pattern, 'u');
  });
}

export function loadRiskMatrix(filePath = matrixPath) {
  const matrix = JSON.parse(readFileSync(filePath, 'utf8'));
  if (matrix?.schemaVersion !== 1 || !matrix.routes || !matrix.fullQuality) {
    throw new Error('Risk matrix must use schemaVersion 1 with routes and fullQuality');
  }
  const compiledRoutes = {};
  for (const [name, route] of Object.entries(matrix.routes)) {
    compiledRoutes[name] = compilePatterns(route?.any, `routes.${name}.any`);
  }
  return {
    ...matrix,
    compiledRoutes,
    compiledLightweightOnly: compilePatterns(
      matrix.fullQuality.lightweightOnly,
      'fullQuality.lightweightOnly',
    ),
  };
}

export function riskPlan(files = [], matrix = loadRiskMatrix()) {
  const changed = files.map(normalized).filter(Boolean);
  const routeEnabled = (name) =>
    changed.some((file) =>
      (matrix.compiledRoutes[name] ?? []).some((pattern) => pattern.test(file)),
    );
  const fullSuite =
    changed.length === 0 ||
    !changed.every((file) => matrix.compiledLightweightOnly.some((pattern) => pattern.test(file)));

  return {
    fullSuite,
    packageSmoke: routeEnabled('packageSmoke'),
    toolchainExport: routeEnabled('toolchainExport'),
    dependencyAudit: routeEnabled('dependencyAudit'),
    supplyChainInventory: routeEnabled('supplyChainInventory'),
    applicationSecurity: routeEnabled('applicationSecurity'),
    performance: routeEnabled('performance'),
    reliability: routeEnabled('reliability'),
    uiAcceptance: routeEnabled('uiAcceptance'),
    windowsIme: routeEnabled('windowsIme'),
    platformExperience: routeEnabled('platformExperience'),
    releaseAudit: routeEnabled('releaseAudit'),
    governanceMeta: routeEnabled('governanceMeta'),
  };
}

export function securityPerformanceRoute(files = [], matrix = loadRiskMatrix()) {
  const plan = riskPlan(files, matrix);
  return {
    dependencyAudit: plan.dependencyAudit,
    applicationSecurity: plan.applicationSecurity,
    performance: plan.performance,
  };
}

async function stdinText() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const mode = process.argv[2];
  const input = await stdinText();
  const plan = riskPlan(input.split(/\r?\n/u));
  const keyByMode = {
    'full-suite': 'fullSuite',
    'package-smoke': 'packageSmoke',
    'toolchain-export': 'toolchainExport',
    'dependency-audit': 'dependencyAudit',
    'supply-chain-inventory': 'supplyChainInventory',
    'application-security': 'applicationSecurity',
    performance: 'performance',
    reliability: 'reliability',
    'ui-acceptance': 'uiAcceptance',
    'windows-ime': 'windowsIme',
    'platform-experience': 'platformExperience',
    'release-audit': 'releaseAudit',
    'governance-meta': 'governanceMeta',
  };
  const key = keyByMode[mode];
  if (!key) throw new Error(`Unknown CI risk route: ${mode ?? 'missing'}`);
  process.stdout.write(plan[key] ? 'true\n' : 'false\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
