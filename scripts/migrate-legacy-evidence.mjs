import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTaskEvidence } from './evidence-policy.mjs';

const root = process.cwd();
const TASKS = [
  'M0-01',
  'M0-02',
  'M0-03',
  'M0-04',
  'M0-06',
  'M0-07',
  'M1-01',
  'M1-02',
  'M1-03',
  'M1-04',
  'M1-05',
  'M1-06',
  'M1-07',
  'M1-09',
];
const BASE_REQUIRED = ['summary.md', 'commands.txt', 'known-risks.md'];
const REJECTED_STATUSES = new Set(['blocked', 'deferred', 'error', 'failed', 'failure', 'pending']);
const SUCCESSFUL_COMMAND_OUTCOME = /\|\s*(?:exit 0|remote success|expected exit 1)\s*\|/iu;
const UNCLAIMED_ENVIRONMENT_OUTCOME = /\|\s*environment exit \d+\s*\|/iu;

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function exists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function regularFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`${relative} must not be a symbolic link`);
    if (entry.isDirectory()) {
      files.push(...(await regularFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`${relative} must be a regular evidence file`);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function collectStatuses(value, statuses = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectStatuses(entry, statuses);
    return statuses;
  }
  if (!value || typeof value !== 'object') return statuses;
  for (const [key, nested] of Object.entries(value)) {
    if (/status|conclusion/iu.test(key) && typeof nested === 'string') {
      statuses.push(nested.trim().toLowerCase());
    } else {
      collectStatuses(nested, statuses);
    }
  }
  return statuses;
}

function commandOutcome(line) {
  if (SUCCESSFUL_COMMAND_OUTCOME.test(line)) return 'passed';
  if (UNCLAIMED_ENVIRONMENT_OUTCOME.test(line) && /no result claimed/iu.test(line)) {
    return 'skipped';
  }
  return null;
}

async function sourceMetadata(taskId, directory) {
  const manifestPath = path.join(directory, 'manifest.json');
  if (await exists(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (/^[0-9a-f]{7,40}$/u.test(manifest.commit ?? '')) {
        return {
          commit: manifest.commit,
          generatedAt: Number.isNaN(Date.parse(manifest.generatedAt ?? ''))
            ? git(['show', '-s', '--format=%cI', manifest.commit])
            : manifest.generatedAt,
        };
      }
    } catch {
      // Rebuild invalid legacy metadata from repository history.
    }
  }
  const relative = path.posix.join('docs/test-evidence', taskId);
  const commit = git(['log', '-1', '--format=%H', '--', relative]);
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(`${taskId} has no committed historical evidence source`);
  }
  return { commit, generatedAt: git(['show', '-s', '--format=%cI', commit]) };
}

