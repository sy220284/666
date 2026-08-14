import { describe, expect, it } from 'vitest';

import {
  consumeResearchReferenceSelection,
  listResearchReferenceSelection,
  removeResearchReferenceSelection,
  researchReferenceKey,
  setResearchReferenceSelected,
} from '../../apps/desktop/renderer/src/bridge/research-reference-selection.js';

const projectId = '11111111-1111-4111-8111-111111111111';

function note(index: number) {
  return {
    sourceType: 'note' as const,
    sourceId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
}

describe('M12-02 renderer research reference selection', () => {
  it('deduplicates, caps, removes and consumes explicit references per project', () => {
    expect(listResearchReferenceSelection(projectId)).toEqual([]);
    expect(researchReferenceKey(note(1))).toBe(`note:${note(1).sourceId}`);

    for (let index = 1; index <= 22; index += 1) {
      setResearchReferenceSelected(projectId, note(index), true);
    }
    expect(listResearchReferenceSelection(projectId)).toEqual(
      Array.from({ length: 20 }, (_, offset) => note(offset + 3)),
    );

    setResearchReferenceSelected(projectId, note(10), true);
    const reordered = listResearchReferenceSelection(projectId);
    expect(reordered).toHaveLength(20);
    expect(reordered.at(-1)).toEqual(note(10));
    expect(
      reordered.filter(
        (reference) => researchReferenceKey(reference) === researchReferenceKey(note(10)),
      ),
    ).toHaveLength(1);

    expect(removeResearchReferenceSelection(projectId, note(10))).not.toContainEqual(note(10));
    expect(consumeResearchReferenceSelection(projectId, [])).toEqual(
      listResearchReferenceSelection(projectId),
    );

    const remaining = listResearchReferenceSelection(projectId);
    const consumed = remaining.slice(0, 2);
    expect(consumeResearchReferenceSelection(projectId, consumed)).toEqual(remaining.slice(2));

    const finalSelection = listResearchReferenceSelection(projectId);
    expect(consumeResearchReferenceSelection(projectId, finalSelection)).toEqual([]);
    expect(listResearchReferenceSelection(projectId)).toEqual([]);

    expect(setResearchReferenceSelected(projectId, note(1), false)).toEqual([]);
  });

  it('keeps selections isolated by project', () => {
    const otherProjectId = '22222222-2222-4222-8222-222222222222';
    setResearchReferenceSelected(projectId, note(1), true);
    setResearchReferenceSelected(otherProjectId, note(2), true);

    expect(listResearchReferenceSelection(projectId)).toEqual([note(1)]);
    expect(listResearchReferenceSelection(otherProjectId)).toEqual([note(2)]);

    consumeResearchReferenceSelection(projectId, [note(1)]);
    consumeResearchReferenceSelection(otherProjectId, [note(2)]);
  });
});
