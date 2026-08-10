import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
const run = (command, args, options = {}) => {
  console.log(`$ ${command} ${args.join(' ')}`);
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
};
const capture = (command, args) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
const updateJson = (file, mutate) => {
  const value = JSON.parse(read(file));
  mutate(value);
  write(file, `${JSON.stringify(value, null, 2)}\n`);
};
const replaceRequired = (source, from, to, label) => {
  if (!source.includes(from) && !source.includes(to)) {
    throw new Error(`Missing expected token for ${label}: ${from}`);
  }
  return source.replaceAll(from, to);
};

const versions = {
  node: '24.18.1',
  pnpm: '11.21.0',
  nodeTypes: '24.13.3',
  electron: '43.2.0',
  playwright: '1.62.0',
  eslint: '10.8.0',
  prettier: '3.9.6',
  typescriptEslint: '8.65.0',
  typescript: '6.0.3',
};
const pins = {
  checkout: 'de0fac2e4500dabe0009e67214ff5f5447ce83dd',
  setupNode: '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
  pnpmSetup: '0ebf47130e4866e96fce0953f49152a61190b271',
};
const oldPins = {
  checkout: 'd23441a48e516b6c34aea4fa41551a30e30af803',
  setupNode: '249970729cb0ef3589644e2896645e5dc5ba9c38',
  pnpmSetup: 'b906affcce14559ad1aafd4ab0e942779e9f58b1',
};

console.log('== apply manifests ==');
updateJson('package.json', (pkg) => {
  pkg.packageManager = `pnpm@${versions.pnpm}`;
  pkg.engines.node = '>=24.0.0 <25.0.0';
  pkg.engines.pnpm = `>=${versions.pnpm} <12.0.0`;
  pkg.scripts['toolchain:check'] = 'node scripts/toolchain-policy.mjs';
  pkg.scripts['ci:policy'] =
    'node scripts/toolchain-policy.mjs && node scripts/workflow-structure-policy.mjs && node scripts/ci-policy.mjs && node scripts/check-coverage-policy.mjs && node scripts/code-quality-policy.mjs';
  Object.assign(pkg.devDependencies, {
    '@playwright/test': versions.playwright,
    '@types/node': versions.nodeTypes,
    electron: versions.electron,
    eslint: versions.eslint,
    prettier: versions.prettier,
    'typescript-eslint': versions.typescriptEslint,
  });
});
for (const file of [
  'apps/desktop/main/package.json',
  'apps/desktop/preload/package.json',
  'packages/core-service/package.json',
  'packages/testkit/package.json',
]) {
  updateJson(file, (pkg) => {
    if (pkg.devDependencies?.['@types/node']) pkg.devDependencies['@types/node'] = versions.nodeTypes;
    if (pkg.devDependencies?.electron) pkg.devDependencies.electron = versions.electron;
  });
}

write(
  'pnpm-workspace.yaml',
  `packages:\n  - apps/desktop\n  - apps/desktop/*\n  - packages/*\n\nengineStrict: true\npreferFrozenLockfile: true\nstrictPeerDependencies: true\n\nallowBuilds:\n  electron: true\n  esbuild: true\noverrides:\n  brace-expansion: 5.0.9\n  undici: 7.29.0\n\ncatalog:\n  typescript: ${versions.typescript}\n`,
);
if (fs.existsSync(path.join(root, '.npmrc'))) fs.rmSync(path.join(root, '.npmrc'));

updateJson('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json', (authority) => {
  authority.bundledPnpmVersion = versions.pnpm;
  authority.nodeRuntimeVersion = versions.node;
});

let bundle = read('.github/governance/toolchain-bundle.mjs');
if (!bundle.includes("'nodeRuntimeVersion',")) {
  bundle = bundle.replace(
    "    'bundledPnpmVersion',\n",
    "    'bundledPnpmVersion',\n    'nodeRuntimeVersion',\n",
  );
}
if (!bundle.includes('nodeRuntimeVersion: authority.nodeRuntimeVersion')) {
  bundle = bundle.replace(
    '      generator: authority.generator,\n',
    '      generator: authority.generator,\n      nodeRuntimeVersion: authority.nodeRuntimeVersion,\n',
  );
}
write('.github/governance/toolchain-bundle.mjs', bundle);

