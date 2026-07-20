import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export interface EvidenceCommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly durationMilliseconds: number;
  readonly fixtureIds: readonly string[];
}

export interface EvidenceTestResult {
  readonly suite: string;
  readonly fixtureId: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly details?: string;
}

export interface PerformanceEvidenceRecord {
  readonly taskId: string;
  readonly commit: string;
  readonly environment: {
    readonly os: string;
    readonly cpu: string;
    readonly memoryGb: number;
    readonly display: string;
  };
  readonly dataset: string;
  readonly metric: string;
  readonly samples: number;
  readonly result: number;
  readonly budget: number;
  readonly passed: boolean;
}

export interface EvidenceScreenshotInput {
  readonly fileName: string;
  readonly fixtureId: string;
  readonly content: Uint8Array;
}

export interface TestEvidenceInput {
  readonly taskId: string;
  readonly commit: string;
  readonly generatedAt: string;
  readonly summary: string;
  readonly manualAcceptance: string;
  readonly qualityMatrix: string;
  readonly commands: readonly EvidenceCommandResult[];
  readonly testResults: readonly EvidenceTestResult[];
  readonly screenshots?: readonly EvidenceScreenshotInput[];
  readonly performance?: readonly PerformanceEvidenceRecord[];
  readonly knownRisks: readonly string[];
}

export interface WriteTestEvidenceOptions {
  readonly overwrite?: boolean;
}

export interface WrittenEvidenceFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface WrittenTestEvidence {
  readonly outputDirectory: string;
  readonly files: readonly WrittenEvidenceFile[];
}

const credentialPatterns = [
  /gh[pousr]_[A-Za-z0-9]{20,}/i,
  /\bsk-[A-Za-z0-9_-]{20,}/i,
  /(?:authorization|api[-_ ]?key)\s*[:=]\s*(?:bearer\s+)?[^\s,;]{12,}/i,
];

function assertNoCredentials(value: string): void {
  if (credentialPatterns.some((pattern) => pattern.test(value))) {
    throw new Error('EVIDENCE_SECRET_DETECTED: evidence cannot contain credentials.');
  }
}

function safeScreenshotName(value: string): string {
  if (
    value.length === 0 ||
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..' ||
    path.basename(value) !== value
  ) {
    throw new Error('Evidence screenshot fileName must be a safe basename.');
  }
  return value;
}

