#!/usr/bin/env python3
from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'fix anchor missing: {path}: {old[:80]!r}')
    target.write_text(source.replace(old, new, 1), encoding='utf-8')


replace(
    'packages/core-service/src/import-export.ts',
    "interface ExportBlockRow {\n  readonly blockType: ImportPlanBlock['blockType'];\n  readonly text: string;\n  readonly orderKey: number | bigint;\n}\n",
    "interface ExportBlockRow {\n  readonly blockType: ImportPlanBlock['blockType'];\n  readonly text: string;\n  readonly orderKey: number | bigint;\n}\n\ninterface ImportedVersionBlock {\n  readonly logicalBlockId: string;\n  readonly orderKey: string;\n  readonly blockType: ImportPlanBlock['blockType'];\n  readonly text: string;\n  readonly attributes: Record<string, never>;\n  readonly source: 'imported';\n  readonly locked: false;\n  readonly contentHash: string;\n}\n",
)
replace(
    'packages/core-service/src/import-export.ts',
    "function versionHash(blocks: readonly ImportPlanBlock[]): string {\n  return sha256(\n    stable(\n      blocks.map((block, index) => ({\n        logicalBlockId: `import-${index}`,\n        orderKey: String(BigInt(index + 1) * ORDER_STEP),\n        blockType: block.blockType,\n        text: block.text,\n        attributes: {},\n        source: 'imported',\n        locked: false,\n        contentHash: blockHash(block),\n      })),\n    ),\n  );\n}\n",
    "function versionHash(blocks: readonly ImportedVersionBlock[]): string {\n  return sha256(stable(blocks));\n}\n",
)
replace(
    'packages/core-service/src/import-export.ts',
    "          const versionBlocks: ImportPlanBlock[] = [];\n          chapter.blocks.forEach((block, blockIndex) => {\n            const logicalBlockId = this.#idFactory();\n            const hash = blockHash(block);\n            const orderKey = BigInt(blockIndex + 1) * ORDER_STEP;\n            insertDraftBlock.run(\n              this.#idFactory(),\n              draftId,\n              logicalBlockId,\n              orderKey,\n              block.blockType,\n              block.text,\n              hash,\n            );\n            insertVersionBlock.run(\n              versionId,\n              logicalBlockId,\n              orderKey,\n              block.blockType,\n              block.text,\n              hash,\n            );\n            versionBlocks.push(block);\n          });\n          insertVersion.run(\n            versionId,\n            chapterId,\n            draftId,\n            wordCount(versionBlocks),\n            versionHash(versionBlocks),\n            now,\n          );\n",
    "          const versionBlocks: ImportedVersionBlock[] = chapter.blocks.map(\n            (block, blockIndex) => {\n              const logicalBlockId = this.#idFactory();\n              const contentHash = blockHash(block);\n              const orderKey = BigInt(blockIndex + 1) * ORDER_STEP;\n              insertDraftBlock.run(\n                this.#idFactory(),\n                draftId,\n                logicalBlockId,\n                orderKey,\n                block.blockType,\n                block.text,\n                contentHash,\n              );\n              return {\n                logicalBlockId,\n                orderKey: String(orderKey),\n                blockType: block.blockType,\n                text: block.text,\n                attributes: {},\n                source: 'imported',\n                locked: false,\n                contentHash,\n              };\n            },\n          );\n          insertVersion.run(\n            versionId,\n            chapterId,\n            draftId,\n            wordCount(chapter.blocks),\n            versionHash(versionBlocks),\n            now,\n          );\n          for (const block of versionBlocks) {\n            insertVersionBlock.run(\n              versionId,\n              block.logicalBlockId,\n              BigInt(block.orderKey),\n              block.blockType,\n              block.text,\n              block.contentHash,\n            );\n          }\n",
)

contracts = Path('packages/contracts/src/import-export.ts')
contracts_source = contracts.read_text(encoding='utf-8')
contracts_source = contracts_source.replace(
    "        !/[<>:\"|?*\\u0000-\\u001f]/u.test(value),",
    "        !/[<>:\"|?*]/u.test(value) &&\n        !Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32),",
)
contracts.write_text(contracts_source, encoding='utf-8')

