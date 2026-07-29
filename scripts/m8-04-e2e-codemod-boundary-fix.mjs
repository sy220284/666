import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'scripts/m8-04-e2e-onboarding-codemod.mjs';
let source = await readFile(filePath, 'utf8');

const oldBoundary = `  const remainingChannelBlocks = migrated
    .split("await page.locator('[data-create-project]').click();")
    .slice(1)
    .filter((block) => {
      const beforeConfirm = block.split("await page.locator('[data-confirm-create-project]').click();")[0] ?? '';
      return usesLegacyChannelInput(beforeConfirm.split('\\n'));
    });
  if (remainingChannelBlocks.length > 0) {
    throw new Error(\`\${fileName}仍有\${remainingChannelBlocks.length}个旧创建流程未迁移。\`);
  }`;
const newBoundary = `  const migratedLines = migrated.split('\\n');
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
if (!source.includes(newBoundary)) {
  if (!source.includes(oldBoundary)) throw new Error('缺少桌面迁移旧自检片段。');
  source = source.replace(oldBoundary, newBoundary);
}

const oldDialogSelector = `\${indent}await page.locator('[data-onboarding-entry="\${blank ? 'blank' : 'complete'}"]').click();`;
const newDialogSelector = `\${indent}await page.locator('[data-onboarding-dialog-entry="\${blank ? 'blank' : 'complete'}"]').click();`;
if (!source.includes(newDialogSelector)) {
  if (!source.includes(oldDialogSelector)) throw new Error('缺少旧创建入口选择器。');
  source = source.replace(oldDialogSelector, newDialogSelector);
}
source = source.replace(
  `migrated.match(/\\[data-onboarding-entry="(?:complete|blank)"\\]/gu) ?? []`,
  `migrated.match(/\\[data-onboarding-(?:dialog-)?entry="(?:complete|blank)"\\]/gu) ?? []`,
);

const assertionAnchor = `    if (entry.name === 'electron-shell.spec.ts') {`;
const multilineReplacement = `    source = source.replace(
      /toContainText\\(\\s*['"]导出失败 · EXPORT_TARGET_EXISTS_002['"]\\s*,?\\s*\\)/gu,
      "toContainText('导出位置已有文件')",
    );

${assertionAnchor}`;
if (!source.includes(multilineReplacement)) {
  if (!source.includes(assertionAnchor)) throw new Error('缺少桌面断言迁移锚点。');
  source = source.replace(assertionAnchor, multilineReplacement);
}

await writeFile(filePath, source, 'utf8');
console.log('已修正桌面迁移边界、弹窗入口和跨行断言。');
