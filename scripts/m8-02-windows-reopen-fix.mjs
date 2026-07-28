import { readFile, writeFile } from 'node:fs/promises';

const file = 'tests/e2e/electron-shell.spec.ts';
const content = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
const before = `    await page.locator('[data-back-project]').click();
    await page.locator('[data-close-project]').click();
    await page.locator('[data-open-recent]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();`;
const after = `    await page.locator('[data-back-project]').click();
    await expect(page.locator('[data-draft-workspace]')).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
            .worldforge;
          const active = await bridge.project.getActive();
          if (!active.ok || !active.data) return null;
          const continuation = await bridge.project.getContinuation(active.data.projectId);
          return continuation.ok ? continuation.data : null;
        }),
      )
      .toMatchObject({ status: 'ready', chapterTitle: '第一章', panel: 'editor' });
    await page.locator('[data-close-project]').click();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
            .worldforge;
          const active = await bridge.project.getActive();
          return active.ok ? active.data : 'error';
        }),
      )
      .toBeNull();
    const recent = page.locator('[data-open-recent]');
    await expect(recent).toBeVisible();
    await expect(recent).toBeEnabled();
    await recent.click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-draft-workspace]')).toBeVisible({ timeout: 15_000 });`;
const count = content.split(before).length - 1;
if (count !== 1) throw new Error(`windows reopen timing: expected one match, received ${count}`);
await writeFile(file, content.replace(before, after), 'utf8');