core = Path('packages/core-service/src/import-export.ts')
core_source = core.read_text(encoding='utf-8')
core_source = core_source.replace(
    "import path from 'node:path';\n",
    "import path from 'node:path';\n\nimport * as iconv from 'iconv-lite';\n",
    1,
)
core_source = core_source.replace('let paragraph: string[] = [];', 'const paragraph: string[] = [];', 2)
core_source = core_source.replace(
    '/[<>:\"/\\\\|?*\\u0000-\\u001f]/u.test(base)',
    '/[<>:\"/\\\\|?*]/u.test(base) ||\n    Array.from(base).some((character) => (character.codePointAt(0) ?? 0) < 32)',
)
decode_start = core_source.index('function decode(buffer: Buffer, encoding: DetectedTextEncoding): string {')
decode_end = core_source.index('\nfunction detectEncoding', decode_start)
decode_function = r"""function decode(buffer: Buffer, encoding: DetectedTextEncoding): string {
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
"""
core_source = core_source[:decode_start] + decode_function + core_source[decode_end:]
detect_start = core_source.index('function detectEncoding(buffer: Buffer): {')
detect_end = core_source.index('\nfunction flushParagraph', detect_start)
detect_function = r"""function detectEncoding(buffer: Buffer): {
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
"""
core_source = core_source[:detect_start] + detect_function + core_source[detect_end:]
core_source = core_source.replace(
    ") VALUES(?, ?, ?, ?, 'writing', NULL, NULL, ?, NULL, NULL)`,",
    ") VALUES(?, ?, ?, ?, 'writing', NULL, NULL, NULL, NULL, NULL)`,",
    1,
)
core_source = core_source.replace(
    "        const insertDraft = database.prepare(\n          `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)\n           VALUES(?, ?, 'active', 0, ?, ?)`,\n        );\n",
    "        const insertDraft = database.prepare(\n          `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)\n           VALUES(?, ?, 'active', 0, ?, ?)`,\n        );\n        const activateDraft = database.prepare(\n          'UPDATE chapters SET active_draft_id = ? WHERE id = ?',\n        );\n",
    1,
)
core_source = core_source.replace(
    "          insertChapter.run(\n            chapterId,\n            volumeId,\n            chapter.title,\n            BigInt(chapterIndex + 1) * ORDER_STEP,\n            draftId,\n          );\n          insertDraft.run(draftId, chapterId, now, now);\n",
    "          insertChapter.run(\n            chapterId,\n            volumeId,\n            chapter.title,\n            BigInt(chapterIndex + 1) * ORDER_STEP,\n          );\n          insertDraft.run(draftId, chapterId, now, now);\n          activateDraft.run(draftId, chapterId);\n",
    1,
)
core.write_text(core_source, encoding='utf-8')

test = Path('tests/integration/import-export-service.test.ts')
test_source = test.read_text(encoding='utf-8')
gb_start = test_source.index("      const gbPath = path.join(value.importDirectory, 'gb.txt');")
gb_end = test_source.index("      await writeFile(gbPath, '=== 第一章", gb_start)
gb_block = r"""      const gbPath = path.join(value.importDirectory, 'gb.txt');
      const gbBytes = Buffer.concat([
        Buffer.from('=== Chapter 1 ===\n', 'ascii'),
        Buffer.from([0xbe, 0xc9, 0xb8, 0xe5, 0xd5, 0xfd, 0xce, 0xc4]),
      ]);
      await writeFile(gbPath, gbBytes);
      const automatic = await value.service.previewImport(
        { projectId: value.project.projectId },
        gbPath,
      );
      expect(automatic.detectedEncoding).toBe('gb18030');
      expect(automatic.confidence).toBe('low');
      expect(automatic.warnings).toHaveLength(1);
      const manual = await value.service.previewImport(
        { projectId: value.project.projectId, encoding: 'gb18030' },
        gbPath,
      );
      expect(manual.confidence).toBe('high');
      expect(manual.chapters[0]?.blocks[0]?.text).toBe('旧稿正文');
"""
test_source = test_source[:gb_start] + gb_block + test_source[gb_end:]
roundtrip_marker = "      expect(exported.sha256).toMatch(/^[a-f0-9]{64}$/u);\n"
if roundtrip_marker not in test_source:
    raise SystemExit('TXT roundtrip insertion marker missing')
roundtrip_block = r"""

      const txtExport = await value.service.exportVersions(
        {
          projectId: value.project.projectId,
          versionIds: catalog.versions.map((version) => version.versionId),
          format: 'txt',
          fileName: '稳定稿往返',
        },
        value.exportDirectory,
      );
      const roundtrip = await value.service.previewImport(
        { projectId: value.project.projectId },
        txtExport.filePath,
      );
      expect(roundtrip.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
      expect(roundtrip.chapters[0]?.blocks.map((block) => block.text).join('\n')).toContain(
        '雨落旧站。',
      );
      expect(roundtrip.chapters[1]?.blocks[0]?.text).toBe('天将破晓。');
"""
test_source = test_source.replace(roundtrip_marker, roundtrip_marker + roundtrip_block, 1)
test.write_text(test_source, encoding='utf-8')

renderer = Path('apps/desktop/renderer/src/index.ts')
source = renderer.read_text(encoding='utf-8')
marker = 'function setTextIoStatus(message: string, error = false): void {'
if marker not in source:
    raise SystemExit('renderer text IO marker missing')
head, tail = source.split(marker, 1)
tail = tail.replace('\\\\', '\\')
renderer.write_text(head + marker + tail, encoding='utf-8')

print('M1-09 hardening fixes applied')
