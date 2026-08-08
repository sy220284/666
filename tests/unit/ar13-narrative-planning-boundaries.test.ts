import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = 'packages/core-service/src/narrative-planning.ts';
const modules = [
  'packages/core-service/src/narrative-planning/narrative-planning-model.ts',
  'packages/core-service/src/narrative-planning/narrative-planning-catalog.ts',
  'packages/core-service/src/narrative-planning/foreshadowing-operations.ts',
  'packages/core-service/src/narrative-planning/character-arc-operations.ts',
  'packages/core-service/src/narrative-planning/narrative-planning-service.ts',
] as const;

describe('AR-13 Narrative Planning boundaries', () => {
  it('keeps the public entry as a compatibility surface', async () => {
    const source = await readFile(root, 'utf8');
    expect(source).toContain('NarrativePlanningService');
    expect(source).toContain('NarrativePlanningServiceError');
  });

  it('separates model, catalog, foreshadowing and character arc responsibilities', async () => {
    const sources = await Promise.all(modules.map((file) => readFile(file, 'utf8')));
    expect(sources[0]).toContain('export class NarrativePlanningServiceError');
    expect(sources[1]).toContain('export function readNarrativePlanningCatalog');
    expect(sources[2]).toContain('export class ForeshadowingOperations');
    expect(sources[3]).toContain('export class CharacterArcOperations');
    expect(sources[4]).toContain('export class NarrativePlanningService');
  });
});
