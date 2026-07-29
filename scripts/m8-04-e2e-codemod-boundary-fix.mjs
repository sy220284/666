import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'scripts/m8-04-e2e-onboarding-codemod.mjs';
const source = await readFile(filePath, 'utf8');
const before = `  const remainingChannelBlocks = migrated
    .split("await page.locator('[data-create-project]').click();")
    .slice(1)
    .filter((block) => {
      const beforeConfirm = block.split("await page.locator('[data-confirm-create-project]').click();")[0] ?? '';
      return usesLegacyChannelInput(beforeConfirm.split('\\n'));
    });
  if (remainingChannelBlocks.length > 0) {
    throw new Error(\`\${fileName}仍有\${remainingChannelBlocks.length}个旧创建流程未迁移。\`);
  }`;
const after = `  const migratedLines = migrated.split('\\n');
  let remainingChannelBlocks = 0;
  for (let index = 0; index < migratedLines.length; index += 1) {
    if (!migratedLines[index].includes("await page.locator('[data-create-project]').click();")) continue;
    const block = [];
    for (let candidate = index + 1; candidate < Math.min(migratedLines.length, index + 200); candidate += 1) {
      if (migratedLines[candidate].startsWith('test(')) break;
      if (migratedLines[candidate].includes("await page.locator('[data-confirm-create-project]').click();")) break;
      block.push(migratedLines[candidate]);
    }
    if (usesLegacyChannelInput(block)) remainingChannelBlocks += 1;
  }
  if (remainingChannelBlocks > 0) {
    throw new Error(\`\${fileName}仍有\${remainingChannelBlocks}个旧创建流程未迁移。\`);
  }`;
if (source.includes(after)) {
  console.log('桌面迁移自检边界已经修正。');
} else {
  if (!source.includes(before)) throw new Error('缺少桌面迁移旧自检片段。');
  await writeFile(filePath, source.replace(before, after), 'utf8');
  console.log('已将桌面迁移自检限定在单条测试内。');
}
