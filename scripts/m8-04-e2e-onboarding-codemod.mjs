import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = 'tests/e2e';
const entries = await readdir(directory, { withFileTypes: true });
let changedFiles = 0;
let migratedBlocks = 0;
let recognizedEntryBlocks = 0;

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
    if (!line.includes("await page.locator('[data-create-project]').click();")) {
      result.push(line);
      continue;
    }

    let confirmIndex = -1;
    for (let candidate = index + 1; candidate < Math.min(lines.length, index + 200); candidate += 1) {
      if (lines[candidate].includes("await page.locator('[data-confirm-create-project]').click();")) {
        confirmIndex = candidate;
        break;
      }
      if (lines[candidate].startsWith('test(')) break;
    }
    if (confirmIndex < 0) {
      result.push(line);
      continue;
    }
    const block = lines.slice(index + 1, confirmIndex);
    if (!usesLegacyChannelInput(block)) {
      result.push(line);
      continue;
    }

    const blank = block.some(
      (value) =>
        value.includes("[data-project-initial-structure]')") && value.includes("selectOption('blank')"),
    );
    const indent = line.slice(0, line.indexOf('await'));
    result.push(
      `${indent}await page.locator('[data-onboarding-entry="${blank ? 'blank' : 'complete'}"]').click();`,
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

  recognizedEntryBlocks += (
    migrated.match(/\[data-onboarding-entry="(?:complete|blank)"\]/gu) ?? []
  ).length;

  const remainingChannelBlocks = migrated
    .split("await page.locator('[data-create-project]').click();")
    .slice(1)
    .filter((block) => {
      const beforeConfirm = block.split("await page.locator('[data-confirm-create-project]').click();")[0] ?? '';
      return usesLegacyChannelInput(beforeConfirm.split('\n'));
    });
  if (remainingChannelBlocks.length > 0) {
    throw new Error(`${fileName}仍有${remainingChannelBlocks.length}个旧创建流程未迁移。`);
  }
  if (migrated.includes("[data-project-initial-structure]').selectOption('blank')")) {
    throw new Error(`${fileName}仍在操作空白入口中的禁用初始结构控件。`);
  }
  return migrated;
}

async function updateTextFile(filePath, transform) {
  const source = await readFile(filePath, 'utf8');
  const next = transform(source);
  if (next !== source) {
    await writeFile(filePath, next, 'utf8');
    changedFiles += 1;
  }
}

function replaceIfPresent(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`缺少预期片段：${before.slice(0, 80)}`);
  return source.replace(before, after);
}

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) continue;
  const filePath = path.join(directory, entry.name);
  await updateTextFile(filePath, (original) => {
    let source = migrateCreationBlocks(original, entry.name);

    for (const [before, after] of [
      ["toContainText('health')", "toContainText('身体状态')"],
      ["toContainText('planted')", "toContainText('已埋设')"],
      ["toContainText('author')", "toContainText('已命中')"],
      ["toContainText('AI_CONNECTION_FAILED_003')", "toContainText('无法连接AI服务')"],
      ["toContainText('SceneBeat已保存')", "toContainText('场景节拍已保存')"],
      ["toContainText('当前章节尚无SceneBeat')", "toContainText('当前章节尚无场景节拍')"],
      ["toContainText('导出失败 · EXPORT_TARGET_EXISTS_002')", "toContainText('导出位置已有文件')"],
      ["toContainText('pending')", "toContainText('等待处理')"],
      ["toContainText('accepted')", "toContainText('已采用')"],
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
      if (source.includes(oldQuickAssertion)) source = source.replace(oldQuickAssertion, newQuickAssertion);
      else if (!source.includes(newQuickAssertion)) {
        throw new Error('电子桌面向导用例缺少快速开始断言锚点。');
      }
    }

    if (entry.name === 'provider-settings.spec.ts') {
      const settingsReady = `    await expect(page.locator('[data-provider-settings]')).toBeVisible();`;
      const openAdvanced = `${settingsReady}\n    await page.locator('.provider-advanced-settings > summary').click();`;
      if (!source.includes(settingsReady)) throw new Error('AI连接桌面用例缺少设置就绪锚点。');
      if (!source.includes('.provider-advanced-settings > summary')) {
        source = source.replace(settingsReady, openAdvanced);
      }
    }
    return source;
  });
}

await updateTextFile('apps/desktop/renderer/src/features/home/home-page.tsx', (original) => {
  let source = original;
  source = replaceIfPresent(
    source,
    `            <CreateProjectDialog\n              disclosureMode={props.disclosureMode}\n              entry={entry}`,
    `            <CreateProjectDialog\n              entry={entry}`,
  );
  source = replaceIfPresent(
    source,
    `interface CreateProjectDialogProps {\n  readonly disclosureMode: AppDisclosureMode;\n  readonly entry: OnboardingEntry;`,
    `interface CreateProjectDialogProps {\n  readonly entry: OnboardingEntry;`,
  );
  source = replaceIfPresent(
    source,
    `function CreateProjectDialog({\n  disclosureMode,\n  entry,`,
    `function CreateProjectDialog({\n  entry,`,
  );
  source = replaceIfPresent(
    source,
    `                    defaultValue={\n                      entry === 'blank' || disclosureMode === 'professional' ? 'blank' : 'starter'\n                    }`,
    `                    defaultValue={entry === 'blank' ? 'blank' : 'starter'}`,
  );
  return source;
});

