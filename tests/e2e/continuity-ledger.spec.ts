import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type {
  CommandResult,
  ContinuityCatalog,
  ContinuityListInput,
} from '@worldforge/contracts';

const root = process.cwd();
const temporaryDirectories: string[] = [];

async function launch(userDataPath: string, createParent: string): Promise<ElectronApplication> {
  const args: string[] = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  args.push(path.join(root, 'apps/desktop/main'));
  return electron.launch({
    args,
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
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('loads the continuity ledger through the real Electron process boundary', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('连续性工程');
    await page.locator('[data-project-channel]').fill('悬疑');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const bridgeResult = await page.evaluate(async () => {
      const rootWindow = globalThis as unknown as {
        readonly worldforge: {
          readonly project: {
            getActive(): Promise<CommandResult<{ projectId: string } | null>>;
          };
        };
        readonly worldforgeContinuity: {
          list(input: ContinuityListInput): Promise<CommandResult<ContinuityCatalog>>;
        };
      };
      const active = await rootWindow.worldforge.project.getActive();
      if (!active.ok || !active.data) return { ok: false, reason: 'project' } as const;
      const continuity = await rootWindow.worldforgeContinuity.list({
        projectId: active.data.projectId,
        query: '',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      });
      return continuity.ok
        ? {
            ok: true,
            projectId: continuity.data.projectId,
            counts: [
              continuity.data.entityStates.length,
              continuity.data.timelineEvents.length,
              continuity.data.knowledgeStates.length,
            ],
          }
        : { ok: false, reason: continuity.error.code };
    });
    expect(bridgeResult).toMatchObject({ ok: true, counts: [0, 0, 0] });

    await page.locator('[data-open-continuity]').click();
    await expect(page.locator('[data-continuity-dialog]')).toBeVisible();
    await expect(page.locator('[data-continuity-status]')).toHaveText('项目：连续性工程');
    await expect(page.locator('[data-continuity-results] h3')).toHaveText([
      '动态状态（0）',
      '时间线事件（0）',
      '知情状态（0）',
    ]);
  } finally {
    await closeGracefully(application);
  }
});
