import { strToU8, unzipSync, zipSync } from 'fflate';

import type { ImportPlanChapter } from '@worldforge/contracts';

export const DOCX_ARCHIVE_LIMITS = {
  maximumArchiveBytes: 20 * 1024 * 1024,
  maximumEntries: 256,
  maximumEntryBytes: 10 * 1024 * 1024,
  maximumExpandedBytes: 40 * 1024 * 1024,
  maximumCompressionRatio: 100,
  maximumPathDepth: 8,
} as const;

export type DocxTransferErrorCode = 'archive-limit' | 'unsupported' | 'empty';

export class DocxTransferError extends Error {
  readonly code: DocxTransferErrorCode;

  constructor(code: DocxTransferErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocxTransferError';
    this.code = code;
  }
}

interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly expandedSize: number;
  readonly compression: number;
}

function archiveError(message: string): never {
  throw new DocxTransferError('archive-limit', message);
}

function unsupported(message: string): never {
  throw new DocxTransferError('unsupported', message);
}

function readName(buffer: Buffer, offset: number, length: number, utf8: boolean): string {
  const bytes = buffer.subarray(offset, offset + length);
  if (!utf8 && bytes.some((value) => value > 0x7f)) {
    unsupported('DOCX archive paths must use UTF-8 or portable ASCII names.');
  }
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'ascii', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DocxTransferError('unsupported', 'A DOCX archive path is not valid text.', {
      cause: error,
    });
  }
}

function safeArchivePath(name: string): void {
  if (
    !name ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/u.test(name)
  ) {
    unsupported('The DOCX contains an unsafe archive path.');
  }
  const components = name.split('/').filter(Boolean);
  if (
    components.length > DOCX_ARCHIVE_LIMITS.maximumPathDepth ||
    components.some((component) => component === '.' || component === '..')
  ) {
    unsupported('The DOCX archive path depth or traversal segments are unsafe.');
  }
}

function centralEntries(buffer: Buffer): ZipEntry[] {
  if (buffer.byteLength > DOCX_ARCHIVE_LIMITS.maximumArchiveBytes) {
    archiveError('The DOCX exceeds the compressed archive size limit.');
  }
  let eocd = -1;
  const lowerBound = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) unsupported('The selected file is not a complete DOCX ZIP archive.');
  if (
    buffer.readUInt16LE(eocd + 4) !== 0 ||
    buffer.readUInt16LE(eocd + 6) !== 0 ||
    buffer.readUInt16LE(eocd + 8) !== buffer.readUInt16LE(eocd + 10)
  ) {
    unsupported('Split or multi-disk DOCX archives are not supported.');
  }
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    entryCount > DOCX_ARCHIVE_LIMITS.maximumEntries ||
    centralOffset + centralSize > eocd
  ) {
    archiveError('The DOCX ZIP64 metadata, file count or central directory exceeds limits.');
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let expandedTotal = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      unsupported('The DOCX central directory is inconsistent.');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compression = buffer.readUInt16LE(cursor + 10);
    const crc32 = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const expandedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const disk = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if ((flags & 1) !== 0 || disk !== 0 || ![0, 8].includes(compression)) {
      unsupported('Encrypted, split or unsupported-compression DOCX entries are rejected.');
    }
    const name = readName(buffer, cursor + 46, nameLength, (flags & 0x800) !== 0);
    safeArchivePath(name);
    const canonicalName = name.toLocaleLowerCase('en-US');
    if (names.has(canonicalName)) unsupported('Duplicate DOCX archive entries are rejected.');
    names.add(canonicalName);
    const unixMode = externalAttributes >>> 16;
    const fileType = unixMode & 0o170000;
    if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
      unsupported('Symbolic links and device entries are rejected from DOCX archives.');
    }
    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      unsupported('The DOCX local entry headers are inconsistent.');
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localCompression = buffer.readUInt16LE(localOffset + 8);
    const localCrc32 = buffer.readUInt32LE(localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);
    const localExpandedSize = buffer.readUInt32LE(localOffset + 22);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localHeaderEnd = localOffset + 30 + localNameLength + localExtraLength;
    if (localHeaderEnd > centralOffset) {
      unsupported('The DOCX local entry header extends into the central directory.');
    }
    const localName = readName(
      buffer,
      localOffset + 30,
      localNameLength,
      (localFlags & 0x800) !== 0,
    );
    if (localFlags !== flags || localCompression !== compression || localName !== name) {
      unsupported('The DOCX local entry header fields do not match the central directory.');
    }
    const usesDataDescriptor = (flags & 0x8) !== 0;
    const localSizesMatch =
      localCrc32 === crc32 &&
      localCompressedSize === compressedSize &&
      localExpandedSize === expandedSize;
    const localSizesArePlaceholders =
      localCrc32 === 0 && localCompressedSize === 0 && localExpandedSize === 0;
    if (
      (!usesDataDescriptor && !localSizesMatch) ||
      (usesDataDescriptor && !localSizesMatch && !localSizesArePlaceholders)
    ) {
      unsupported('The DOCX local entry sizes do not match the central directory.');
    }
    if (localHeaderEnd + compressedSize > centralOffset) {
      unsupported('The DOCX local entry payload overlaps the central directory.');
    }
    if (
      expandedSize > DOCX_ARCHIVE_LIMITS.maximumEntryBytes ||
      expandedTotal + expandedSize > DOCX_ARCHIVE_LIMITS.maximumExpandedBytes ||
      (expandedSize > 0 &&
        expandedSize / Math.max(1, compressedSize) > DOCX_ARCHIVE_LIMITS.maximumCompressionRatio)
    ) {
      archiveError('The DOCX expanded size or compression ratio exceeds safety limits.');
    }
    expandedTotal += expandedSize;
    entries.push({ name, compressedSize, expandedSize, compression });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) {
    unsupported('The DOCX central directory size declaration is inconsistent.');
  }
  return entries;
}

