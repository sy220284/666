import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readText = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await readText(file));
const fail = (message) => {
  throw new Error(`TOOLCHAIN_POLICY: ${message}`);
};

const rootPackage = await readJson('package.json');
const authority = await readJson('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json');
const expectedPnpm = authority.bundledPnpmVersion;
const expectedNode = authority.nodeRuntimeVersion;
const expectedNodeTypes = rootPackage.devDependencies['@types/node'];
const expectedElectron = rootPackage.devDependencies.electron;

for (const field of [
  'workspaceBootstrapWorkflow',
  'workspaceBootstrapRunner',
  'workspaceBootstrapArtifactName',
  'maintenanceWorkflow',
  'maintenanceDocument',
  'maintenanceScheduleUtc',
  'maintenanceProfile',
  'maintenanceRunner',
]) {
  if (typeof authority[field] !== 'string' || !authority[field]) {
    fail(`missing snapshot authority field: ${field}`);
  }
}
if (!Array.isArray(authority.maintenancePushPaths) || authority.maintenancePushPaths.length === 0) {
  fail('maintenancePushPaths must be a non-empty array');
}
if (!authority.profiles?.[authority.maintenanceProfile]) {
  fail(`maintenance profile is not declared: ${authority.maintenanceProfile}`);
}
if (!Number.isInteger(authority.retentionDays) || authority.retentionDays < 10) {
  fail(`retentionDays must keep a safe renewal margin: ${authority.retentionDays}`);
}

if (rootPackage.packageManager !== `pnpm@${expectedPnpm}`)
  fail(`packageManager ${rootPackage.packageManager} != pnpm@${expectedPnpm}`);
if (!rootPackage.engines.node.includes('>=24.0.0') || !rootPackage.engines.node.includes('<25.0.0'))
  fail(`Node engine is not constrained to Node 24: ${rootPackage.engines.node}`);
if (
  !rootPackage.engines.pnpm.includes(expectedPnpm) ||
  !rootPackage.engines.pnpm.includes('<12.0.0')
)
  fail(`pnpm engine does not match governed v11 baseline: ${rootPackage.engines.pnpm}`);

const workspace = await readText('pnpm-workspace.yaml');
for (const setting of [
  'engineStrict: true',
  'preferFrozenLockfile: true',
  'strictPeerDependencies: true',
  'minimumReleaseAge: 1440',
]) {
  if (!workspace.includes(setting)) fail(`missing pnpm workspace setting: ${setting}`);
}

const [
  bundleGenerator,
  exportWorkflow,
  workspaceBootstrapWorkflow,
  maintenanceWorkflow,
  maintenanceDocument,
  riskMatrix,
] = await Promise.all([
  readText(authority.generator),
  readText(authority.exportWorkflow),
  readText(authority.workspaceBootstrapWorkflow),
  readText(authority.maintenanceWorkflow),
  readText(authority.maintenanceDocument),
  readJson('docs/process/CI_RISK_MATRIX.json'),
]);

if (!authority.requiredBundleEntries.includes('cache')) {
  fail('toolchain artifact does not require the pnpm metadata cache');
}
if (authority.requiredBundleEntries.includes('pnpm-workspace.yaml')) {
  fail(
    'toolchain artifact must not bypass lockfile verification with a synthetic workspace policy',
  );
}
if (bundleGenerator.includes('trustLockfile: true')) {
  fail('toolchain bundle must preserve pnpm lockfile supply-chain verification');
}
const cacheDirFlags = bundleGenerator.match(/'--cache-dir'/gu)?.length ?? 0;
if (cacheDirFlags < 4) {
  fail(
    `toolchain bundle does not bind all install/fetch verification paths to cache-dir: ${cacheDirFlags}`,
  );
}

for (const expected of [
  'push:',
  'branches: [main]',
  'schedule:',
  `cron: '${authority.maintenanceScheduleUtc}'`,
  'workflow_dispatch:',
  'contents: read',
  `uses: ./${authority.exportWorkflow}`,
  `uses: ./${authority.workspaceBootstrapWorkflow}`,
  'source_sha: ${{ github.sha }}',
  `profile: ${authority.maintenanceProfile}`,
  `runner: ${authority.maintenanceRunner}`,
  'run: node scripts/toolchain-policy.mjs',
]) {
  if (!maintenanceWorkflow.includes(expected)) {
    fail(`maintenance workflow is missing governed contract: ${expected}`);
  }
}
if (maintenanceWorkflow.includes('git push')) {
  fail('maintenance workflow must remain artifact-only and read-only');
}
for (const file of authority.maintenancePushPaths) {
  if (typeof file !== 'string' || !file) fail('maintenancePushPaths contains an invalid path');
  if (!maintenanceWorkflow.includes(`- ${file}`)) {
    fail(`maintenance workflow does not refresh for governed path: ${file}`);
  }
}

