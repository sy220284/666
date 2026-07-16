import { describe, expect, it } from 'vitest';

import { draftContentHash } from '../../packages/core-service/src/draft.js';
import {
  normalizeDraftBlockSemantic,
  normalizeDraftText,
  serializeDraftBlockSemantic,
} from '../../packages/domain/src/index.js';

describe('M1-05 Draft semantic normalization', () => {
  it('normalizes line endings and Unicode to one stable SHA-256 semantic value', () => {
    const decomposed = 'Cafe\u0301\r\n第二行\r第三行';
    const composed = 'Café\n第二行\n第三行';

    expect(normalizeDraftText(decomposed)).toBe(composed);
    expect(
      serializeDraftBlockSemantic({
        blockType: 'paragraph',
        content: decomposed,
        attributes: {},
      }),
    ).toBe(
      serializeDraftBlockSemantic({
        blockType: 'paragraph',
        content: composed,
        attributes: {},
      }),
    );
    expect(draftContentHash({ blockType: 'paragraph', content: decomposed, attributes: {} })).toBe(
      draftContentHash({ blockType: 'paragraph', content: composed, attributes: {} }),
    );
  });

  it('preserves meaningful whitespace and includes semantic block attributes in the hash', () => {
    const base = draftContentHash({ blockType: 'paragraph', content: '  正文  ', attributes: {} });
    expect(base).not.toBe(
      draftContentHash({ blockType: 'paragraph', content: '正文', attributes: {} }),
    );
    expect(base).not.toBe(
      draftContentHash({ blockType: 'dialogue', content: '  正文  ', attributes: {} }),
    );
    expect(
      draftContentHash({
        blockType: 'heading',
        content: '标题',
        attributes: { headingLevel: 2 },
      }),
    ).not.toBe(
      draftContentHash({
        blockType: 'heading',
        content: '标题',
        attributes: { headingLevel: 3 },
      }),
    );
  });

  it('defaults headingLevel and rejects invalid separator or foreign heading attributes', () => {
    expect(
      normalizeDraftBlockSemantic({ blockType: 'heading', content: '标题', attributes: {} }),
    ).toEqual({ blockType: 'heading', content: '标题', attributes: { headingLevel: 2 } });
    expect(() =>
      normalizeDraftBlockSemantic({
        blockType: 'separator',
        content: '不可写入',
        attributes: {},
      }),
    ).toThrow(/Separator/);
    expect(() =>
      normalizeDraftBlockSemantic({
        blockType: 'paragraph',
        content: '正文',
        attributes: { headingLevel: 2 },
      }),
    ).toThrow(/Only heading/);
  });
});
