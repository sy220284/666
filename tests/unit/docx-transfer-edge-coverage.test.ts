import { randomUUID } from 'node:crypto';

import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  DOCX_ARCHIVE_LIMITS,
  DocxTransferError,
  parseDocx,
  renderDocx,
} from '../../packages/core-service/src/docx-transfer.js';

function safeArchive(): Buffer {
  return renderDocx([
    {
      chapterTitle: '第一章',
      blocks: [{ blockType: 'paragraph', text: '正文' }],
    },
  ]);
}

function eocdOffset(buffer: Buffer): number {
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65_557);
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Missing EOCD.');
}

function centralOffset(buffer: Buffer): number {
  return buffer.readUInt32LE(eocdOffset(buffer) + 16);
}

function centralRecords(buffer: Buffer): number[] {
  const eocd = eocdOffset(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const records: number[] = [];
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    records.push(cursor);
    cursor +=
      46 +
      buffer.readUInt16LE(cursor + 28) +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
  return records;
}

function centralName(buffer: Buffer, cursor: number): string {
  return buffer
    .subarray(cursor + 46, cursor + 46 + buffer.readUInt16LE(cursor + 28))
    .toString('utf8');
}

function record(buffer: Buffer, name: string): number {
  const value = centralRecords(buffer).find((cursor) => centralName(buffer, cursor) === name);
  if (value === undefined) throw new Error(`Missing central record: ${name}`);
  return value;
}

function localOffset(buffer: Buffer, cursor: number): number {
  return buffer.readUInt32LE(cursor + 42);
}

function expectUnsupported(operation: () => unknown, text: RegExp): void {
  expect(operation).toThrowError(text);
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(DocxTransferError);
    expect((error as DocxTransferError).code).toBe('unsupported');
  }
}

function packageArchive(
  documentXml: Uint8Array,
  overrides: Record<string, Uint8Array> = {},
): Buffer {
  const contentTypes = strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  const rootRelationships = strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="word/document.xml"/></Relationships>',
  );
  const documentRelationships = strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  );
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': contentTypes,
      '_rels/.rels': rootRelationships,
      'word/document.xml': documentXml,
      'word/_rels/document.xml.rels': documentRelationships,
      ...overrides,
    }),
  );
}

function document(body: string): Uint8Array {
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
}