function validateInput(input: TestEvidenceInput): void {
  if (!/^[A-Z][A-Z0-9]*-\d{2,}$/.test(input.taskId)) {
    throw new Error('Evidence taskId must use the repository task ID format.');
  }
  if (!/^(?:[a-f0-9]{7,40}|working-tree)$/.test(input.commit)) {
    throw new Error('Evidence commit must be a Git SHA or working-tree.');
  }
  if (!Number.isFinite(new Date(input.generatedAt).getTime())) {
    throw new Error('Evidence generatedAt must be an ISO-compatible timestamp.');
  }
  if (!input.manualAcceptance.trim() || !input.qualityMatrix.trim()) {
    throw new Error('Evidence requires explicit manual acceptance and quality matrix content.');
  }
  for (const command of input.commands) {
    if (!Number.isSafeInteger(command.exitCode)) {
      throw new Error('Evidence command exit codes must be integers.');
    }
    if (!Number.isFinite(command.durationMilliseconds) || command.durationMilliseconds < 0) {
      throw new Error('Evidence command durations must be non-negative.');
    }
  }
  for (const record of input.performance ?? []) {
    if (record.taskId !== input.taskId || record.commit !== input.commit) {
      throw new Error('Performance evidence must identify the same task and commit.');
    }
  }
  const screenshotNames = new Set<string>();
  for (const screenshot of input.screenshots ?? []) {
    const fileName = safeScreenshotName(screenshot.fileName);
    if (screenshotNames.has(fileName)) {
      throw new Error(`Evidence screenshot fileName is duplicated: ${fileName}`);
    }
    screenshotNames.add(fileName);
  }
  assertNoCredentials(
    JSON.stringify({
      ...input,
      screenshots: input.screenshots?.map(({ fileName, fixtureId }) => ({ fileName, fixtureId })),
    }),
  );
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderSummary(input: TestEvidenceInput): string {
  const passed = input.testResults.filter((result) => result.status === 'passed').length;
  const failed = input.testResults.filter((result) => result.status === 'failed').length;
  const skipped = input.testResults.filter((result) => result.status === 'skipped').length;
  const testRows = input.testResults.length
    ? input.testResults
        .map(
          (result) =>
            `| ${result.suite} | ${result.fixtureId} | ${result.status} | ${result.details ?? '-'} |`,
        )
        .join('\n')
    : '| - | - | 未记录 | - |';
  const performanceRows = (input.performance ?? []).length
    ? (input.performance ?? [])
        .map(
          (record) =>
            `| ${record.metric} | ${record.result} | ${record.budget} | ${record.passed ? 'PASS' : 'FAIL'} |`,
        )
        .join('\n')
    : '| - | - | - | 未记录 |';

  return (
    `# ${input.taskId} 验证摘要\n\n` +
    `生成时间：${input.generatedAt}  \n` +
    `来源提交：${input.commit}\n\n` +
    `${input.summary.trim()}\n\n` +
    `## 自动化结果\n\n` +
    `- 通过：${passed}\n` +
    `- 失败：${failed}\n` +
    `- 跳过：${skipped}\n\n` +
    `| 套件 | Fixture | 状态 | 说明 |\n|---|---|---|---|\n${testRows}\n\n` +
    `## 性能记录\n\n| 指标 | 结果 | 预算 | 结论 |\n|---|---:|---:|---|\n${performanceRows}\n`
  );
}

function renderCommands(commands: readonly EvidenceCommandResult[]): string {
  if (commands.length === 0) return 'No commands recorded.\n';
  return `${commands
    .map(
      (command) =>
        `${command.command}\nexit=${command.exitCode} duration_ms=${command.durationMilliseconds} fixtures=${command.fixtureIds.join(',') || '-'}\n`,
    )
    .join('\n')}\n`;
}

function renderKnownRisks(risks: readonly string[]): string {
  return `# 已知风险\n\n${risks.length === 0 ? '- 无。' : risks.map((risk) => `- ${risk}`).join('\n')}\n`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string, relativeDirectory = ''): Promise<string[]> {
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Evidence directories may not contain symlinks.');
    if (entry.isDirectory()) files.push(...(await listFiles(directory, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
    else throw new Error('Evidence directories may only contain regular files.');
  }
  return files;
}

async function inventory(directory: string): Promise<WrittenEvidenceFile[]> {
  const files = await listFiles(directory);
  return Promise.all(
    files.map(async (relativePath) => {
      const content = await readFile(path.join(directory, relativePath));
      return {
        path: relativePath.replaceAll(path.sep, '/'),
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    }),
  );
}

async function writePrivateText(target: string, content: string): Promise<void> {
  assertNoCredentials(content);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, content, { encoding: 'utf8', mode: 0o600 });
}

async function writeScreenshots(
  staging: string,
  screenshots: readonly EvidenceScreenshotInput[],
): Promise<void> {
  const directory = path.join(staging, 'screenshots');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const manifest = [];
  for (const screenshot of screenshots) {
    const fileName = safeScreenshotName(screenshot.fileName);
    const content = Buffer.from(screenshot.content);
    await writeFile(path.join(directory, fileName), content, { mode: 0o600 });
    manifest.push({
      fileName,
      fixtureId: screenshot.fixtureId,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  await writePrivateText(path.join(directory, 'manifest.json'), json(manifest));
}

export async function writeTestEvidence(
  outputDirectory: string,
  input: TestEvidenceInput,
  options: WriteTestEvidenceOptions = {},
): Promise<WrittenTestEvidence> {
  validateInput(input);
  const target = path.resolve(outputDirectory);
  const parent = path.dirname(target);
  const name = path.basename(target);
  if (name.length === 0 || name === path.parse(target).root) {
    throw new Error('Evidence output must be a named directory.');
  }
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if ((await exists(target)) && !options.overwrite) {
    throw new Error('Evidence output already exists; pass overwrite to replace it atomically.');
  }

  const staging = await mkdtemp(path.join(parent, `.${name}.stage-`));
  let backup: string | undefined;
  try {
    await Promise.all([
      writePrivateText(path.join(staging, 'summary.md'), renderSummary(input)),
      writePrivateText(path.join(staging, 'commands.txt'), renderCommands(input.commands)),
      writePrivateText(path.join(staging, 'known-risks.md'), renderKnownRisks(input.knownRisks)),
      writePrivateText(
        path.join(staging, 'manual-acceptance.md'),
        `${input.manualAcceptance.trim()}\n`,
      ),
      writePrivateText(path.join(staging, 'quality-matrix.md'), `${input.qualityMatrix.trim()}\n`),
      writePrivateText(
        path.join(staging, 'test-results', 'results.json'),
        json({
          schemaVersion: 1,
          taskId: input.taskId,
          commit: input.commit,
          generatedAt: input.generatedAt,
          results: input.testResults,
        }),
      ),
      writePrivateText(path.join(staging, 'performance.json'), json(input.performance ?? [])),
      writeScreenshots(staging, input.screenshots ?? []),
    ]);

    const filesBeforeManifest = await inventory(staging);
    await writePrivateText(
      path.join(staging, 'manifest.json'),
      json({
        schemaVersion: 1,
        taskId: input.taskId,
        commit: input.commit,
        generatedAt: input.generatedAt,
        files: filesBeforeManifest,
      }),
    );

    if (await exists(target)) {
      backup = path.join(parent, `.${name}.backup-${randomUUID()}`);
      await rename(target, backup);
    }
    try {
      await rename(staging, target);
    } catch (error) {
      if (backup) await rename(backup, target).catch(() => undefined);
      throw error;
    }
    if (backup) await rm(backup, { recursive: true, force: true });
    return { outputDirectory: target, files: await inventory(target) };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
