import { expect, type Page } from '@playwright/test';

export async function confirmAuthorDialog(
  page: Page,
  input?: { readonly value: string },
): Promise<void> {
  const dialog = page.locator('[data-author-dialog]');
  await expect(dialog).toBeVisible();
  if (input) await dialog.locator('[data-author-dialog-input]').fill(input.value);
  await dialog.locator('[data-author-dialog-confirm]').click();
}
