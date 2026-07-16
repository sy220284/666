from __future__ import annotations

import argparse
import re
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    if old not in source:
        raise SystemExit(f"Anchor missing in {path}: {old!r}")
    file.write_text(source.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    source = file.read_text()
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Pattern matched {count} times in {path}: {pattern[:80]!r}")
    file.write_text(updated)


def prepare(implementation_path: str) -> None:
    path = Path(implementation_path)
    source = path.read_text()
    start = source.index('replace_once(html, "当前任务提供显式保存')
    end = source.index("\n\nstyles =", start)
    replacement = '''html_path = Path(html)
html_source = html_path.read_text()
old_hint_start = html_source.index("当前任务提供显式保存；800ms 自动保存将在 M1-06")
old_hint_end = html_source.index("</p>", old_hint_start)
old_hint = html_source[old_hint_start:old_hint_end]
html_path.write_text(
    html_source.replace(
        old_hint,
        "正文修改空闲800ms后自动保存；切换章节、返回项目与关闭应用前会强制刷新。中文输入组合期间暂停保存。",
        1,
    )
)'''
    path.write_text(source[:start] + replacement + source[end:])


def finish() -> None:
    autosave = Path("packages/editor-core/src/autosave.ts")
    source = autosave.read_text()
    declarations = (
        "declare function setTimeout(handler: () => void, timeout: number): unknown;\n"
        "declare function clearTimeout(handle: unknown): void;\n\n"
    )
    if not source.startswith("declare function setTimeout"):
        autosave.write_text(declarations + source)

    for name in [
        "tests/unit/autosave-writing-tools.test.ts",
        "tests/performance/writing-tools-performance.test.ts",
    ]:
        path = Path(name)
        path.write_text(
            path.read_text().replace(
                "from '@worldforge/editor-core';",
                "from '../../packages/editor-core/src/index.js';",
            )
        )

    replace_once(
        "packages/contracts/src/draft.ts",
        "  expectedHash: DraftContentHashValueSchema,\n  content: DraftBlockTextSchema,",
        "  expectedHash: DraftContentHashValueSchema,\n  blockType: DraftBlockTypeSchema.optional(),\n  content: DraftBlockTextSchema,",
    )
    replace_once(
        "packages/editor-core/src/draft-patch.ts",
        "      readonly expectedHash: string;\n      readonly content: string;",
        "      readonly expectedHash: string;\n      readonly blockType?: WorldforgeBlockType | undefined;\n      readonly content: string;",
    )
    replace_once(
        "packages/editor-core/src/draft-patch.ts",
        "        return previous !== undefined && previous.blockType === block.blockType;",
        "        return previous !== undefined;",
    )
    regex_once(
        "packages/editor-core/src/draft-patch.ts",
        r"    const attributesChanged = !attributesEqual\(.*?    updates\.push\(\{.*?    \}\);",
        """    const blockTypeChanged = previous.blockType !== block.blockType;
    const attributesChanged =
      blockTypeChanged ||
      !attributesEqual(block.blockType, previous.attributes, block.attributes);
    if (previous.text === block.text && !attributesChanged && !blockTypeChanged) continue;
    updates.push({
      type: 'update',
      logicalBlockId: block.logicalBlockId,
      expectedHash: requiredHash(previous),
      ...(blockTypeChanged ? { blockType: block.blockType } : {}),
      content: block.text,
      ...(attributesChanged
        ? { attributes: normalizedAttributes(block.blockType, block.attributes) }
        : {}),
    });""",
    )
    replace_once(
        "packages/core-service/src/draft.ts",
        "        blockType: current.blockType,",
        "        blockType: operation.blockType ?? current.blockType,",
    )
    regex_once(
        "tests/unit/editor-draft-patch.test.ts",
        r"  it\('represents a block type change as delete plus insert'.*?\n  \}\);",
        """  it('preserves logical identity when a block type changes', () => {
    const operations = buildDraftPatchOperations(
      [persisted(firstId, '旧正文', firstHash)],
      [current(firstId, firstId, '新标题', 'heading')],
    );

    expect(operations).toEqual([
      {
        type: 'update',
        logicalBlockId: firstId,
        expectedHash: firstHash,
        blockType: 'heading',
        content: '新标题',
        attributes: { headingLevel: 2 },
      },
    ]);
  });""",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "finish"])
    parser.add_argument("path", nargs="?")
    args = parser.parse_args()
    if args.mode == "prepare":
        if not args.path:
            raise SystemExit("prepare requires the implementation script path")
        prepare(args.path)
    else:
        finish()