describe('DOCX transfer edge coverage', () => {
  it('rejects archive envelope, disk, ZIP64 and central-directory corruption', () => {
    expect(() =>
      parseDocx(Buffer.alloc(DOCX_ARCHIVE_LIMITS.maximumArchiveBytes + 1), '回退', randomUUID),
    ).toThrow(/compressed archive size limit/u);

    expectUnsupported(
      () => parseDocx(Buffer.alloc(32), '回退', randomUUID),
      /not a complete DOCX ZIP archive/u,
    );

    const split = safeArchive();
    split.writeUInt16LE(1, eocdOffset(split) + 4);
    expectUnsupported(() => parseDocx(split, '回退', randomUUID), /multi-disk/u);

    const zip64 = safeArchive();
    const zip64Eocd = eocdOffset(zip64);
    zip64.writeUInt16LE(0xffff, zip64Eocd + 8);
    zip64.writeUInt16LE(0xffff, zip64Eocd + 10);
    expect(() => parseDocx(zip64, '回退', randomUUID)).toThrow(/ZIP64 metadata/u);

    const badCentral = safeArchive();
    badCentral.writeUInt32LE(0, centralOffset(badCentral));
    expectUnsupported(
      () => parseDocx(badCentral, '回退', randomUUID),
      /central directory is inconsistent/u,
    );

    const badSize = safeArchive();
    const eocd = eocdOffset(badSize);
    badSize.writeUInt32LE(badSize.readUInt32LE(eocd + 12) - 1, eocd + 12);
    expectUnsupported(
      () => parseDocx(badSize, '回退', randomUUID),
      /central directory size declaration is inconsistent/u,
    );
  });

  it('rejects unsafe archive names, encoding, duplicate entries and non-file types', () => {
    const unsafe = safeArchive();
    const unsafeRecord = record(unsafe, '_rels/.rels');
    unsafe.write('_rels\\.rels', unsafeRecord + 46, 'ascii');
    expectUnsupported(() => parseDocx(unsafe, '回退', randomUUID), /unsafe archive path/u);

    const portable = safeArchive();
    const portableRecord = record(portable, '_rels/.rels');
    portable.writeUInt16LE(portable.readUInt16LE(portableRecord + 8) & ~0x800, portableRecord + 8);
    portable[portableRecord + 46] = 0xff;
    expectUnsupported(() => parseDocx(portable, '回退', randomUUID), /portable ASCII names/u);

    const invalidUtf8 = safeArchive();
    const utf8Record = record(invalidUtf8, '_rels/.rels');
    invalidUtf8.writeUInt16LE(invalidUtf8.readUInt16LE(utf8Record + 8) | 0x800, utf8Record + 8);
    invalidUtf8[utf8Record + 46] = 0xff;
    expectUnsupported(() => parseDocx(invalidUtf8, '回退', randomUUID), /not valid text/u);

    const duplicateFiles = unzipSync(safeArchive());
    duplicateFiles['EXTRA.xml'] = strToU8('<x/>');
    duplicateFiles['extra.xml'] = strToU8('<x/>');
    expectUnsupported(
      () => parseDocx(Buffer.from(zipSync(duplicateFiles)), '回退', randomUUID),
      /Duplicate DOCX archive entries/u,
    );

    const symlink = safeArchive();
    const symlinkRecord = record(symlink, 'word/styles.xml');
    symlink.writeUInt32LE((0o120777 << 16) >>> 0, symlinkRecord + 38);
    expectUnsupported(() => parseDocx(symlink, '回退', randomUUID), /Symbolic links/u);
  });

  it('rejects encrypted entries and local-header inconsistencies', () => {
    const encrypted = safeArchive();
    const encryptedRecord = record(encrypted, 'word/document.xml');
    encrypted.writeUInt16LE(encrypted.readUInt16LE(encryptedRecord + 8) | 1, encryptedRecord + 8);
    expectUnsupported(() => parseDocx(encrypted, '回退', randomUUID), /Encrypted/u);

    const missingLocal = safeArchive();
    const missingRecord = record(missingLocal, 'word/document.xml');
    missingLocal.writeUInt32LE(centralOffset(missingLocal), missingRecord + 42);
    expectUnsupported(() => parseDocx(missingLocal, '回退', randomUUID), /local entry headers/u);

    const extendedHeader = safeArchive();
    const extendedRecord = record(extendedHeader, 'word/document.xml');
    const extendedLocal = localOffset(extendedHeader, extendedRecord);
    extendedHeader.writeUInt16LE(centralOffset(extendedHeader) - extendedLocal, extendedLocal + 26);
    expectUnsupported(
      () => parseDocx(extendedHeader, '回退', randomUUID),
      /local entry header extends/u,
    );

    const badSizes = safeArchive();
    const sizesRecord = record(badSizes, 'word/document.xml');
    const sizesLocal = localOffset(badSizes, sizesRecord);
    badSizes.writeUInt32LE(badSizes.readUInt32LE(sizesLocal + 18) + 1, sizesLocal + 18);
    expectUnsupported(() => parseDocx(badSizes, '回退', randomUUID), /local entry sizes/u);

    const overlap = safeArchive();
    const overlapRecord = record(overlap, 'word/document.xml');
    const overlapLocal = localOffset(overlap, overlapRecord);
    const headerEnd =
      overlapLocal +
      30 +
      overlap.readUInt16LE(overlapLocal + 26) +
      overlap.readUInt16LE(overlapLocal + 28);
    const oversized = centralOffset(overlap) - headerEnd + 1;
    overlap.writeUInt32LE(oversized, overlapRecord + 20);
    overlap.writeUInt32LE(oversized, overlapLocal + 18);
    expectUnsupported(() => parseDocx(overlap, '回退', randomUUID), /payload overlaps/u);
  });

  it('accepts data-descriptor placeholders during header validation before rejecting the malformed stream', () => {
    const descriptor = safeArchive();
    const descriptorRecord = record(descriptor, 'word/document.xml');
    const descriptorLocal = localOffset(descriptor, descriptorRecord);
    const flags = descriptor.readUInt16LE(descriptorRecord + 8) | 0x8;
    descriptor.writeUInt16LE(flags, descriptorRecord + 8);
    descriptor.writeUInt16LE(flags, descriptorLocal + 6);
    descriptor.writeUInt32LE(0, descriptorLocal + 14);
    descriptor.writeUInt32LE(0, descriptorLocal + 18);
    descriptor.writeUInt32LE(0, descriptorLocal + 22);
    expect(parseDocx(descriptor, '回退', randomUUID).chapters[0]?.title).toBe('第一章');
  });

  it('wraps decompression failures from a structurally valid archive', () => {
    const corrupt = safeArchive();
    const corruptRecord = record(corrupt, 'word/document.xml');
    const corruptLocal = localOffset(corrupt, corruptRecord);
    const payloadStart =
      corruptLocal +
      30 +
      corrupt.readUInt16LE(corruptLocal + 26) +
      corrupt.readUInt16LE(corruptLocal + 28);
    const payloadSize = corrupt.readUInt32LE(corruptRecord + 20);
    corrupt.fill(0xff, payloadStart, payloadStart + payloadSize);
    expectUnsupported(
      () => parseDocx(corrupt, '回退', randomUUID),
      /entries could not be decompressed/u,
    );
  });

  it('rejects entry-size declaration mismatches after successful decompression', () => {
    const mismatch = safeArchive();
    const mismatchRecord = record(mismatch, 'word/document.xml');
    const mismatchLocal = localOffset(mismatch, mismatchRecord);
    const declared = mismatch.readUInt32LE(mismatchRecord + 24) + 1;
    mismatch.writeUInt32LE(declared, mismatchRecord + 24);
    mismatch.writeUInt32LE(declared, mismatchLocal + 22);
    expectUnsupported(() => parseDocx(mismatch, '回退', randomUUID), /entry size does not match/u);
  });

  it('rejects missing package parts, malformed UTF-8/XML and unsafe internal relationships', () => {
    const files = unzipSync(safeArchive());
    delete files['word/document.xml'];
    expectUnsupported(
      () => parseDocx(Buffer.from(zipSync(files)), '回退', randomUUID),
      /missing required part word\/document.xml/u,
    );

    expectUnsupported(
      () => parseDocx(packageArchive(Uint8Array.from([0xff])), '回退', randomUUID),
      /word\/document.xml is not valid UTF-8 XML/u,
    );

    expectUnsupported(
      () =>
        parseDocx(
          packageArchive(document('<!DOCTYPE x><w:p><w:r><w:t>正文</w:t></w:r></w:p>')),
          '回退',
          randomUUID,
        ),
      /forbidden XML entities/u,
    );

    const unsafeRelationship = strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="x" Target="../outside.xml"/></Relationships>',
    );
    expectUnsupported(
      () =>
        parseDocx(
          packageArchive(document('<w:p><w:r><w:t>正文</w:t></w:r></w:p>'), {
            'word/_rels/document.xml.rels': unsafeRelationship,
          }),
          '回退',
          randomUUID,
        ),
      /unsafe relationship target/u,
    );
  });

  it('decodes numeric entities, skips prefix lookalikes and handles tabs, breaks and inline warnings', () => {
    const archive = packageArchive(
      document(
        '<w:px/><w:p><w:r><w:t>&#65;&#x42;&lt;&gt;&quot;&apos;&amp;</w:t><w:tab/><w:t>C</w:t><w:br/><w:t>D</w:t><w:b/></w:r></w:p>',
      ),
    );
    const parsed = parseDocx(archive, '回退', randomUUID);
    expect(parsed.chapters[0]?.blocks[0]?.text).toBe('AB<>"\'&\tC\nD');
    expect(parsed.warnings).toHaveLength(1);

    const customStyle = parseDocx(
      packageArchive(
        document(
          '<w:p><w:pPr><w:pStyle w:val="Custom"/></w:pPr><w:r><w:t>普通正文</w:t></w:r></w:p>',
        ),
      ),
      '回退',
      randomUUID,
    );
    expect(customStyle.chapters[0]?.blocks[0]?.blockType).toBe('paragraph');
  });

  it('rejects unterminated runs and paragraphs, skips empty paragraphs and rejects empty documents', () => {
    expectUnsupported(
      () =>
        parseDocx(
          packageArchive(document('<w:p><w:r><w:t>没有闭合</w:r></w:p>')),
          '回退',
          randomUUID,
        ),
      /unterminated text run/u,
    );

    expectUnsupported(
      () =>
        parseDocx(
          packageArchive(document('<w:p><w:r><w:t>没有段落闭合</w:t></w:r>')),
          '回退',
          randomUUID,
        ),
      /unterminated paragraph/u,
    );

    const skipped = parseDocx(
      packageArchive(
        document('<w:p><w:r><w:t>   </w:t></w:r></w:p><w:p><w:r><w:t>有效正文</w:t></w:r></w:p>'),
      ),
      '回退',
      randomUUID,
    );
    expect(skipped.chapters[0]?.blocks).toEqual([expect.objectContaining({ text: '有效正文' })]);

    expect(() => parseDocx(packageArchive(document('')), '回退', randomUUID)).toThrowError(
      expect.objectContaining({ code: 'empty' }),
    );
  });

  it('renders escaped multiline content and all supported block mappings', () => {
    const archive = renderDocx([
      {
        chapterTitle: '章<&"\'',
        blocks: [
          { blockType: 'heading', text: '小标题' },
          { blockType: 'separator', text: '' },
          { blockType: 'paragraph', text: '甲\n乙<&"\'' },
        ],
      },
    ]);
    const parsed = parseDocx(archive, '回退', randomUUID);
    expect(parsed.chapters[0]?.title).toBe('章<&"\'');
    expect(parsed.chapters[0]?.blocks).toEqual([
      expect.objectContaining({ blockType: 'heading', text: '小标题' }),
      expect.objectContaining({ blockType: 'separator', text: '' }),
      expect.objectContaining({ blockType: 'paragraph', text: '甲\n乙<&"\'' }),
    ]);
  });
});
