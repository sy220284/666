import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

export interface PublicFixtureMetadata {
  readonly fixtureId: string;
  readonly language: 'zh-CN';
  readonly source: 'synthetic-public-test-data';
  readonly license: 'CC0-1.0';
  readonly containsPrivateData: false;
}

export interface ChineseTextFixture extends PublicFixtureMetadata {
  readonly text: string;
  readonly characters: number;
  readonly sha256: string;
}

export interface ChineseSearchFixture extends ChineseTextFixture {
  readonly chapterOffsets: readonly number[];
  readonly needle: string;
  readonly expectedOffsets: readonly number[];
}

const proseSeed =
  '临江城的晨雾沿着青石街缓慢散开，旧书铺门前的铜铃被风轻轻碰响。' +
  '林澈把昨夜的线索逐条写进册页，确认人物、时间与因果都能互相印证。' +
  '远处渡船靠岸，木板发出沉稳的回声，新的一章也从这个普通清晨开始。';

function publicMetadata(fixtureId: string): PublicFixtureMetadata {
  return {
    fixtureId,
    language: 'zh-CN',
    source: 'synthetic-public-test-data',
    license: 'CC0-1.0',
    containsPrivateData: false,
  };
}

function requireCharacterCount(characters: number, minimum: number): void {
  if (!Number.isSafeInteger(characters) || characters < minimum) {
    throw new RangeError(`Fixture characters must be an integer of at least ${minimum}.`);
  }
}

function fitText(seed: string, characters: number): string {
  return seed.repeat(Math.ceil(characters / seed.length)).slice(0, characters);
}

