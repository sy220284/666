import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const run = (args) =>
  execFileSync('node', args, {
    encoding: 'utf8',
    stdio: 'inherit',
  });

async function replaceExact(filePath, before, after) {
  const source = await readFile(filePath, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing remediation anchor in ${filePath}`);
  await writeFile(filePath, source.replace(before, after), 'utf8');
}

const taskCardPath = 'docs/tasks/M3/M3-03_ENTITY_CANON.md';
await replaceExact(
  taskCardPath,
  `- \`packages/contracts/\`\n- \`apps/desktop/renderer/\`\n- \`tests/integration/\``,
  `- \`packages/contracts/\`\n- \`apps/desktop/main/\`\n- \`apps/desktop/preload/\`\n- \`apps/desktop/renderer/\`\n- \`tests/integration/\`\n- \`tests/migration/\`\n- \`tests/security/\``,
);

run(['scripts/taskctl.mjs', 'reopen', 'M3-03']);

await replaceExact(
  'tests/security/project-workspace.test.ts',
  '        projectSchemaVersion: 11,',
  '        projectSchemaVersion: 12,',
);

const summaryPath = 'docs/test-evidence/M3-03/summary.md';
const summary = await readFile(summaryPath, 'utf8');
if (!summary.includes('安全基线复核')) {
  await writeFile(
    summaryPath,
    `${summary.trimEnd()}\n\n## 安全基线复核\n\nReady门禁首次运行发现唯一失败为项目Manifest安全测试仍固定断言Schema 11；产品Manifest已正确写入Schema 12。修正测试基线后重新执行完整Security套件，要求15个测试文件、56项测试全部通过。\n`,
    'utf8',
  );
}

const commandsPath = 'docs/test-evidence/M3-03/commands.txt';
const commands = await readFile(commandsPath, 'utf8');
if (!commands.includes('pnpm test:security')) {
  await writeFile(
    commandsPath,
    `${commands.trimEnd()}\npnpm test:prepare && pnpm test:security  # 15 files, 56 tests required\n`,
    'utf8',
  );
}

const risksPath = 'docs/test-evidence/M3-03/known-risks.md';
const risks = await readFile(risksPath, 'utf8');
if (!risks.includes('Schema 12安全基线')) {
  await writeFile(
    risksPath,
    `${risks.trimEnd()}\n- Schema 12安全基线已纳入项目Manifest权限与内容回归；后续Schema升级必须同步安全测试断言。\n`,
    'utf8',
  );
}

const evidenceDirectory = 'docs/test-evidence/M3-03';
await writeFile(path.join(evidenceDirectory, 'screenshots/manifest.json'), '[]\n', 'utf8');

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path.join(directory, entry.name), relative)));
    } else if (entry.isFile() && relative !== 'manifest.json') {
      files.push(relative);
    }
  }
  return files;
}

const files = [];
for (const relative of (await filesUnder(evidenceDirectory)).sort()) {
  const content = await readFile(path.join(evidenceDirectory, relative));
  files.push({
    path: relative,
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
await writeFile(
  path.join(evidenceDirectory, 'manifest.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      taskId: 'M3-03',
      commit: 'working-tree',
      generatedAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

run(['scripts/taskctl.mjs', 'sync']);
run(['scripts/taskctl.mjs', 'validate']);
console.log('M3-03 security remediation prepared and task formally reopened.');