const expectedBootstrapName = authority.workspaceBootstrapArtifactName.replace(
  '{sourceSha}',
  '${{ env.SOURCE_SHA }}',
);
for (const expected of [
  'workflow_call:',
  'workflow_dispatch:',
  'branches: [governance]',
  'contents: read',
  'SOURCE_SHA: ${{ inputs.source_sha || github.sha }}',
  'pnpm install --frozen-lockfile --prefer-offline --store-dir "$STORE_DIR"',
  'rm -rf "$STORE_DIR/v11/projects"',
  'sha256sum -c SHA256SUMS.txt',
  'Verify clean-room restore',
  'find "$RESTORE_ROOT/source" -xtype l -print -quit',
  `name: ${expectedBootstrapName}`,
  `retention-days: ${authority.retentionDays}`,
  `runs-on: ${authority.workspaceBootstrapRunner}`,
]) {
  if (!workspaceBootstrapWorkflow.includes(expected)) {
    fail(`workspace bootstrap workflow is missing governed contract: ${expected}`);
  }
}
for (const forbidden of ['BASELINE_SHA', 'git push']) {
  if (workspaceBootstrapWorkflow.includes(forbidden)) {
    fail(`workspace bootstrap workflow contains forbidden legacy behavior: ${forbidden}`);
  }
}
if (!exportWorkflow.includes(`retention-days: ${authority.retentionDays}`)) {
  fail(`toolchain export retention does not match authority: ${authority.retentionDays}`);
}

const toolchainRoutePatterns = (riskMatrix.routes?.toolchainExport?.any ?? []).map(
  (pattern) => new RegExp(pattern, 'u'),
);
for (const file of authority.maintenancePushPaths) {
  if (!toolchainRoutePatterns.some((pattern) => pattern.test(file))) {
    fail(`toolchain-export risk route does not cover maintenance path: ${file}`);
  }
}

for (const expected of [
  authority.maintenanceWorkflow,
  authority.exportWorkflow,
  authority.workspaceBootstrapWorkflow,
  'main',
  `${authority.retentionDays} 天`,
]) {
  if (!maintenanceDocument.includes(expected)) {
    fail(`maintenance document is missing governed value: ${expected}`);
  }
}

for (const file of [
  'apps/desktop/main/package.json',
  'apps/desktop/preload/package.json',
  'packages/core-service/package.json',
  'packages/testkit/package.json',
]) {
  const pkg = await readJson(file);
  if (
    pkg.devDependencies?.['@types/node'] &&
    pkg.devDependencies['@types/node'] !== expectedNodeTypes
  )
    fail(`${file} @types/node ${pkg.devDependencies['@types/node']} != ${expectedNodeTypes}`);
  if (pkg.devDependencies?.electron && pkg.devDependencies.electron !== expectedElectron)
    fail(`${file} electron ${pkg.devDependencies.electron} != ${expectedElectron}`);
}
const workflowsDir = path.join(root, '.github/workflows');
for (const name of await readdir(workflowsDir)) {
  if (!/\.ya?ml$/u.test(name)) continue;
  const lines = (await readFile(path.join(workflowsDir, name), 'utf8')).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes('node-version:') && !lines[index].includes(expectedNode))
      fail(`${name} uses a Node runtime other than ${expectedNode}: ${lines[index].trim()}`);
    if (!lines[index].includes('pnpm/action-setup@')) continue;
    const stepIndent = lines[index].search(/\S/u);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const trimmed = lines[cursor].trim();
      const indent = lines[cursor].search(/\S/u);
      if (trimmed.startsWith('- ') && indent === stepIndent) break;
      if (/^version:/u.test(trimmed))
        fail(`${name} duplicates pnpm version instead of packageManager`);
    }
  }
}
console.log(
  `Toolchain policy OK: Node ${expectedNode}; pnpm ${expectedPnpm}; @types/node ${expectedNodeTypes}; Electron ${expectedElectron}; snapshots ${authority.maintenanceScheduleUtc} / ${authority.retentionDays}d.`,
);
