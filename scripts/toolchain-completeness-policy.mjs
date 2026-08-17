import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readText = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await readText(file));
const fail = (message) => {
  throw new Error(`TOOLCHAIN_COMPLETENESS: ${message}`);
};

const authority = await readJson('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json');
const rootPackage = await readJson('package.json');

for (const field of [
  'completenessDocument',
  'workspaceBootstrapBrowserDirectory',
  'workspaceBootstrapAuditToolsDirectory',
  'hostProbeWorkflow',
]) {
  if (typeof authority[field] !== 'string' || !authority[field]) {
    fail(`missing authority field: ${field}`);
  }
}
if (authority.workspaceBootstrapIncludesPnpmRuntime !== true) {
  fail('workspace bootstrap must include a restorable pnpm runtime');
}
if (!Array.isArray(authority.completenessInputs) || authority.completenessInputs.length === 0) {
  fail('completenessInputs must be a non-empty array');
}

const qualityPackages = new Set(authority.profiles?.quality?.packages ?? []);
for (const packageName of [
  '@eslint/js',
  '@playwright/test',
  '@vitest/coverage-v8',
  'eslint',
  'eslint-plugin-react-hooks',
  'esbuild',
  'prettier',
  'typescript',
  'typescript-eslint',
  'vitest',
  'yaml',
]) {
  if (!qualityPackages.has(packageName)) fail(`quality profile is missing ${packageName}`);
  if (!rootPackage.devDependencies?.[packageName]) {
    fail(`quality profile package is not repository-pinned: ${packageName}`);
  }
}

const qualityCommands = new Set(
  (authority.profiles?.quality?.commands ?? []).map(([binary]) => binary),
);
for (const binary of ['pnpm', 'prettier', 'eslint', 'tsc', 'vitest', 'esbuild', 'playwright']) {
  if (!qualityCommands.has(binary)) fail(`quality profile does not verify ${binary}`);
}

const auditTools = authority.standaloneAuditTools;
if (!auditTools || typeof auditTools !== 'object' || Array.isArray(auditTools)) {
  fail('standaloneAuditTools must be declared');
}
for (const name of ['knip', 'jscpd']) {
  const version = auditTools[name];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version)) {
    fail(`${name} must use an exact stable version`);
  }
}

const hostRequirements = authority.hostRequirements;
for (const platform of ['linux', 'windows', 'macos']) {
  const requirement = hostRequirements?.[platform];
  if (!requirement || typeof requirement.runner !== 'string') {
    fail(`missing host requirement for ${platform}`);
  }
  if (!Array.isArray(requirement.commands) || requirement.commands.length === 0) {
    fail(`${platform} host commands must be declared`);
  }
}

const [
  workspaceBootstrap,
  hostProbe,
  maintenance,
  completenessDocument,
] = await Promise.all([
  readText(authority.workspaceBootstrapWorkflow),
  readText(authority.hostProbeWorkflow),
  readText(authority.maintenanceWorkflow),
  readText(authority.completenessDocument),
]);

for (const expected of [
  'PLAYWRIGHT_BROWSERS_PATH',
  'playwright install chromium',
  authority.workspaceBootstrapBrowserDirectory,
  authority.workspaceBootstrapAuditToolsDirectory,
  'standaloneAuditTools',
  'pnpm: authority.bundledPnpmVersion',
  'pnpm --version',
  'node_modules/.bin/knip',
  'node_modules/.bin/jscpd',
]) {
  if (!workspaceBootstrap.includes(expected)) {
    fail(`workspace bootstrap is missing completeness contract: ${expected}`);
  }
}

for (const expected of [
  'workflow_call:',
  'runs-on: ubuntu-24.04',
  'runs-on: windows-latest',
  'runs-on: macos-latest',
  'signtool.exe',
  'xcrun notarytool --version',
  'apt-cache show xvfb',
  'apt-cache show fonts-noto-cjk',
]) {
  if (!hostProbe.includes(expected)) fail(`host probe is missing: ${expected}`);
}

for (const expected of [
  `uses: ./${authority.hostProbeWorkflow}`,
  'node scripts/toolchain-completeness-policy.mjs',
  ...authority.completenessInputs,
]) {
  if (!maintenance.includes(expected)) fail(`maintenance workflow is missing: ${expected}`);
}

for (const expected of [
  'Knip',
  auditTools.knip,
  'jscpd',
  auditTools.jscpd,
  authority.workspaceBootstrapBrowserDirectory,
  authority.workspaceBootstrapAuditToolsDirectory,
  authority.hostProbeWorkflow,
]) {
  if (!completenessDocument.includes(expected)) {
    fail(`completeness document is missing governed value: ${expected}`);
  }
}

console.log(
  `Toolchain completeness OK: quality=${qualityPackages.size}; audit=Knip ${auditTools.knip}/jscpd ${auditTools.jscpd}; browser=Chromium; pnpm-runtime=bundled; host=linux/windows/macos.`,
);