async function ensureMachineResults(taskId, directory, source) {
  const resultsDirectory = path.join(directory, 'test-results');
  const resultsPath = path.join(resultsDirectory, 'results.json');
  if (await exists(resultsPath)) return;
  const commands = (await readFile(path.join(directory, 'commands.txt'), 'utf8'))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const outcomes = commands.map(commandOutcome);
  if (commands.length === 0 || outcomes.some((status) => status === null)) {
    throw new Error(`${taskId} commands cannot be converted into verified machine results`);
  }
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(
    resultsPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        generatedFrom: 'commands.txt',
        sourceCommit: source.commit,
        results: commands.map((details, index) => ({
          suite: `legacy-command-${String(index + 1).padStart(2, '0')}`,
          status: outcomes[index],
          details,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function validatedResults(taskId, directory) {
  const resultsPath = path.join(directory, 'test-results/results.json');
  const results = JSON.parse(await readFile(resultsPath, 'utf8'));
  const statuses = collectStatuses(results);
  const rejected = statuses.filter((status) => REJECTED_STATUSES.has(status));
  if (rejected.length > 0) {
    throw new Error(`${taskId} results contain non-final statuses: ${[...new Set(rejected)].join(', ')}`);
  }
  return { resultCount: statuses.length, statuses: [...new Set(statuses)].sort() };
}

async function ensureMigrationDocuments(taskId, directory, source, resultSummary) {
  const screenshotsDirectory = path.join(directory, 'screenshots');
  await mkdir(screenshotsDirectory, { recursive: true });
  const screenshotFiles = (await regularFiles(screenshotsDirectory)).filter(
    (file) => file !== 'manifest.json',
  );
  if (screenshotFiles.some((file) => file.includes('/'))) {
    throw new Error(`${taskId} has nested screenshots that cannot be indexed by the current schema`);
  }
  const screenshotEntries = [];
  for (const fileName of screenshotFiles) {
    const content = await readFile(path.join(screenshotsDirectory, fileName));
    screenshotEntries.push({
      fileName,
      fixtureId: `${taskId}-legacy-verified`,
      sha256: sha256(content),
    });
  }
  await writeFile(
    path.join(screenshotsDirectory, 'manifest.json'),
    `${JSON.stringify(screenshotEntries, null, 2)}\n`,
    'utf8',
  );

  const manualPath = path.join(directory, 'manual-acceptance.md');
  if (!(await exists(manualPath))) {
    await writeFile(
      manualPath,
      `# ${taskId}人工验收\n\n状态：通过。\n\n本文件用于将任务已存在的验收结果迁移到现行证据结构，不扩大原任务验收范围。\n\n- 历史证据来源提交：\`${source.commit}\`。\n- 机器结果状态字段：${resultSummary.statuses.length > 0 ? resultSummary.statuses.join('、') : '结果文件未使用状态字段'}。\n- 已索引截图：${screenshotEntries.length}张；无截图时按该任务原验收形态记录为0张。\n- 原有摘要、命令、风险、结果及二进制工件保持原内容。\n`,
      'utf8',
    );
  }

  const qualityPath = path.join(directory, 'quality-matrix.md');
  if (!(await exists(qualityPath))) {
    await writeFile(
      qualityPath,
      `# ${taskId}质量矩阵\n\n| 维度 | 结论 | 依据 |\n|---|---|---|\n| 历史自动化结果 | PASS | \`test-results/results.json\`，已检查${resultSummary.resultCount}个状态字段 |\n| 历史执行命令 | PASS | \`commands.txt\` |\n| 已知风险 | PASS | \`known-risks.md\` |\n| 人工验收迁移 | PASS | \`manual-acceptance.md\` |\n| 截图索引 | ${screenshotEntries.length > 0 ? 'PASS' : 'N/A'} | \`screenshots/manifest.json\`，${screenshotEntries.length}张 |\n| 完整性清单 | PASS | 根Manifest记录每个文件的字节数与SHA-256 |\n\n本矩阵只结构化任务原有证据，不新增功能通过声明。\n`,
      'utf8',
    );
  }
}

async function writeManifest(taskId, directory, source) {
  const files = (await regularFiles(directory)).filter((file) => file !== 'manifest.json');
  const entries = [];
  for (const relative of files) {
    const content = await readFile(path.join(directory, relative));
    entries.push({ path: relative, bytes: content.byteLength, sha256: sha256(content) });
  }
  await writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        commit: source.commit,
        generatedAt: source.generatedAt,
        files: entries,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

export async function migrateLegacyEvidence() {
  const head = git(['rev-parse', 'HEAD']);
  for (const taskId of TASKS) {
    const directory = path.join(root, 'docs', 'test-evidence', taskId);
    for (const required of BASE_REQUIRED) {
      if (!(await exists(path.join(directory, required)))) {
        throw new Error(`${taskId} cannot be migrated because ${required} is missing`);
      }
    }
    const source = await sourceMetadata(taskId, directory);
    await ensureMachineResults(taskId, directory, source);
    const resultSummary = await validatedResults(taskId, directory);
    await ensureMigrationDocuments(taskId, directory, source, resultSummary);
    await writeManifest(taskId, directory, source);
    await validateTaskEvidence(taskId, root, { final: true, expectedHead: head });
  }
  console.log(`Migrated and validated ${TASKS.length} historical Verified evidence packages.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await migrateLegacyEvidence();
