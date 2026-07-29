import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = 'tests/e2e';
const entries = await readdir(directory, { withFileTypes: true });
let changedFiles = 0;
let migratedBlocks = 0;

function usesLegacyChannelInput(lines) {
  return lines.some(
    (value) => value.includes('[data-project-channel]') && value.includes('.fill('),
  );
}

function migrateCreationBlocks(source, fileName) {
  const lines = source.split('\n');
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    result.push(line);
    if (!line.includes("await page.locator('[data-create-project]').click();")) continue;

    let confirmIndex = -1;
    for (let candidate = index + 1; candidate < Math.min(lines.length, index + 70); candidate += 1) {
      if (lines[candidate].includes("await page.locator('[data-confirm-create-project]').click();")) {
        confirmIndex = candidate;
        break;
      }
      if (lines[candidate].startsWith('test(')) break;
    }
    if (confirmIndex < 0) continue;
    const block = lines.slice(index + 1, confirmIndex);
    if (!usesLegacyChannelInput(block)) continue;

    const blank = block.some(
      (value) =>
        value.includes("[data-project-initial-structure]')") && value.includes("selectOption('blank')"),
    );
    const indent = line.slice(0, line.indexOf('await'));
    result.push(
      `${indent}await page.locator('[data-onboarding-dialog-entry="${blank ? 'blank' : 'complete'}"]').click();`,
    );
    if (!blank) {
      result.push(
        `${indent}await page.locator('[data-project-initial-structure]').selectOption('starter');`,
      );
    }
    migratedBlocks += 1;
  }

  let migrated = result.join('\n');
  migrated = migrated.replace(
    /^\s*await page\.locator\('\[data-project-initial-structure\]'\)\.selectOption\('blank'\);\n/gmu,
    '',
  );

  const remainingChannelBlocks = migrated
    .split("await page.locator('[data-create-project]').click();")
    .slice(1)
    .filter((block) => {
      const beforeConfirm = block.split("await page.locator('[data-confirm-create-project]').click();")[0] ?? '';
      return (
        usesLegacyChannelInput(beforeConfirm.split('\n')) &&
        !beforeConfirm.includes('[data-onboarding-dialog-entry=')
      );
    });
  if (remainingChannelBlocks.length > 0) {
    throw new Error(`${fileName}仍有${remainingChannelBlocks.length}个旧创建流程未迁移。`);
  }
  if (migrated.includes("[data-project-initial-structure]').selectOption('blank')")) {
    throw new Error(`${fileName}仍在操作空白入口中的禁用初始结构控件。`);
  }
  return migrated;
}

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) continue;
  const filePath = path.join(directory, entry.name);
  let source = await readFile(filePath, 'utf8');
  const original = source;

  source = migrateCreationBlocks(source, entry.name);

  for (const [before, after] of [
    ["toContainText('health')", "toContainText('身体状态')"],
    ["toContainText('planted')", "toContainText('已埋设')"],
    ["toContainText('author')", "toContainText('已命中')"],
    ["toContainText('AI_CONNECTION_FAILED_003')", "toContainText('无法连接AI服务')"],
    ["toContainText('SceneBeat已保存')", "toContainText('场景节拍已保存')"],
    ['/^已手动保存 · Revision \\d+$/u', '/^已手动保存 · 保存序号 \\d+$/u'],
    ['/^自动保存完成 · Revision \\d+$/u', '/^自动保存完成 · 保存序号 \\d+$/u'],
  ]) {
    source = source.replaceAll(before, after);
  }

  if (entry.name === 'electron-shell.spec.ts') {
    const oldQuickAssertion = `    await expect(
      page.locator('select[name="creativePath"] option[value="ai-first"]'),
    ).toHaveAttribute('disabled', '');`;
    const newQuickAssertion = `    await expect(
      page.locator('select[name="creativePath"] option[value="ai-first"]'),
    ).toHaveCount(0);`;
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