console.log('== update permanent CI pins ==');
const workflowDir = path.join(root, '.github/workflows');
for (const name of fs.readdirSync(workflowDir)) {
  if (!/\.ya?ml$/u.test(name) || name === 'toolchain-governance-upgrade.yml') continue;
  const file = path.join(workflowDir, name);
  let content = fs.readFileSync(file, 'utf8');
  content = content
    .replaceAll(
      `actions/checkout@${oldPins.checkout} # v6`,
      `actions/checkout@${pins.checkout} # v6.0.2`,
    )
    .replaceAll(
      `pnpm/action-setup@${oldPins.pnpmSetup} # v4`,
      `pnpm/action-setup@${pins.pnpmSetup} # v6.0.9`,
    )
    .replaceAll(
      `actions/setup-node@${oldPins.setupNode} # v6`,
      `actions/setup-node@${pins.setupNode} # v6.4.0`,
    )
    .replaceAll('node-version: 24\n', `node-version: ${versions.node}\n`)
    .replace(/\n([ \t]+)with:\n\1  version: 11\.13\.1\n/gu, '\n');
  fs.writeFileSync(file, content);
}

for (const file of [
  'scripts/ci-policy.mjs',
  'scripts/workflow-structure-policy.mjs',
  'tests/unit/workflow-structure-policy.test.ts',
]) {
  let content = read(file);
  content = content
    .replaceAll(oldPins.checkout, pins.checkout)
    .replaceAll(oldPins.setupNode, pins.setupNode)
    .replaceAll(oldPins.pnpmSetup, pins.pnpmSetup);
  write(file, content);
}
let auditBaseline = read('tests/unit/m10-full-code-audit-baseline.test.ts');
auditBaseline = auditBaseline.replace("toBe('pnpm@11.13.1')", `toBe('pnpm@${versions.pnpm}')`);
write('tests/unit/m10-full-code-audit-baseline.test.ts', auditBaseline);

console.log('== write permanent drift policy ==');
write(
  'scripts/toolchain-policy.mjs',
  `import { readFile, readdir } from 'node:fs/promises';\nimport path from 'node:path';\n\nconst root = process.cwd();\nconst readText = (file) => readFile(path.join(root, file), 'utf8');\nconst readJson = async (file) => JSON.parse(await readText(file));\nconst fail = (message) => { throw new Error(\`TOOLCHAIN_POLICY: \${message}\`); };\n\nconst rootPackage = await readJson('package.json');\nconst authority = await readJson('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json');\nconst expectedPnpm = authority.bundledPnpmVersion;\nconst expectedNode = authority.nodeRuntimeVersion;\nconst expectedNodeTypes = rootPackage.devDependencies['@types/node'];\nconst expectedElectron = rootPackage.devDependencies.electron;\n\nif (rootPackage.packageManager !== \`pnpm@\${expectedPnpm}\`) fail(\`packageManager \${rootPackage.packageManager} != pnpm@\${expectedPnpm}\`);\nif (!rootPackage.engines.node.includes('>=24.0.0') || !rootPackage.engines.node.includes('<25.0.0')) fail(\`Node engine is not constrained to Node 24: \${rootPackage.engines.node}\`);\nif (!rootPackage.engines.pnpm.includes(expectedPnpm) || !rootPackage.engines.pnpm.includes('<12.0.0')) fail(\`pnpm engine does not match governed v11 baseline: \${rootPackage.engines.pnpm}\`);\n\nconst workspace = await readText('pnpm-workspace.yaml');\nfor (const setting of ['engineStrict: true', 'preferFrozenLockfile: true', 'strictPeerDependencies: true', 'minimumReleaseAge: 1440']) {\n  if (!workspace.includes(setting)) fail(\`missing pnpm workspace setting: \${setting}\`);\n}\nfor (const file of ['apps/desktop/main/package.json', 'apps/desktop/preload/package.json', 'packages/core-service/package.json', 'packages/testkit/package.json']) {\n  const pkg = await readJson(file);\n  if (pkg.devDependencies?.['@types/node'] && pkg.devDependencies['@types/node'] !== expectedNodeTypes) fail(\`\${file} @types/node \${pkg.devDependencies['@types/node']} != \${expectedNodeTypes}\`);\n  if (pkg.devDependencies?.electron && pkg.devDependencies.electron !== expectedElectron) fail(\`\${file} electron \${pkg.devDependencies.electron} != \${expectedElectron}\`);\n}\nconst workflowsDir = path.join(root, '.github/workflows');\nfor (const name of await readdir(workflowsDir)) {\n  if (!/\\.ya?ml$/u.test(name)) continue;\n  const lines = (await readFile(path.join(workflowsDir, name), 'utf8')).split('\\n');\n  for (let index = 0; index < lines.length; index += 1) {\n    if (lines[index].includes('node-version:') && !lines[index].includes(expectedNode)) fail(\`\${name} uses a Node runtime other than \${expectedNode}: \${lines[index].trim()}\`);\n    if (!lines[index].includes('pnpm/action-setup@')) continue;\n    const stepIndent = lines[index].search(/\\S/u);\n    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {\n      const trimmed = lines[cursor].trim();\n      const indent = lines[cursor].search(/\\S/u);\n      if (trimmed.startsWith('- ') && indent === stepIndent) break;\n      if (/^version:/u.test(trimmed)) fail(\`\${name} duplicates pnpm version instead of packageManager\`);\n    }\n  }\n}\nconsole.log(\`Toolchain policy OK: Node \${expectedNode}; pnpm \${expectedPnpm}; @types/node \${expectedNodeTypes}; Electron \${expectedElectron}.\`);\n`,
);

