import { expect, type Page } from '@playwright/test';

export interface AccessibilityDomSnapshot {
  readonly positiveTabIndexes: readonly string[];
  readonly missingImageAlt: readonly string[];
  readonly ariaHiddenFocusable: readonly string[];
  readonly duplicateIds: readonly string[];
}

export interface AccessibilityViolation {
  readonly rule: 'positive-tabindex' | 'image-alt' | 'aria-hidden-focusable' | 'duplicate-id';
  readonly target: string;
}

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="tab"]',
  '[role="menuitem"]',
].join(', ');

export function auditAccessibilityDomSnapshot(
  snapshot: AccessibilityDomSnapshot,
): readonly AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = [];
  for (const target of snapshot.positiveTabIndexes) {
    violations.push({ rule: 'positive-tabindex', target });
  }
  for (const target of snapshot.missingImageAlt) {
    violations.push({ rule: 'image-alt', target });
  }
  for (const target of snapshot.ariaHiddenFocusable) {
    violations.push({ rule: 'aria-hidden-focusable', target });
  }
  for (const target of snapshot.duplicateIds) {
    violations.push({ rule: 'duplicate-id', target });
  }
  return violations.sort((left, right) =>
    `${left.rule}:${left.target}`.localeCompare(`${right.rule}:${right.target}`),
  );
}

export async function collectAccessibilityDomSnapshot(
  page: Page,
): Promise<AccessibilityDomSnapshot> {
  return page.evaluate(() => {
    const describe = (element: Element): string => {
      const html = element as HTMLElement;
      const dataAttribute = Array.from(element.attributes).find((attribute) =>
        attribute.name.startsWith('data-'),
      );
      let suffix = '';
      if (html.id) {
        suffix = `#${html.id}`;
      } else if (dataAttribute) {
        suffix = `[${dataAttribute.name}]`;
      } else if (html.classList.length > 0) {
        suffix = `.${html.classList.item(0) ?? ''}`;
      }
      return `${element.tagName.toLowerCase()}${suffix}`;
    };

    const positiveTabIndexes = Array.from(document.querySelectorAll<HTMLElement>('[tabindex]'))
      .filter((element) => element.tabIndex > 0)
      .map(describe);

    const missingImageAlt = Array.from(document.querySelectorAll('img:not([alt])')).map(describe);

    const focusableSelector =
      'a[href], button, input:not([type="hidden"]), select, textarea, [contenteditable="true"], [tabindex]';
    const ariaHiddenFocusable: string[] = [];
    for (const container of document.querySelectorAll('[aria-hidden="true"]')) {
      for (const candidate of container.querySelectorAll<HTMLElement>(focusableSelector)) {
        if (candidate.tabIndex >= 0 && !candidate.matches(':disabled')) {
          ariaHiddenFocusable.push(`${describe(container)} > ${describe(candidate)}`);
        }
      }
    }

    const idCounts = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
      idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1);
    }
    const duplicateIds = Array.from(idCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => `#${id}`);

    return {
      positiveTabIndexes,
      missingImageAlt,
      ariaHiddenFocusable,
      duplicateIds,
    };
  });
}

export async function assertAccessibleSurface(page: Page, label: string): Promise<void> {
  const snapshot = await collectAccessibilityDomSnapshot(page);
  expect(auditAccessibilityDomSnapshot(snapshot), `${label}: static accessibility scan`).toEqual(
    [],
  );

  const interactive = page.locator(INTERACTIVE_SELECTOR);
  const count = await interactive.count();
  for (let index = 0; index < count; index += 1) {
    const control = interactive.nth(index);
    if (!(await control.isVisible())) continue;
    await expect(
      control,
      `${label}: visible interactive element ${index + 1}`,
    ).toHaveAccessibleName(/\S/u);
  }

  const dialogs = page.locator('[role="dialog"], dialog');
  const dialogCount = await dialogs.count();
  for (let index = 0; index < dialogCount; index += 1) {
    const dialog = dialogs.nth(index);
    if (!(await dialog.isVisible())) continue;
    await expect(dialog, `${label}: visible dialog ${index + 1}`).toHaveAccessibleName(/\S/u);
  }
}
