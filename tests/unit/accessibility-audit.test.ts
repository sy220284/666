import { describe, expect, it } from 'vitest';

import { auditAccessibilityDomSnapshot } from '../e2e/accessibility-audit.js';

describe('accessibility audit policy', () => {
  it('accepts a clean DOM snapshot', () => {
    expect(
      auditAccessibilityDomSnapshot({
        positiveTabIndexes: [],
        missingImageAlt: [],
        ariaHiddenFocusable: [],
        duplicateIds: [],
      }),
    ).toEqual([]);
  });

  it('reports every high-confidence violation deterministically', () => {
    expect(
      auditAccessibilityDomSnapshot({
        positiveTabIndexes: ['button[data-next]'],
        missingImageAlt: ['img.hero'],
        ariaHiddenFocusable: ['div[aria-hidden] > button.close'],
        duplicateIds: ['#dialog-title'],
      }),
    ).toEqual([
      { rule: 'aria-hidden-focusable', target: 'div[aria-hidden] > button.close' },
      { rule: 'duplicate-id', target: '#dialog-title' },
      { rule: 'image-alt', target: 'img.hero' },
      { rule: 'positive-tabindex', target: 'button[data-next]' },
    ]);
  });
});
