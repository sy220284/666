import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const temporaryDirectories: string[] = [];

async function launch(userDataPath: string, createParent: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.join(root, 'apps/desktop/main')],
    env: {
      ...process.env,
      WORLDFORGE_E2E: '1',
      WORLDFORGE_E2E_USER_DATA: userDataPath,
      WORLDFORGE_E2E_CREATE_PARENT: createParent,
    },
  });
}

async function closeGracefully(application: ElectronApplication): Promise<void> {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => {
    setImmediate(() => BrowserWindow.getAllWindows()[0]?.close());
  });
  await closed;
}

async function getNativeWindowHandle(application: ElectronApplication): Promise<string> {
  const handleHex = await application.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getNativeWindowHandle().toString('hex') ?? '',
  );
  const handleBytes = Buffer.from(handleHex, 'hex');
  if (handleBytes.length === 8) return handleBytes.readBigUInt64LE(0).toString();
  if (handleBytes.length === 4) return handleBytes.readUInt32LE(0).toString();
  throw new Error(`M8_07_WINDOWS_IME_NATIVE_HANDLE_INVALID:${handleHex}`);
}

async function invokeNativeIme(
  electronProcessId: number,
  electronWindowHandle: string,
  action: 'candidate' | 'enter' | 'ascii' | 'toggle-shift' | 'undo' | 'redo',
  evidenceLog: string[],
  input: { readonly text?: string; readonly screenshotPath?: string } = {},
): Promise<void> {
  const powershell = path.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const script = path.join(root, 'tests/e2e/m8-07-windows-ime-native.ps1');
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-Sta',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-ElectronProcessId',
    String(electronProcessId),
    '-ElectronWindowHandle',
    electronWindowHandle,
    '-Action',
    action,
  ];
  if (input.text) args.push('-Text', input.text);
  if (input.screenshotPath) args.push('-ScreenshotPath', input.screenshotPath);
  const result = await execFileAsync(powershell, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
  evidenceLog.push(result.stdout.trim());
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('Windows真实Microsoft拼音完成候选、确认、切换、撤销、自动保存、切章、沉浸与恢复', async () => {
  expect(process.platform).toBe('win32');
  test.setTimeout(240_000);

  const evidenceDirectory =
    process.env.WORLDFORGE_WINDOWS_IME_EVIDENCE_DIR ??
    path.join(root, 'test-results', 'windows-ime');
  await mkdir(evidenceDirectory, { recursive: true });
  const candidateScreenshot = path.join(evidenceDirectory, 'microsoft-pinyin-candidate.png');
  const evidenceLog: string[] = [];

  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-07-windows-ime-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });

  let application = await launch(userDataPath, createParent);
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-onboarding-entry="quick"]').click();
    await page.locator('[data-project-name]').fill('Windows真实拼音验收');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible({ timeout: 15_000 });

    const editor = page.locator('.worldforge-editor');
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.click();

    const electronProcessId = application.process().pid;
    const electronWindowHandle = await getNativeWindowHandle(application);
    await invokeNativeIme(electronProcessId, electronWindowHandle, 'candidate', evidenceLog, {
      text: 'zhongwen',
      screenshotPath: candidateScreenshot,
    });
    await expect(editor).toContainText('中文', { timeout: 10_000 });

    await invokeNativeIme(electronProcessId, electronWindowHandle, 'enter', evidenceLog, {
      text: 'shurufa',
    });
    await expect(editor).toContainText('中文输入法', { timeout: 10_000 });

    await invokeNativeIme(electronProcessId, electronWindowHandle, 'toggle-shift', evidenceLog);
    await invokeNativeIme(electronProcessId, electronWindowHandle, 'ascii', evidenceLog, {
      text: 'ABC',
    });
    await expect(editor).toContainText('ABC');

    await invokeNativeIme(electronProcessId, electronWindowHandle, 'toggle-shift', evidenceLog);
    await invokeNativeIme(electronProcessId, electronWindowHandle, 'candidate', evidenceLog, {
      text: 'ceshi',
      screenshotPath: path.join(evidenceDirectory, 'microsoft-pinyin-second-candidate.png'),
    });
    await expect(editor).toContainText('测试', { timeout: 10_000 });

    await editor.click();
    await page.keyboard.press('Control+Z');
    await expect(editor).not.toContainText('测试');
    await page.keyboard.press('Control+Y');
    await expect(editor).toContainText('测试');

    await expect
      .poll(() => page.locator('[data-draft-state]').textContent(), { timeout: 15_000 })
      .toMatch(/已保存|已自动保存|自动保存完成/u);

    const firstChapter = page.locator('[data-chapter-id]').first();
    const firstChapterId = await firstChapter.getAttribute('data-chapter-id');
    expect(firstChapterId).toBeTruthy();
    await page.locator('[data-add-chapter]').first().click();
    await page.locator('[data-structure-title]').fill('输入法切章验收');
    await page.locator('[data-save-structure]').click();
    await expect(page.locator('[data-chapter-title="输入法切章验收"]')).toBeVisible();
    await page.locator('[data-chapter-title="输入法切章验收"] [data-open-chapter]').click();
    await expect(editor).not.toContainText('中文输入法ABC测试');
    await page.locator(`[data-chapter-id="${firstChapterId}"] [data-open-chapter]`).click();
    await expect(editor).toContainText('中文输入法ABC测试');

    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-writing-workbench]')).toHaveAttribute(
      'data-focus-mode',
      'true',
    );
    await expect(editor).toContainText('中文输入法ABC测试');
    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-writing-workbench]')).toHaveAttribute(
      'data-focus-mode',
      'false',
    );

    const screenshotStats = await stat(candidateScreenshot);
    expect(screenshotStats.size).toBeGreaterThan(30_000);

    await closeGracefully(application);
    application = await launch(userDataPath, createParent);
    const restoredPage = await application.firstWindow();
    await restoredPage.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    if ((await restoredPage.locator('[data-writing-workbench]').count()) === 0) {
      if ((await restoredPage.locator('[data-continue-writing]').count()) > 0) {
        await restoredPage.locator('[data-continue-writing]').click();
      } else {
        await restoredPage.locator('[data-open-recent]').first().click();
      }
    }
    await expect(restoredPage.locator('[data-writing-workbench]')).toBeVisible();
    await expect(restoredPage.locator('.worldforge-editor')).toContainText('中文输入法ABC测试');

    const profileEvidence = await readFile(
      path.join(evidenceDirectory, 'microsoft-pinyin-profile.json'),
      'utf8',
    );
    const nativeEvidence = evidenceLog.join('\n');
    expect(profileEvidence).toContain('81D4E9C9-1D3B-41BC-9E6C-4B40BF79E35E');
    expect(profileEvidence).toContain('FA550B04-5AD7-411F-A5AC-CA038EC515D7');
    expect(nativeEvidence).toContain('"activationHresult":"0x00000000"');
    expect(nativeEvidence).toContain('"languageId":"0x0804"');
    await writeFile(
      path.join(evidenceDirectory, 'native-ime-actions.jsonl'),
      `${evidenceLog.filter(Boolean).join('\n')}\n`,
      'utf8',
    );
  } finally {
    if (application) await closeGracefully(application).catch(() => undefined);
  }
});
