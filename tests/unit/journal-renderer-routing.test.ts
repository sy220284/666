import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG } from '../../apps/desktop/renderer/src/features/command-palette/command-catalog.js';
import { primaryNavigationIdForRoute } from '../../apps/desktop/renderer/src/shell/app-shell-model.js';
import { RENDERER_ROUTE_IDS } from '../../apps/desktop/renderer/src/state/ui-state-boundary.js';

describe('M12-01 journal renderer routing', () => {
  it('keeps Journal inside the existing knowledge navigation group', () => {
    expect(RENDERER_ROUTE_IDS).toContain('journal');
    expect(primaryNavigationIdForRoute('journal')).toBe('canon');
  });

  it('adds Journal to the single existing Command Catalog', () => {
    expect(
      COMMAND_CATALOG.some(
        (entry) => entry.id === 'route.journal' && entry.kind === 'route' && entry.route === 'journal',
      ),
    ).toBe(true);
    expect(COMMAND_CATALOG.filter((entry) => entry.id === 'route.journal')).toHaveLength(1);
  });
});
