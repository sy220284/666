import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, type Page } from '@playwright/test';

export async function captureAcceptanceScreenshot(
  page: Page,
  taskId: string,
  fileName: string,
): Promise<void> {
  const outputRoot = process.env.WORLDFORGE_E2E_OUTPUT_DIR;
  if (!outputRoot) return;
  const directory = path.join(outputRoot, 'acceptance', taskId);
  await mkdir(directory, { recursive: true });
  const image = await page.screenshot({
    path: path.join(directory, fileName),
    animations: 'disabled',
    fullPage: false,
    scale: 'device',
  });
  expect(image.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(image.byteLength).toBeGreaterThan(10_000);
}
