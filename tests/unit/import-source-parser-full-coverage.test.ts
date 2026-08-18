import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  decode,
  detectEncoding,
  parseMarkdown,
  parseTxt,
} from '../../packages/core-service/src/import-export/import-source-parser.js';

const coreRequire = createRequire(
  new URL('../../packages/core-service/package.json', import.meta.url),
);
const iconv = coreRequire('iconv-lite') as {
  encode(value: string, encoding: string): Buffer;
};

function ids() {
  let index = 0;
  return () => `chapter-${++index}`;
}

describe('import source parser full coverage', () => {
  it('decodes supported encodings, strips BOM and normalizes line endings', () => {
    expect(decode(Buffer.from('\uFEFF第一行\r\n第二行\r第三行', 'utf8'), 'utf-8')).toBe(
      '第一行\n第二行\n第三行',
    );
    expect(decode(iconv.encode('中文\r\n正文', 'gb18030'), 'gb18030')).toBe('中文\n正文');
    expect(decode(Buffer.from('A\u0000B\u0000', 'binary'), 'utf-16le')).toBe('AB');
  });

  it('rejects invalid byte sequences and replacement-character decoding', () => {
    expect(() => decode(Buffer.from([0xff]), 'utf-8')).toThrow(
      expect.objectContaining({ code: 'IMPORT_ENCODING_UNCERTAIN' }),
    );
    expect(() => decode(Buffer.from([0x81]), 'gb18030')).toThrow(
      expect.objectContaining({ code: 'IMPORT_ENCODING_UNCERTAIN' }),
    );
  });

  it('detects BOM signatures and zero-byte UTF-16 heuristics', () => {
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x41]))).toEqual({
      encoding: 'utf-8',
      confidence: 'high',
      candidates: ['utf-8'],
    });
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x41, 0x00]))).toEqual({
      encoding: 'utf-16le',
      confidence: 'high',
      candidates: ['utf-16le'],
    });
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x41]))).toEqual({
      encoding: 'utf-16be',
      confidence: 'high',
      candidates: ['utf-16be'],
    });
    expect(detectEncoding(Buffer.from('ASCII TEXT', 'utf16le'))).toMatchObject({
      encoding: 'utf-16le',
      confidence: 'medium',
    });
    const be = Buffer.from('ASCII TEXT', 'utf16le');
    for (let index = 0; index < be.length; index += 2) {
      [be[index], be[index + 1]] = [be[index + 1]!, be[index]!];
    }
    expect(detectEncoding(be)).toMatchObject({ encoding: 'utf-16be', confidence: 'medium' });
  });

  it('detects valid UTF-8, falls back to GB18030 and rejects unknown encodings', () => {
    expect(detectEncoding(Buffer.from('正常 UTF-8 文本', 'utf8'))).toEqual({
      encoding: 'utf-8',
      confidence: 'high',
      candidates: ['utf-8', 'gb18030'],
    });
    expect(detectEncoding(iconv.encode('中文内容', 'gb18030'))).toEqual({
      encoding: 'gb18030',
      confidence: 'low',
      candidates: ['gb18030', 'utf-8'],
    });
    expect(() => detectEncoding(Buffer.from([0x81]))).toThrow(
      expect.objectContaining({ code: 'IMPORT_ENCODING_UNCERTAIN' }),
    );
  });

  it('parses markdown preface, chapter headings, subheadings, separators and paragraphs', () => {
    const longTitle = '长'.repeat(260);
    const chapters = parseMarkdown(
      `序言第一行\n序言第二行\n\n## 小节\n---\n# 第一章\n正文一\n正文二\n\n***\n# ${longTitle}\n末章正文`,
      '导入作品',
      ids(),
    );
    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toEqual({
      planChapterId: 'chapter-1',
      title: '导入作品',
      blocks: [
        { blockType: 'paragraph', text: '序言第一行\n序言第二行' },
        { blockType: 'heading', text: '小节' },
        { blockType: 'separator', text: '' },
      ],
    });
    expect(chapters[1]).toMatchObject({
      planChapterId: 'chapter-2',
      title: '第一章',
      blocks: [
        { blockType: 'paragraph', text: '正文一\n正文二' },
        { blockType: 'separator', text: '' },
      ],
    });
    expect(chapters[2]?.title).toHaveLength(240);
    expect(chapters[2]?.blocks).toEqual([{ blockType: 'paragraph', text: '末章正文' }]);
  });

  it('uses fallback markdown titles for whitespace headings and skips empty chapters', () => {
    const chapters = parseMarkdown('#    \n\n# 有内容\n正文', '兜底标题', ids());
    expect(chapters).toEqual([
      {
        planChapterId: 'chapter-1',
        title: '有内容',
        blocks: [{ blockType: 'paragraph', text: '正文' }],
      },
    ]);
    expect(parseMarkdown('', '空文档', ids())).toEqual([]);
  });

  it('parses marker-free TXT paragraphs and preserves a single empty fallback block', () => {
    expect(parseTxt('第一段一\n第一段二\n\n第二段', '纯文本', ids())).toEqual([
      {
        planChapterId: 'chapter-1',
        title: '纯文本',
        blocks: [
          { blockType: 'paragraph', text: '第一段一\n第一段二' },
          { blockType: 'paragraph', text: '第二段' },
        ],
      },
    ]);
    expect(parseTxt('', '空文本', ids())).toEqual([
      {
        planChapterId: 'chapter-1',
        title: '空文本',
        blocks: [{ blockType: 'paragraph', text: '' }],
      },
    ]);
  });

  it('skips empty marker-only TXT chapters without manufacturing content', () => {
    expect(parseTxt('=== 第一章 ===', '导入文本', ids())).toEqual([]);
  });

  it('parses marker-based TXT with preface, fallback marker title, multiple chapters and blank lines', () => {
    const chapters = parseTxt(
      '前言\n=== 第一章 ===\n正文一\n\n正文二\n===     ===\n兜底章正文\n=== 第三章 ===\n正文三',
      '导入文本',
      ids(),
    );
    expect(chapters).toEqual([
      {
        planChapterId: 'chapter-1',
        title: '导入文本',
        blocks: [{ blockType: 'paragraph', text: '前言' }],
      },
      {
        planChapterId: 'chapter-2',
        title: '第一章',
        blocks: [
          { blockType: 'paragraph', text: '正文一' },
          { blockType: 'paragraph', text: '正文二' },
        ],
      },
      {
        planChapterId: 'chapter-3',
        title: '导入文本',
        blocks: [{ blockType: 'paragraph', text: '兜底章正文' }],
      },
      {
        planChapterId: 'chapter-4',
        title: '第三章',
        blocks: [{ blockType: 'paragraph', text: '正文三' }],
      },
    ]);
  });
});