function xmlText(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/gu, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&#x([a-f0-9]+);/giu, (_match, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    );
}

function safeXml(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DocxTransferError('unsupported', `${label} is not valid UTF-8 XML.`, {
      cause: error,
    });
  }
  if (/<!DOCTYPE|<!ENTITY|<\s*xinclude:/iu.test(text)) {
    unsupported(`${label} contains forbidden XML entities or includes.`);
  }
  return text;
}

function relationshipTargetIsUnsafe(value: string): boolean {
  const decoded = xmlText(value).trim();
  return (
    decoded.includes('\\') ||
    decoded.startsWith('/') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(decoded) ||
    decoded.split('/').some((component) => component === '..')
  );
}

function validateRelationships(files: Record<string, Uint8Array>): void {
  for (const [name, bytes] of Object.entries(files)) {
    if (!name.endsWith('.rels')) continue;
    const xml = safeXml(bytes, name);
    for (const relationship of xml.matchAll(/<Relationship\b([^>]*)\/?>/giu)) {
      const attributes = relationship[1] ?? '';
      if (/\bTargetMode\s*=\s*["']External["']/iu.test(attributes)) {
        unsupported('External DOCX relationships are rejected.');
      }
      const target = attributes.match(/\bTarget\s*=\s*["']([^"']+)["']/iu)?.[1];
      if (target && relationshipTargetIsUnsafe(target)) {
        unsupported('The DOCX contains an unsafe relationship target.');
      }
    }
  }
}

function tagBoundary(value: string, index: number): boolean {
  const character = value[index];
  return (
    character === '>' ||
    character === '/' ||
    character === ' ' ||
    character === '\t' ||
    character === '\r' ||
    character === '\n'
  );
}

function findTagStart(value: string, tag: string, from: number): number {
  const prefix = `<${tag}`;
  let cursor = from;
  for (;;) {
    const index = value.indexOf(prefix, cursor);
    if (index < 0) return -1;
    if (tagBoundary(value, index + prefix.length)) return index;
    cursor = index + prefix.length;
  }
}

function paragraphText(paragraph: string): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (;;) {
    const textStart = findTagStart(paragraph, 'w:t', cursor);
    const tabStart = findTagStart(paragraph, 'w:tab', cursor);
    const breakStart = findTagStart(paragraph, 'w:br', cursor);
    const starts = [textStart, tabStart, breakStart].filter((value) => value >= 0);
    if (starts.length === 0) break;
    const start = Math.min(...starts);
    const openEnd = paragraph.indexOf('>', start);
    if (openEnd < 0) unsupported('The DOCX paragraph contains an incomplete WordprocessingML tag.');
    if (start === textStart) {
      const close = paragraph.indexOf('</w:t>', openEnd + 1);
      if (close < 0) unsupported('The DOCX paragraph contains an unterminated text run.');
      pieces.push(xmlText(paragraph.slice(openEnd + 1, close)));
      cursor = close + '</w:t>'.length;
    } else {
      pieces.push(start === tabStart ? '\t' : '\n');
      cursor = openEnd + 1;
    }
  }
  return pieces.join('').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

function headingLevel(paragraph: string): number | null {
  const style = paragraph.match(/<w:pStyle\b[^>]*w:val\s*=\s*["']([^"']+)["'][^>]*\/?>/iu)?.[1];
  if (!style) return null;
  const match = style.match(/(?:Heading|标题)\s*([1-6])/iu);
  return match ? Number(match[1]) : null;
}

export function parseDocx(
  buffer: Buffer,
  fallbackTitle: string,
  idFactory: () => string,
): { readonly chapters: ImportPlanChapter[]; readonly warnings: string[] } {
  const entries = centralEntries(buffer);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    if (!byName.has(required)) unsupported(`The DOCX is missing required part ${required}.`);
  }
  for (const entry of entries) {
    if (
      /(?:^|\/)(?:vbaProject\.bin|activeX|embeddings|oleObject|externalLinks)(?:\/|$)/iu.test(
        entry.name,
      ) ||
      /\.(?:bin|exe|dll|js|vbs|ps1)$/iu.test(entry.name)
    ) {
      unsupported('Macros, OLE objects, scripts and embedded executables are rejected.');
    }
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, {
      filter: (file) =>
        file.name === '[Content_Types].xml' ||
        file.name === 'word/document.xml' ||
        file.name.endsWith('.rels'),
    });
  } catch (error) {
    throw new DocxTransferError('unsupported', 'The DOCX entries could not be decompressed.', {
      cause: error,
    });
  }
  for (const [name, bytes] of Object.entries(files)) {
    const declared = byName.get(name);
    if (!declared || bytes.byteLength !== declared.expandedSize) {
      unsupported('A DOCX entry size does not match its central-directory declaration.');
    }
  }
  validateRelationships(files);
  safeXml(files['[Content_Types].xml']!, '[Content_Types].xml');
  const documentXml = safeXml(files['word/document.xml']!, 'word/document.xml');
  const chapters: ImportPlanChapter[] = [];
  let current: ImportPlanChapter = {
    planChapterId: idFactory(),
    title: fallbackTitle,
    blocks: [],
  };
  const commit = (): void => {
    if (current.blocks.length === 0) return;
    chapters.push(current);
  };
  let paragraphCursor = 0;
  for (;;) {
    const paragraphStart = findTagStart(documentXml, 'w:p', paragraphCursor);
    if (paragraphStart < 0) break;
    const paragraphEnd = documentXml.indexOf('</w:p>', paragraphStart);
    if (paragraphEnd < 0) unsupported('The DOCX document contains an unterminated paragraph.');
    const paragraph = documentXml.slice(paragraphStart, paragraphEnd + '</w:p>'.length);
    paragraphCursor = paragraphEnd + '</w:p>'.length;
    const text = paragraphText(paragraph);
    if (!text) continue;
    const level = headingLevel(paragraph);
    if (level === 1) {
      commit();
      current = {
        planChapterId: idFactory(),
        title: text.slice(0, 240) || fallbackTitle,
        blocks: [],
      };
    } else {
      current.blocks.push({
        blockType: level && level > 1 ? 'heading' : text === '***' ? 'separator' : 'paragraph',
        text: text === '***' && !level ? '' : text,
      });
    }
  }
  commit();
  if (chapters.length === 0) {
    throw new DocxTransferError('empty', 'The DOCX contains no importable paragraphs.');
  }
  return {
    chapters,
    warnings: /<w:(?:b|i|u)\b/iu.test(documentXml)
      ? ['DOCX内联样式已安全归一为正文文本；标题层级予以保留。']
      : [],
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function paragraphXml(text: string, style?: string): string {
  const segments = text.split('\n');
  const body = segments
    .map(
      (segment, index) =>
        `${index === 0 ? '' : '<w:br/>'}<w:t xml:space="preserve">${escapeXml(segment)}</w:t>`,
    )
    .join('');
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r>${body}</w:r></w:p>`;
}

export function renderDocx(
  versions: readonly {
    readonly chapterTitle: string;
    readonly blocks: readonly { readonly blockType: string; readonly text: string }[];
  }[],
): Buffer {
  const body = versions
    .flatMap((version) => [
      paragraphXml(version.chapterTitle, 'Heading1'),
      ...version.blocks.map((block) =>
        block.blockType === 'heading'
          ? paragraphXml(block.text, 'Heading2')
          : paragraphXml(block.blockType === 'separator' ? '***' : block.text),
      ),
    ])
    .join('');
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`;
  const rootRelationships =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const documentRelationships =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>` +
    `</w:styles>`;
  const fixedTime = new Date('2000-01-01T00:00:00.000Z');
  const options = { level: 6 as const, mtime: fixedTime };
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': [strToU8(contentTypes), options],
      '_rels/.rels': [strToU8(rootRelationships), options],
      'word/document.xml': [strToU8(documentXml), options],
      'word/_rels/document.xml.rels': [strToU8(documentRelationships), options],
      'word/styles.xml': [strToU8(styles), options],
    }),
  );
}
