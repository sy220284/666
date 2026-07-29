import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = 'tests/e2e';
const entries = await readdir(directory, { withFileTypes: true });
let changedFiles = 0;
let migratedBlocks = 0;

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) continue;
  const filePath = path.join(directory, entry.name);
  let source = await readFile(filePath, 'utf8');
  const original = source;

  const creationBlock = /(\s*)await page\.locator\('\[data-create-project\]'\)\.click\(\);([\s\S]*?)await page\.locator\('\[data-confirm-create-project\]'\)\.click\(\);/gu;
  source = source.replace(creationBlock, (block, indent, middle) => {
    if (!middle.includes('[data-project-channel]')) return block;
    if (middle.includes('[data-onboarding-dialog-entry=')) return block;
    const blank = middle.includes("[data-project-initial-structure]').selectOption('blank')");
    const entryId = blank ? 'blank' : 'complete';
    let nextMiddle = middle;
    if (blank) {
      nextMiddle = nextMiddle.replace(
        new RegExp(
          `${indent}await page\\.locator\\('\\[data-project-initial-structure\\]'\\)\\.selectOption\\('blank'\\);\\n`,
          'u',
        ),
        '',
      );
    }
    migratedBlocks += 1;
    return `${indent}await page.locator('[data-create-project]').click();\n${indent}await page.locator('[data-onboarding-dialog-entry="${entryId}"]').click();${nextMiddle}${indent}await page.locator('[data-confirm-create-project]').click();`;
  });

  if (entry.name === 'electron-shell.spec.ts') {
    const oldQuickAssertion = `    await expect(\n      page.locator('select[name="creativePath"] option[value="ai-first"]'),\n    ).toHaveAttribute('disabled', '');`;
    const newQuickAssertion = `    await expect(\n      page.locator('select[name="creativePath"] option[value="ai-first"]'),\n    ).toHaveCount(0);`;
    if (!source.includes(oldQuickAssertion)) {
      throw new Error('电子桌面向导用例缺少快速开始断言锚点。');
    }
    source = source.replace(oldQuickAssertion, newQuickAssertion);
  }

  if (entry.name === 'provider-settings.spec.ts') {
    const settingsReady = `    await expect(page.locator('[data-provider-settings]')).toBeVisible();`;
    const openAdvanced = `${settingsReady}\n    await page.locator('.provider-advanced-settings > summary').click();`;
    if (!source.includes(settingsReady)) throw new Error('AI连接桌面用例缺少设置就绪锚点。');
    if (!source.includes('.provider-advanced-settings > summary')) {
      source = source.replace(settingsReady, openAdvanced);
    }
  }

  if (source !== original) {
    await writeFile(filePath, source, 'utf8');
    changedFiles += 1;
  }
}

if (migratedBlocks < 20) {
  throw new Error(`预期迁移至少20个旧创建流程，实际仅${migratedBlocks}个。`);
}
console.log(`已迁移${migratedBlocks}个旧创建流程，更新${changedFiles}个桌面测试文件。`);