console.log('== update authority documentation ==');
let doc = read('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md');
for (const [from, to] of [
  ['> 状态：Approved  ', '> 状态：Approved（仓库基线已升级；持久化快照待重新导出）  '],
  ['文档日期：2026-08-05', '文档日期：2026-08-10'],
  ['## 3. 工具版本', '## 3. 仓库权威目标版本'],
  ['| Node.js | 24.18.0 |', `| Node.js | ${versions.node} |`],
  ['| pnpm | 11.13.1 |', `| pnpm | ${versions.pnpm} |`],
  ['| Prettier | 3.9.5 |', `| Prettier | ${versions.prettier} |`],
  ['| ESLint | 10.7.0 |', `| ESLint | ${versions.eslint} |`],
  ['| typescript-eslint | 8.64.0 |', `| typescript-eslint | ${versions.typescriptEslint} |`],
  ['| Electron | 43.1.1 |', `| Electron | ${versions.electron} |`],
  ['| Playwright | 1.61.1 |', `| Playwright | ${versions.playwright} |`],
  [
    '仓库当前要求Node `>=24.0.0`、pnpm `>=11.0.0`，并在`package.json`中锁定pnpm 11.13.1。',
    `仓库当前要求Node \`>=24.0.0 <25.0.0\`、pnpm \`>=${versions.pnpm} <12.0.0\`，并在\`package.json\`中锁定pnpm ${versions.pnpm}。`,
  ],
]) {
  doc = replaceRequired(doc, from, to, 'CURRENT_WORKSPACE_TOOLCHAIN.md');
}
const section = `## 3.1 2026-08-10 工具链治理升级\n\n仓库权威基线升级为 Node.js ${versions.node} LTS、pnpm ${versions.pnpm}、Electron ${versions.electron}、Playwright ${versions.playwright}、ESLint ${versions.eslint}、Prettier ${versions.prettier}、typescript-eslint ${versions.typescriptEslint}。\`@types/node\` 固定到 Node 24 类型线 ${versions.nodeTypes}；TypeScript 保持 ${versions.typescript}，继续处于 typescript-eslint 当前支持范围内。\n\n项目级 pnpm 配置统一迁入 \`pnpm-workspace.yaml\`：\`engineStrict\`、\`preferFrozenLockfile\`、\`strictPeerDependencies\` 由 workspace 文件声明。此次治理迁移先按已核验稳定版本重建锁文件，随后启用 \`minimumReleaseAge: 1440\`；从下一次依赖解析开始，默认延迟采用发布时间不足 24 小时的新包。紧急安全升级如需绕过，只允许精确版本的一次性例外。原仅承载这三项设置的 \`.npmrc\` 删除。\n\nGitHub Actions 固定到 checkout v6.0.2、pnpm/action-setup v6.0.9、setup-node v6.4.0 的完整提交 SHA。永久 workflow 不再重复声明 pnpm 版本，由根 \`package.json#packageManager\` 提供；Node CI 运行时固定为 ${versions.node}。当前仍保留 pnpm/action-setup，暂不迁移到 pnpm/setup，以避免 pnpm 11 在 Intel macOS 独立二进制上的兼容边界影响现有跨平台打包矩阵。\n\n新增 \`pnpm toolchain:check\` 并接入 \`pnpm ci:policy\`，持续检查 packageManager、Node 运行时、工具链权威清单、pnpm workspace 安全设置、重复依赖版本及 workflow 版本来源，防止后续再次漂移。\n\n### 持久化工作空间状态\n\n本节版本表描述升级后的**仓库权威目标基线**。\`/mnt/data/666-toolchain\` 与 \`/mnt/data/666-workspace-dependencies\` 中此前导出的 2026-08-05 快照在新的 \`pnpm-lock.yaml\` 生成后视为 **STALE**，不得继续恢复到升级后的仓库。必须从新锁文件重新导出工具链 Artifact、校验 Hash、完成离线复验后，才能替换持久化工作空间资产；旧快照只用于历史追溯。\n\n`;
if (!doc.includes('## 3.1 2026-08-10 工具链治理升级')) {
  doc = doc.replace('## 4. 激活方式', `${section}## 4. 激活方式`);
}
write('docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md', doc);

