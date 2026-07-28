import { randomUUID } from 'node:crypto';

import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  DOCX_ARCHIVE_LIMITS,
  parseDocx,
  renderDocx,
} from '../../packages/core-service/src/docx-transfer.js';

function replaceAscii(buffer: Buffer, source: string, replacement: string): Buffer {
  expect(replacement.length).toBe(source.length);
  const result = Buffer.from(buffer);
  let offset = result.indexOf(source, 0, 'ascii');
  expect(offset).toBeGreaterThanOrEqual(0);
  while (offset >= 0) {
    result.write(replacement, offset, 'ascii');
    offset = result.indexOf(source, offset + replacement.length, 'ascii');
  }
  return result;
}

describe('M4-04 DOCX archive security boundary', () => {
  it('rejects traversal paths, executable package parts and external relationship targets', () => {
    const safe = renderDocx([
      {
        chapterTitle: '第一章',
        blocks: [{ blockType: 'paragraph', text: '安全正文' }],
      },
    ]);
    expect(parseDocx(safe, '回退标题', randomUUID).chapters[0]?.title).toBe('第一章');

    const traversal = replaceAscii(safe, '_rels/.rels', '../bad/.rel');
    expect(() => parseDocx(traversal, '回退标题', randomUUID)).toThrow(/traversal segments/u);

    const executable = replaceAscii(safe, 'word/styles.xml', 'word/activeX/x_');
    expect(() => parseDocx(executable, '回退标题', randomUUID)).toThrow(/Macros, OLE objects/u);

    const files = unzipSync(safe);
    files['_rels/.rels'] = strToU8(
      new TextDecoder()
        .decode(files['_rels/.rels'])
        .replace('<Relationship ', '<Relationship TargetMode="External" '),
    );
    const external = Buffer.from(zipSync(files));
    expect(() => parseDocx(external, '回退标题', randomUUID)).toThrow(
      /External DOCX relationships/u,
    );
  });

  it('rejects compression-bomb ratios before extracting the document body', () => {
    const repeated = '零'.repeat(Math.min(2_000_000, DOCX_ARCHIVE_LIMITS.maximumEntryBytes / 2));
    const archive = renderDocx([
      {
        chapterTitle: '第一章',
        blocks: [{ blockType: 'paragraph', text: repeated }],
      },
    ]);
    expect(() => parseDocx(archive, '回退标题', randomUUID)).toThrow(/compression ratio/u);
  });
});
