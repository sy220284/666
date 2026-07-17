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
    "        confidence: 'medium',\n        candidates: ['gb18030', 'utf-8'],\n",
    "        confidence: 'low',\n        candidates: ['gb18030', 'utf-8'],\n",
)
replace(
    'packages/core-service/src/import-export.ts',
    "          const versionBlocks: ImportPlanBlock[] = [];\n          chapter.blocks.forEach((block, blockIndex) => {\n            const logicalBlockId = this.#idFactory();\n            const hash = blockHash(block);\n            const orderKey = BigInt(blockIndex + 1) * ORDER_STEP;\n            insertDraftBlock.run(\n              this.#idFactory(),\n              draftId,\n              logicalBlockId,\n              orderKey,\n              block.blockType,\n              block.text,\n              hash,\n            );\n            insertVersionBlock.run(\n              versionId,\n              logicalBlockId,\n              orderKey,\n              block.blockType,\n              block.text,\n              hash,\n            );\n            versionBlocks.push(block);\n          });\n          insertVersion.run(\n            versionId,\n            chapterId,\n            draftId,\n            wordCount(versionBlocks),\n            versionHash(versionBlocks),\n            now,\n          );\n",
    "          const versionBlocks: ImportedVersionBlock[] = chapter.blocks.map(\n            (block, blockIndex) => {\n              const logicalBlockId = this.#idFactory();\n              const contentHash = blockHash(block);\n              const orderKey = BigInt(blockIndex + 1) * ORDER_STEP;\n              insertDraftBlock.run(\n                this.#idFactory(),\n                draftId,\n                logicalBlockId,\n                orderKey,\n                block.blockType,\n                block.text,\n                contentHash,\n              );\n              return {\n                logicalBlockId,\n                orderKey: String(orderKey),\n                blockType: block.blockType,\n                text: block.text,\n                attributes: {},\n                source: 'imported',\n                locked: false,\n                contentHash,\n              };\n            },\n          );\n          insertVersion.run(\n            versionId,\n            chapterId,\n            draftId,\n            wordCount(chapter.blocks),\n            versionHash(versionBlocks),\n            now,\n          );\n          for (const block of versionBlocks) {\n            insertVersionBlock.run(\n              versionId,\n              block.logicalBlockId,\n              BigInt(block.orderKey),\n              block.blockType,\n              block.text,\n              block.contentHash,\n            );\n          }\n",
)
replace(
    'tests/integration/import-export-service.test.ts',
    "      const gbBytes = new TextEncoder().encode('=== 第一章 ===\\n旧稿正文');\n      await writeFile(gbPath, gbBytes);\n      const manual = await value.service.previewImport(\n        { projectId: value.project.projectId, encoding: 'utf-8' },\n        gbPath,\n      );\n      expect(manual.confidence).toBe('high');\n",
    "      const gbBytes = Buffer.concat([\n        Buffer.from('=== 第一章 ===\\n', 'ascii'),\n        Buffer.from([0xbe, 0xc9, 0xb8, 0xe5, 0xd5, 0xfd, 0xce, 0xc4]),\n      ]);\n      await writeFile(gbPath, gbBytes);\n      const automatic = await value.service.previewImport(\n        { projectId: value.project.projectId },\n        gbPath,\n      );\n      expect(automatic.detectedEncoding).toBe('gb18030');\n      expect(automatic.confidence).toBe('low');\n      expect(automatic.warnings).toHaveLength(1);\n      const manual = await value.service.previewImport(\n        { projectId: value.project.projectId, encoding: 'gb18030' },\n        gbPath,\n      );\n      expect(manual.confidence).toBe('high');\n      expect(manual.chapters[0]?.blocks[0]?.text).toBe('旧稿正文');\n",
)

renderer = Path('apps/desktop/renderer/src/index.ts')
source = renderer.read_text(encoding='utf-8')
marker = 'function setTextIoStatus(message: string, error = false): void {'
if marker not in source:
    raise SystemExit('renderer text IO marker missing')
head, tail = source.split(marker, 1)
tail = tail.replace('\\\\', '\\')
renderer.write_text(head + marker + tail, encoding='utf-8')

print('M1-09 hardening fixes applied')