console.log('== regenerate lockfile ==');
run('pnpm', ['install', '--lockfile-only']);
let workspace = read('pnpm-workspace.yaml');
workspace = workspace.replace(
  'strictPeerDependencies: true\n',
  'strictPeerDependencies: true\nminimumReleaseAge: 1440\n',
);
write('pnpm-workspace.yaml', workspace);
run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline']);
run('pnpm', ['format']);

console.log('== validate ==');
for (const [command, args] of [
  ['pnpm', ['toolchain:check']],
  ['pnpm', ['ci:policy']],
  ['pnpm', ['format:check']],
  ['pnpm', ['lint']],
  ['pnpm', ['typecheck']],
  ['pnpm', ['test:unit']],
  ['pnpm', ['test:integration']],
  ['pnpm', ['test:migration']],
  ['pnpm', ['test:security']],
  ['pnpm', ['test:coverage']],
  ['pnpm', ['build']],
  ['pnpm', ['test:e2e']],
  ['pnpm', ['package']],
  ['pnpm', ['release:check']],
]) run(command, args);

console.log('== record verification ==');
const actual = {
  node: capture('node', ['--version']),
  npm: capture('npm', ['--version']),
  pnpm: capture('pnpm', ['--version']),
  prettier: capture('pnpm', ['exec', 'prettier', '--version']),
  eslint: capture('pnpm', ['exec', 'eslint', '--version']),
  typescript: capture('pnpm', ['exec', 'tsc', '--version']),
  playwright: capture('pnpm', ['exec', 'playwright', '--version']),
  electron: capture('pnpm', ['exec', 'electron', '--version']),
};
write(
  'docs/process/TOOLCHAIN_UPGRADE_2026-08-10.md',
  `# 2026-08-10 工具链治理升级验证记录\n\n状态：VERIFIED\n\n基线提交来源：main@c774f981a345c8d515bb54d1bbc908e0e4eb1731\n治理分支：chore/toolchain-governance-20260810\n验证环境：GitHub Actions ubuntu-24.04\n\n## 实际工具版本\n\n- Node.js: ${actual.node}\n- npm: ${actual.npm}\n- pnpm: ${actual.pnpm}\n- Prettier: ${actual.prettier}\n- ESLint: ${actual.eslint}\n- TypeScript: ${actual.typescript}\n- Playwright: ${actual.playwright}\n- Electron: ${actual.electron}\n\n## 已通过验证\n\n- pnpm install --lockfile-only\n- pnpm install --frozen-lockfile --prefer-offline\n- pnpm toolchain:check\n- pnpm ci:policy\n- pnpm format:check\n- pnpm lint\n- pnpm typecheck\n- pnpm test:unit\n- pnpm test:integration\n- pnpm test:migration\n- pnpm test:security\n- pnpm test:coverage\n- pnpm build\n- pnpm test:e2e\n- pnpm package\n- pnpm release:check\n\n## 结论\n\n新依赖锁文件、Node/pnpm 运行基线、GitHub Actions 固定版本、pnpm 项目级配置和工具链权威文档已完成 Ubuntu 治理验证。Windows/macOS 跨平台打包矩阵仍由正式 PR Quality/Release 工作流执行。旧 /mnt/data 离线工具快照因锁文件改变必须视为 STALE，待依据新锁文件重新导出并复验后才能替换。\n`,
);

for (const file of [
  '.toolchain-governance-runner-ok',
  '.toolchain-governance-failure.log',
  '.github/workflows/toolchain-governance-upgrade.yml',
  'scripts/toolchain-governance-upgrade-runner.mjs',
]) {
  const absolute = path.join(root, file);
  if (fs.existsSync(absolute)) fs.rmSync(absolute);
}
console.log('TOOLCHAIN_GOVERNANCE_UPGRADE_VERIFIED');
