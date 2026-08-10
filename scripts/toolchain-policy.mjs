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

if (rootPackage.packageManager !== `pnpm@${expectedPnpm}`)
  fail(`packageManager ${rootPackage.packageManager} != pnpm@${expectedPnpm}`);
if (
  !rootPackage.engines.node.includes('>=24.0.0') ||
  !rootPackage.engines.node.includes('<25.0.0')
)
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

const bundleGenerator = await readText(authority.generator);
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
  `Toolchain policy OK: Node ${expectedNode}; pnpm ${expectedPnpm}; @types/node ${expectedNodeTypes}; Electron ${expectedElectron}.`,
);
