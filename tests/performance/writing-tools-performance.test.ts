import { expect, it } from 'vitest';

import {
  calculateWritingStatistics,
  findTextRanges,
} from '../../packages/editor-core/src/index.js';

it('updates statistics and chapter find within 50ms for a 2K chapter', () => {
  const text = `${'雨落旧城，风过长街。'.repeat(200)}`.slice(0, 2_000);
  const started = performance.now();
  const statistics = calculateWritingStatistics(text, 200, 3_000);
  const matches = findTextRanges(text, '长街');
  const elapsed = performance.now() - started;
  expect(statistics.characterCount).toBe(2_000);
  expect(matches.length).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(50);
});