await updateTextFile('apps/desktop/renderer/src/presentation/author-error-message.ts', (original) => {
  if (original.includes('EXPORT_TARGET_EXISTS_002')) return original;
  const anchor = `  AI_MODEL_UNSUPPORTED_010: {\n    title: '当前模型不支持所需能力',\n    message: '该模型无法完成本次生成方式，正文没有被修改。',\n    suggestedAction: '请更换模型或选择其他生成方式。',\n  },`;
  const replacement = `${anchor}\n  EXPORT_TARGET_EXISTS_002: {\n    title: '导出位置已有文件',\n    message: '目标位置已存在同名文件，系统没有覆盖原文件。',\n    suggestedAction: '请选择其他位置，或先处理已有文件。',\n  },`;
  return replaceIfPresent(original, anchor, replacement);
});

await updateTextFile('apps/desktop/renderer/src/features/canon/canon-core-workbench.tsx', (original) => {
  let source = original;
  if (!source.includes("../../presentation/author-status-labels.js")) {
    source = replaceIfPresent(
      source,
      `import { authorErrorSummary } from '../../presentation/author-error-message.js';`,
      `import { authorErrorSummary } from '../../presentation/author-error-message.js';\nimport { authorStatusLabel } from '../../presentation/author-status-labels.js';`,
    );
  }
  source = replaceIfPresent(
    source,
    `<p>pending提案不改变权威状态，必须由作者裁决。</p>`,
    `<p>等待处理的建议不会改变已确认状态，必须由作者决定。</p>`,
  );
  source = replaceIfPresent(
    source,
    `<option disabled={!item.finalVersionId} key={item.id} value={item.id}>`,
    `<option key={item.id} value={item.id}>`,
  );
  source = replaceIfPresent(
    source,
    `? \`裁决失败：\${command.error.code}\`\n          : resource.error\n            ? \`读取失败：\${resource.error.code}\``,
    `? \`裁决失败：\${authorErrorSummary(command.error)}\`\n          : resource.error\n            ? \`读取失败：\${authorErrorSummary(resource.error)}\``,
  );
  source = replaceIfPresent(
    source,
    `<h4>提案批次 · {batch.source}</h4>\n            <p>\n              {batch.status} · {batch.proposalCount} 项 · 历史版本 {batch.sourceVersionId}\n            </p>\n            {batch.generationRunId ? <p>GenerationRun：{batch.generationRunId}</p> : null}`,
    `<h4>建议批次</h4>\n            <p>\n              {authorStatusLabel(batch.status)} · {batch.proposalCount} 项\n            </p>\n            <details>\n              <summary>技术详情</summary>\n              <p>来源：{batch.source}</p>\n              <p>历史版本：{batch.sourceVersionId}</p>\n              {batch.generationRunId ? <p>生成任务：{batch.generationRunId}</p> : null}\n            </details>`,
  );
  source = replaceIfPresent(
    source,
    `<h4>{proposal.proposalType}</h4>\n              <p>\n                {proposal.status} · {proposal.source} · 置信度 {proposal.confidence}\n              </p>\n              <p>原值（来自 Core 权威状态）</p>\n              <pre>{JSON.stringify(proposal.previousValue, null, 2)}</pre>\n              <p>建议值</p>\n              <pre>{JSON.stringify(proposal.proposedValue, null, 2)}</pre>`,
    `<h4>设定更新建议</h4>\n              <p>\n                {authorStatusLabel(proposal.status)} · 置信度 {proposal.confidence}\n              </p>\n              <p>当前已确认值：{authorJsonValue(proposal.previousValue)}</p>\n              <p>建议值：{authorJsonValue(proposal.proposedValue)}</p>\n              <details>\n                <summary>技术详情</summary>\n                <p>类型：{proposal.proposalType}</p>\n                <p>来源：{proposal.source}</p>\n              </details>`,
  );
  source = replaceIfPresent(source, `{anchor.kind} · {anchor.note}`, `内容依据 · {anchor.note}`);
  source = replaceIfPresent(
    source,
    `<p>填写章节内部标识后读取尾快照。</p>`,
    `<p>选择章节后读取章节尾快照。</p>`,
  );
  return source;
});

if (migratedBlocks + recognizedEntryBlocks < 20) {
  throw new Error(
    `预期识别至少20个正式创建流程，实际迁移${migratedBlocks}个，已存在${recognizedEntryBlocks}个。`,
  );
}
console.log(`已迁移${migratedBlocks}个旧创建流程，更新${changedFiles}个文件。`);
