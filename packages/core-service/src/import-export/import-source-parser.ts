import * as iconv from 'iconv-lite';

import type {
  DetectedTextEncoding,
  ImportPlan,
  ImportPlanBlock,
  ImportPlanChapter,
} from '@worldforge/contracts';

import { ImportExportServiceError } from './import-export-model.js';

export function decode(buffer: Buffer, encoding: DetectedTextEncoding): string {
  try {
    const decoded =
      encoding === 'gb18030'
        ? iconv.decode(buffer, 'gb18030')
        : new TextDecoder(encoding, { fatal: true }).decode(buffer);
    if (decoded.includes('\uFFFD')) {
      throw new Error(`Invalid byte sequence for ${encoding}.`);
    }
    return decoded
      .replace(/^\uFEFF/u, '')
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  } catch (error) {
    throw new ImportExportServiceError(
      'IMPORT_ENCODING_UNCERTAIN',
      `The file could not be decoded as ${encoding}.`,
      { cause: error },
    );
  }
}

export function detectEncoding(buffer: Buffer): {
  readonly encoding: DetectedTextEncoding;
  readonly confidence: ImportPlan['confidence'];
  readonly candidates: DetectedTextEncoding[];
} {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { encoding: 'utf-8', confidence: 'high', candidates: ['utf-8'] };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return { encoding: 'utf-16le', confidence: 'high', candidates: ['utf-16le'] };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    return { encoding: 'utf-16be', confidence: 'high', candidates: ['utf-16be'] };
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let evenZero = 0;
  let oddZero = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) evenZero += 1;
    else oddZero += 1;
  }
  if (oddZero > sample.length / 8 && oddZero > evenZero * 4) {
    return {
      encoding: 'utf-16le',
      confidence: 'medium',
      candidates: ['utf-16le', 'utf-8', 'gb18030'],
    };
  }
  if (evenZero > sample.length / 8 && evenZero > oddZero * 4) {
    return {
      encoding: 'utf-16be',
      confidence: 'medium',
      candidates: ['utf-16be', 'utf-8', 'gb18030'],
    };
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { encoding: 'utf-8', confidence: 'high', candidates: ['utf-8', 'gb18030'] };
  } catch {
    const decoded = iconv.decode(buffer, 'gb18030');
    if (!decoded.includes('\uFFFD')) {
      return {
        encoding: 'gb18030',
        confidence: 'low',
        candidates: ['gb18030', 'utf-8'],
      };
    }
    throw new ImportExportServiceError(
      'IMPORT_ENCODING_UNCERTAIN',
      'The file encoding could not be identified safely.',
    );
  }
}

function flushParagraph(lines: string[], blocks: ImportPlanBlock[]): void {
  const text = lines.join('\n').trim();
  lines.length = 0;
  if (text) blocks.push({ blockType: 'paragraph', text });
}

function nonEmptyBlocks(blocks: ImportPlanBlock[]): ImportPlanBlock[] {
  const filtered = blocks.filter(
    (block) => block.blockType === 'separator' || block.text.trim().length > 0,
  );
  return filtered.length > 0 ? filtered : [{ blockType: 'paragraph', text: '' }];
}

export function parseMarkdown(
  text: string,
  fallbackTitle: string,
  idFactory: () => string,
): ImportPlanChapter[] {
  const chapters: ImportPlanChapter[] = [];
  let title = fallbackTitle;
  let blocks: ImportPlanBlock[] = [];
  const paragraph: string[] = [];
  let sawChapter = false;
  const commit = (): void => {
    flushParagraph(paragraph, blocks);
    const normalized = nonEmptyBlocks(blocks);
    if (normalized.some((block) => block.blockType === 'separator' || block.text.trim())) {
      chapters.push({ planChapterId: idFactory(), title, blocks: normalized });
    }
    blocks = [];
  };
  for (const rawLine of text.split('\n')) {
    const chapter = rawLine.match(/^#\s+(.+)$/u);
    if (chapter) {
      if (sawChapter || blocks.length > 0 || paragraph.length > 0) commit();
      title = chapter[1]!.trim().slice(0, 240) || fallbackTitle;
      sawChapter = true;
      continue;
    }
    const heading = rawLine.match(/^#{2,6}\s+(.+)$/u);
    if (heading) {
      flushParagraph(paragraph, blocks);
      blocks.push({ blockType: 'heading', text: heading[1]!.trim() });
      continue;
    }
    if (/^\s*(?:---|\*\*\*)\s*$/u.test(rawLine)) {
      flushParagraph(paragraph, blocks);
      blocks.push({ blockType: 'separator', text: '' });
      continue;
    }
    if (rawLine.trim() === '') flushParagraph(paragraph, blocks);
    else paragraph.push(rawLine);
  }
  commit();
  return chapters;
}

export function parseTxt(
  text: string,
  fallbackTitle: string,
  idFactory: () => string,
): ImportPlanChapter[] {
  const lines = text.split('\n');
  const markers = lines.some((line) => /^===\s*.+?\s*===$/u.test(line));
  if (!markers) {
    const blocks: ImportPlanBlock[] = [];
    const paragraph: string[] = [];
    for (const line of lines) {
      if (line.trim() === '') flushParagraph(paragraph, blocks);
      else paragraph.push(line);
    }
    flushParagraph(paragraph, blocks);
    return [{ planChapterId: idFactory(), title: fallbackTitle, blocks: nonEmptyBlocks(blocks) }];
  }
  const chapters: ImportPlanChapter[] = [];
  let title = fallbackTitle;
  let blocks: ImportPlanBlock[] = [];
  const paragraph: string[] = [];
  const commit = (): void => {
    flushParagraph(paragraph, blocks);
    const normalized = nonEmptyBlocks(blocks);
    if (normalized.some((block) => block.blockType === 'separator' || block.text.trim())) {
      chapters.push({ planChapterId: idFactory(), title, blocks: normalized });
    }
    blocks = [];
  };
  for (const line of lines) {
    const marker = line.match(/^===\s*(.+?)\s*===$/u);
    if (marker) {
      if (blocks.length > 0 || paragraph.length > 0) commit();
      title = marker[1]!.trim().slice(0, 240) || fallbackTitle;
    } else if (line.trim() === '') flushParagraph(paragraph, blocks);
    else paragraph.push(line);
  }
  commit();
  return chapters;
}