function textFixture(fixtureId: string, text: string): ChineseTextFixture {
  return {
    ...publicMetadata(fixtureId),
    text,
    characters: text.length,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

export function createChineseLongParagraphFixture(characters = 5_000): ChineseTextFixture {
  requireCharacterCount(characters, 1_000);
  return textFixture('zh-long-paragraph-v1', fitText(proseSeed, characters));
}

export function createChineseLongChapterFixture(characters = 50_000): ChineseTextFixture {
  requireCharacterCount(characters, 10_000);
  const chapterSeed = `第一章 雾港来信\n\n${proseSeed}\n\n`;
  return textFixture('zh-long-chapter-v1', fitText(chapterSeed, characters));
}

export function createMillionCharacterSearchFixture(
  characters = 1_500_000,
  chapterCount = 500,
): ChineseSearchFixture {
  const needle = '霁月航标七号';
  requireCharacterCount(characters, 1_000_000);
  if (!Number.isSafeInteger(chapterCount) || chapterCount < 1 || chapterCount > characters) {
    throw new RangeError('chapterCount must be a positive integer within the fixture size.');
  }

  let text = fitText(proseSeed, characters);
  const expectedOffsets = [1, 2, 3, 4, 5].map((part) => Math.floor((characters * part) / 6));
  for (const offset of expectedOffsets) {
    text = text.slice(0, offset) + needle + text.slice(offset + needle.length);
  }
  const chapterOffsets = Array.from({ length: chapterCount }, (_value, index) =>
    Math.floor((characters * index) / chapterCount),
  );

  return {
    ...textFixture('zh-search-1500000-v1', text),
    chapterOffsets,
    needle,
    expectedOffsets,
  };
}

interface ZipEntry {
  readonly name: string;
  readonly content: Uint8Array | string;
  readonly compression?: 'store' | 'deflate';
}

function crc32(content: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(entries: readonly ZipEntry[]): {
  readonly bytes: Buffer;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
} {
  if (entries.length > 0xffff) throw new RangeError('ZIP fixtures support at most 65535 entries.');
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  let compressedBytes = 0;
  let uncompressedBytes = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw =
      typeof entry.content === 'string'
        ? Buffer.from(entry.content, 'utf8')
        : Buffer.from(entry.content);
    const method = entry.compression === 'deflate' ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(raw, { level: 9 }) : raw;
    const checksum = crc32(raw);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.byteLength, 18);
    localHeader.writeUInt32LE(raw.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.byteLength, 20);
    centralHeader.writeUInt32LE(raw.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength + compressed.byteLength;
    compressedBytes += compressed.byteLength;
    uncompressedBytes += raw.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return {
    bytes: Buffer.concat([...localParts, centralDirectory, end]),
    compressedBytes,
    uncompressedBytes,
  };
}

const contentTypes =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';
const rootRelationships =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';
const documentXml =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>公开合成测试文档</w:t></w:r></w:p></w:body></w:document>';

function baseDocxEntries(): ZipEntry[] {
  return [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRelationships },
    { name: 'word/document.xml', content: documentXml },
  ];
}

export const MALICIOUS_DOCX_FIXTURE_KINDS = [
  'macro-enabled',
  'path-traversal',
  'compression-bomb',
  'too-many-files',
  'embedded-object',
  'external-relationship',
  'malformed-archive',
  'cancellation-preview',
] as const;

export type MaliciousDocxFixtureKind = (typeof MALICIOUS_DOCX_FIXTURE_KINDS)[number];

export interface MaliciousDocxFixture extends PublicFixtureMetadata {
  readonly kind: MaliciousDocxFixtureKind;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly entryCount: number;
  readonly compressionRatio: number;
  readonly securityCaseId: `SEC-${number}`;
}

function buildDocxEntries(
  kind: Exclude<MaliciousDocxFixtureKind, 'malformed-archive'>,
): ZipEntry[] {
  const entries = baseDocxEntries();
  switch (kind) {
    case 'macro-enabled':
      entries[0] = {
        name: '[Content_Types].xml',
        content: contentTypes.replace(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
          'application/vnd.ms-word.document.macroEnabled.main+xml',
        ),
      };
      entries.push({ name: 'word/vbaProject.bin', content: 'SYNTHETIC_MACRO_DO_NOT_EXECUTE' });
      break;
    case 'path-traversal':
      entries.push({ name: '../outside-worldforge.xml', content: '<synthetic />' });
      break;
    case 'compression-bomb':
      entries.push({
        name: 'word/media/repeated.txt',
        content: Buffer.alloc(2_000_000, 0x41),
        compression: 'deflate',
      });
      break;
    case 'too-many-files':
      for (let index = 0; index < 1_025; index += 1) {
        entries.push({
          name: `word/media/public-${index.toString().padStart(4, '0')}.txt`,
          content: '',
        });
      }
      break;
    case 'embedded-object':
      entries.push({
        name: 'word/embeddings/oleObject1.bin',
        content: 'SYNTHETIC_OLE_OBJECT_DO_NOT_EXECUTE',
      });
      break;
    case 'external-relationship':
      entries.push({
        name: 'word/_rels/document.xml.rels',
        content:
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/never-fetch.png" TargetMode="External"/>' +
          '</Relationships>',
      });
      break;
    case 'cancellation-preview':
      entries[2] = {
        name: 'word/document.xml',
        content: documentXml.replace(
          '公开合成测试文档',
          fitText('用于取消预览清理测试的公开合成正文。', 250_000),
        ),
        compression: 'deflate',
      };
      break;
  }
  return entries;
}

const securityCaseByKind: Record<MaliciousDocxFixtureKind, `SEC-${number}`> = {
  'macro-enabled': 'SEC-042',
  'path-traversal': 'SEC-043',
  'compression-bomb': 'SEC-044',
  'too-many-files': 'SEC-045',
  'embedded-object': 'SEC-046',
  'external-relationship': 'SEC-047',
  'malformed-archive': 'SEC-048',
  'cancellation-preview': 'SEC-049',
};

export function createMaliciousDocxFixture(kind: MaliciousDocxFixtureKind): MaliciousDocxFixture {
  const fileName = kind === 'macro-enabled' ? `${kind}.docm` : `${kind}.docx`;
  if (kind === 'malformed-archive') {
    const bytes = Buffer.from('PK\u0003\u0004SYNTHETIC_TRUNCATED_ARCHIVE', 'utf8');
    return {
      ...publicMetadata(`docx-${kind}-v1`),
      kind,
      fileName,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      entryCount: 0,
      compressionRatio: 1,
      securityCaseId: securityCaseByKind[kind],
    };
  }

  const entries = buildDocxEntries(kind);
  const archive = createZipArchive(entries);
  return {
    ...publicMetadata(`docx-${kind}-v1`),
    kind,
    fileName,
    bytes: archive.bytes,
    sha256: createHash('sha256').update(archive.bytes).digest('hex'),
    entryCount: entries.length,
    compressionRatio:
      archive.compressedBytes === 0 ? 1 : archive.uncompressedBytes / archive.compressedBytes,
    securityCaseId: securityCaseByKind[kind],
  };
}

export function listZipEntryNames(bytes: Uint8Array): readonly string[] {
  const archive = Buffer.from(bytes);
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = archive.indexOf(signature);
  const names: string[] = [];
  while (offset >= 0 && offset + 46 <= archive.byteLength) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) break;
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > archive.byteLength) break;
    names.push(archive.subarray(nameStart, nameStart + nameLength).toString('utf8'));
    offset = next;
  }
  return names;
}
