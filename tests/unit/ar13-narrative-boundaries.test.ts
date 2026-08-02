import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = 'packages/core-service/src/narrative-planning.ts';
const modules = [
  'packages/core-service/src/narrative/narrative-model.ts',
  'packages/core-service/src/narrative/narrative-catalog.ts',
  'packages/core-service/src/narrative/foreshadowing-operations.ts',
  'packages/core-service/src/narrative/character-arc-operations.ts',
  'packages/core-service/src/narrative/narrative-planning-service.ts',
] as const;

function lines(source: string): number {
  return source.trimEnd().split(/\r?\n/u).length;
}

describe('AR-13 Narrative boundaries', () => {
  it('keeps the public Narrative entry as a compatibility facade', async () => {
    const source = await readFile(root, 'utf8');
    expect(source).toContain('./narrative/narrative-planning-service.js');
    expect(source).toContain('./narrative/narrative-model.js');
    expect(source).not.toContain('class NarrativePlanningService');
    expect(lines(source)).toBeLessThanOrEqual(10);
  });

  it('separates foreshadowing and character arc transactions', async () => {
    const [model, catalog, foreshadowing, characterArc, service] = await Promise.all(
      modules.map((file) => readFile(file, 'utf8')),
    );

    expect(model).toContain('NarrativePlanningServiceError');
    expect(catalog).toContain('export function readCatalog');
    expect(foreshadowing).toContain('export class ForeshadowingOperations');
    expect(foreshadowing).toContain('saveForeshadowing');
    expect(foreshadowing).not.toContain('saveCharacterArc');
    expect(characterArc).toContain('export class CharacterArcOperations');
    expect(characterArc).toContain('saveCharacterArc');
    expect(characterArc).not.toContain('saveForeshadowing');
    expect(service).toContain('ForeshadowingOperations');
    expect(service).toContain('CharacterArcOperations');
  });

  it('keeps every Narrative module within the frozen AR-13 budget', async () => {
    const budgets = [260, 300, 380, 360, 130] as const;
    const sources = await Promise.all(modules.map((file) => readFile(file, 'utf8')));
    sources.forEach((source, index) => expect(lines(source)).toBeLessThanOrEqual(budgets[index]));
  });
});
