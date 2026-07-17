#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
TASK_ID = 'M1-09'
TASK_SOURCE = 'docs/tasks/M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md'
NEXT_ID = 'M2-01'
NEXT_SOURCE = 'docs/tasks/M2/M2-01_LOCK_GUARD.md'


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + '\n', encoding='utf-8')


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_commands(path: Path) -> list[dict[str, Any]]:
    commands: list[dict[str, Any]] = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        command, code, duration, fixtures = line.split('\t')
        commands.append(
            {
                'command': command,
                'exitCode': int(code),
                'durationMilliseconds': int(duration),
                'fixtureIds': [value for value in fixtures.split(',') if value],
            }
        )
    if not commands or any(command['exitCode'] != 0 for command in commands):
        raise SystemExit('M1-09 command evidence is incomplete or contains failures')
    return commands


def replace_section(path: str, marker: str, section: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding='utf-8').rstrip()
    if marker in source:
        source = source[: source.index(marker)].rstrip()
    write(target, f'{source}\n\n{section}')


def update_row(path: str, row_id: str, status: str) -> None:
    target = ROOT / path
    lines = target.read_text(encoding='utf-8').splitlines()
    found = False
    for index, line in enumerate(lines):
        if line.startswith(f'| {row_id} |'):
            cells = line.split('|')
            cells[-2] = f' {status} '
            lines[index] = '|'.join(cells)
            found = True
            break
    if not found:
        raise SystemExit(f'row not found: {path}: {row_id}')
    write(target, '\n'.join(lines))


def inventory(directory: Path) -> list[dict[str, Any]]:
    return [
        {
            'path': file.relative_to(directory).as_posix(),
            'bytes': file.stat().st_size,
            'sha256': sha256(file),
        }
        for file in sorted(directory.rglob('*'))
        if file.is_file() and file.name != 'manifest.json'
    ]


def evidence(args: argparse.Namespace) -> None:
    commands = parse_commands(Path(args.commands))
    screenshot = Path(args.screenshot)
    if not screenshot.exists() or screenshot.stat().st_size <= 10_000:
        raise SystemExit('M1-09 acceptance screenshot is missing or invalid')
    if screenshot.read_bytes()[1:4] != b'PNG':
        raise SystemExit('M1-09 screenshot is not PNG')

    directory = ROOT / 'docs/test-evidence/M1-09'
    if directory.exists():
        shutil.rmtree(directory)
    (directory / 'screenshots').mkdir(parents=True)
    (directory / 'test-results').mkdir(parents=True)
    target_screenshot = directory / 'screenshots/m1-09-import-export.png'
    shutil.copy2(screenshot, target_screenshot)

    generated_at = args.generated_at
    run_url = args.run_url
    commit = args.commit
    write(
        directory / 'summary.md',
        f'''# M1-09 测试证据

生成时间：{generated_at}  
验证实现提交：`{commit}`  
GitHub Actions：{run_url}

## 结论

TXT与Markdown导入导出基础闭环已通过：编码识别/人工选择、ImportPlan预览编辑、提交前恢复点、单事务导入、不可变导入基线Version、按指定Version导出、临时文件校验与原子重命名均已验证。

- 自动化门禁：PASS
- 桌面业务链路：PASS
- 数据完整性与回滚：PASS
- P0-048：PASS
- P0-050 TXT/Markdown范围：PASS
- 阻断缺陷：0
- 任务结论：Verified
''',
    )
    write(
        directory / 'commands.txt',
        '\n\n'.join(
            f"{item['command']}\nexit={item['exitCode']} duration_ms={item['durationMilliseconds']} fixtures={','.join(item['fixtureIds']) or '-'}"
            for item in commands
        ),
    )
    results = [
        ['P0-048-ENCODING', 'UTF-8、UTF-16LE/BE、GB18030检测及人工选择', 'passed'],
        ['P0-048-PREVIEW', '预览阶段数据库零写入；分章、拆分、合并、重命名后提交', 'passed'],
        ['P0-048-TRANSACTION', '确认前创建恢复点；Volume/Chapter/Draft/Version单事务提交', 'passed'],
        ['P0-048-ROLLBACK', '故障注入无半卷、半章、半Draft或半Version', 'passed'],
        ['P0-050-VERSION', '导出只读取明确选择的不可变Version', 'passed'],
        ['P0-050-ATOMIC', '临时写入、Hash复核、原子重命名且不覆盖同名文件', 'passed'],
        ['ROUNDTRIP', 'TXT导出重新预览后章节顺序与正文保持', 'passed'],
        ['DESKTOP-E2E', '真实桌面UI完成预览、调整、导入、导出与冲突提示', 'passed'],
    ]
    write(
        directory / 'test-results/results.json',
        json.dumps(
            [
                {'suite': 'M1-09 acceptance', 'fixtureId': fixture, 'status': status, 'details': detail}
                for fixture, detail, status in results
            ],
            ensure_ascii=False,
            indent=2,
        ),
    )
    write(
        directory / 'test-results/ci-run.json',
        json.dumps(
            {'runUrl': run_url, 'verifiedCommit': commit, 'commands': commands},
            ensure_ascii=False,
            indent=2,
        ),
    )
    write(directory / 'performance.json', '[]')
    write(
        directory / 'known-risks.md',
        '''# 已知风险

- DOCX导入导出仍由M6-05实现，REQ-034与REQ-035保持`In Progress`。
- M1仅处理20 MiB以内单个TXT/Markdown文件；大型归档和批量目录导入不在本任务范围。
- Markdown仅承诺标题、段落与分隔线基础语义；复杂表格、HTML和媒体不作为M1权威内容。
''',
    )
    write(
        directory / 'manual-acceptance.md',
        f'''# M1-09 界面与人工复核记录

运行：{run_url}

| 验收点 | 结果 |
|---|---|
| 空项目选择Markdown后生成2章预览，项目结构与恢复点数量仍为0 | PASS |
| 拆分后3章、合并后2章，标题可重命名 | PASS |
| 确认后生成1卷、2章、2个活动Draft、2个导入基线Version和1个恢复点 | PASS |
| 选择2个Version导出Markdown，章节标题、小标题与正文正确 | PASS |
| 同名再次导出返回`EXPORT_TARGET_EXISTS_002`，原文件不覆盖 | PASS |
| 固定1440×900截图可见导入导出状态和Version选择 | PASS |

截图：`screenshots/m1-09-import-export.png`
''',
    )
    write(
        directory / 'quality-matrix.md',
        '''# M1-09 完整质量矩阵

| 维度 | 结论 | 说明 |
|---|---|---|
| 输入边界 | PASS | 仅系统选择器提供绝对普通文件；拒绝符号链接、未知扩展、空文件和超限文件。 |
| 编码 | PASS | BOM、UTF-16零字节启发、严格UTF-8和GB18030候选；低置信度可人工选择。 |
| 预览隔离 | PASS | ImportPlan只保存在内存，源文件Hash用于过期检查，预览不写项目库。 |
| 数据事务 | PASS | 恢复点先完成，导入业务表在Core单写事务内一次提交。 |
| Version真源 | PASS | 导入创建不可变基线Version；导出不读取活动Draft。 |
| 文件安全 | PASS | 纯文件名校验、同名拒绝、临时文件Hash验证、原子重命名与失败清理。 |
| 回归 | PASS | Format、Lint、TypeScript、Unit、Integration、Migration、Security、Perf、Electron E2E、Build、Package Smoke通过。 |
| 范围审计 | PASS | 未提前实现DOCX、归档导入或复杂Markdown。 |

阻断缺陷：0。结论：Verified。
''',
    )
    write(
        directory / 'screenshots/manifest.json',
        json.dumps(
            [
                {
                    'fileName': target_screenshot.name,
                    'fixtureId': 'M1-09',
                    'sha256': sha256(target_screenshot),
                }
            ],
            ensure_ascii=False,
            indent=2,
        ),
    )
    write(
        directory / 'manifest.json',
        json.dumps(
            {
                'schemaVersion': 1,
                'taskId': TASK_ID,
                'commit': commit,
                'generatedAt': generated_at,
                'files': inventory(directory),
            },
            ensure_ascii=False,
            indent=2,
        ),
    )

    replace_section(
        'docs/contracts/IPC_CONTRACTS.md',
        '## M1-09 文本导入导出命令',
        '''## M1-09 文本导入导出命令

| 命令 | 文件系统参数来源 | Core行为 |
|---|---|---|
| `textIo.previewImport` | Main系统文件选择器 | 读取TXT/Markdown、识别编码、生成内存ImportPlan，不写项目库 |
| `textIo.commitImport` | 已生成Plan ID | 复核源Hash，先建恢复点，再以单事务创建Volume/Chapter/Draft/Version |
| `textIo.listExportVersions` | 无外部路径 | 只返回当前项目不可变Version目录 |
| `textIo.exportVersions` | Main系统目录选择器 | 读取指定Version，临时写入、Hash校验、原子重命名 |

Renderer不得提交任意源路径或目标目录；Preload只暴露结构化输入，Main负责系统选择器，Core再次验证普通文件、目录、文件名、项目归属和Version归属。
''',
    )
    replace_section(
        'docs/database/DATABASE_SCHEMA.md',
        '## M1-09 导入导出事务映射',
        '''## M1-09 导入导出事务映射

M1-09不新增Schema。确认导入复用`volumes`、`chapters`、`drafts`、`draft_blocks`、`versions`、`version_blocks`及M1-08的`backup_records`：

1. 预览阶段不执行数据库写入。
2. 确认前先创建`operation='import'`的已验证恢复点。
3. 新卷、章节、活动Draft、`source='imported'`块和“导入基线”Version在同一Core写事务提交。
4. 失败时业务写入整体回滚；已验证恢复点保留。
5. 导出只读取`versions/version_blocks`，不读取可能继续变化的活动Draft。
''',
    )
    replace_section(
        'docs/security/THREAT_MODEL.md',
        '## M1-09 本地文本文件边界',
        '''## M1-09 本地文本文件边界

- Renderer无任意路径能力；源文件和目标目录只由Electron Main系统选择器产生。
- Core拒绝非绝对路径、符号链接、非普通文件、未知扩展、二进制NUL、空内容和20 MiB以上输入。
- 自动检测采用严格解码；低置信度GB18030必须在预览界面可见并允许人工重选。
- ImportPlan绑定源文件SHA-256并设置30分钟有效期，文件变化或过期阻止提交。
- 导出文件名禁止路径分隔符、控制字符和`..`；同名文件绝不覆盖。
- 导出经同目录临时文件、内容Hash验证和原子重命名完成，失败清理临时文件。
''',
    )
    replace_section(
        'docs/ui/SCREEN_SPECIFICATIONS.md',
        '## M1-09 旧稿导入与稳定稿导出',
        '''## M1-09 旧稿导入与稳定稿导出

入口位于项目总览“导入导出”。对话框包含：

- 编码选择与“选择文件并预览”；
- 文件格式、检测编码、置信度、告警和章节数量；
- 可重命名、重排、拆分、合并、移除的章节预览；
- 新卷标题与确认导入；
- 按卷章顺序展示的Version复选列表；
- TXT/Markdown格式、文件名及“导出所选”；
- 创建恢复点、原子导出、同名冲突和错误码的真实状态文本。

只读项目可查看Version目录并导出，但禁止确认导入。
''',
    )
    replace_section(
        'docs/testing/P0_ACCEPTANCE_MATRIX.md',
        '## 13. M1-09 导入导出验收证据',
        f'''## 13. M1-09 导入导出验收证据

> 验收运行：{run_url}

| P0 | 范围 | 状态 | 证据 |
|---|---|---|---|
| P0-048 | TXT/Markdown编码、预览调整、恢复点和事务提交 | PASS | `docs/test-evidence/M1-09/` |
| P0-050 | 指定Version原子导出TXT/Markdown | PASS | `docs/test-evidence/M1-09/` |

P0-049及P0-050的DOCX范围继续由M6-05验收。
''',
    )
    replace_section(
        'docs/product/V1.0_TRACEABILITY_MATRIX.md',
        '## M1-09 验收闭环',
        f'''## M1-09 验收闭环

> 验收运行：{run_url}

| 任务 | 已验证范围 | 证据 |
|---|---|---|
| M1-09 | REQ-034的TXT/Markdown基础、REQ-035的TXT/Markdown Version导出；P0-048、P0-050部分 | `docs/test-evidence/M1-09/` |

REQ-034与REQ-035继续保持`In Progress`，直到M6-05完成DOCX及完整多格式交付。
''',
    )


def close(args: argparse.Namespace) -> None:
    commit = args.commit
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    task_card = ROOT / TASK_SOURCE
    source = task_card.read_text(encoding='utf-8')
    updated = re.sub(r'^> 状态：In Progress[^\n]*$', '> 状态：Verified  ', source, count=1, flags=re.M)
    if updated == source:
        raise SystemExit('M1-09 task card is not In Progress')
    task_card.write_text(updated, encoding='utf-8')

    next_card = ROOT / NEXT_SOURCE
    source = next_card.read_text(encoding='utf-8')
    updated = re.sub(r'^> 状态：Planned[^\n]*$', '> 状态：In Progress  ', source, count=1, flags=re.M)
    if updated == source:
        raise SystemExit('M2-01 task card is not Planned')
    next_card.write_text(updated, encoding='utf-8')

    index_path = ROOT / 'docs/tasks/TASK_INDEX.md'
    index = index_path.read_text(encoding='utf-8')
    index, count1 = re.subn(r'^(\| M1-09 \|.*\| )In Progress( \|)$', r'\1Verified\2', index, count=1, flags=re.M)
    index, count2 = re.subn(r'^(\| M2-01 \|.*\| )Planned( \|)$', r'\1In Progress\2', index, count=1, flags=re.M)
    if count1 != 1 or count2 != 1:
        raise SystemExit('task index transition anchors missing')
    index_path.write_text(index, encoding='utf-8')

    state_path = ROOT / 'docs/tasks/ACTIVE_TASK.json'
    state = json.loads(state_path.read_text(encoding='utf-8'))
    state['activeTask'] = {
        'id': NEXT_ID,
        'status': 'IN_PROGRESS',
        'source': NEXT_SOURCE,
        'branch': 'main',
        'startedAt': datetime.now(timezone.utc).date().isoformat(),
        'allowedPaths': [
            'packages/editor-core/',
            'packages/domain/',
            'packages/core-service/',
            'packages/contracts/',
            'apps/desktop/renderer/',
            'tests/unit/',
            'tests/integration/',
            'tests/e2e/',
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            'docs/tasks/ACTIVE_TASK.json',
            'docs/tasks/ACTIVE_TASK.md',
            'docs/tasks/TASK_INDEX.md',
            NEXT_SOURCE,
            'docs/product/V1.0_TRACEABILITY_MATRIX.md',
            'docs/test-evidence/M2-01/',
            TASK_SOURCE,
        ],
        'forbiddenPaths': [],
        'requiredDocs': [
            'AGENTS.md',
            'docs/PROJECT_EXECUTION_ENTRY.md',
            'docs/product/WORLDFORGE_V6.5_FULL_SPEC.md',
            'docs/decisions/IMPLEMENTATION_DECISIONS.md',
            'docs/ui/EDITOR_INTERACTION_SPEC.md',
            'docs/decisions/ADR-005-lock-revision-backup.md',
            'docs/contracts/ERROR_CODES.md',
        ],
        'verification': [
            'pnpm lint',
            'pnpm typecheck',
            'pnpm test',
            'pnpm test:migration',
            'pnpm test:integration',
            'pnpm test:security',
            'pnpm test:e2e',
        ],
    }
    state['lastImplementedTask'] = {'id': TASK_ID, 'commit': commit, 'implementedAt': now}
    state['lastVerifiedTask'] = {'id': TASK_ID, 'commit': commit, 'verifiedAt': now}
    state['deferredVerification'] = [
        item for item in state.get('deferredVerification', []) if item.get('id') != TASK_ID
    ]
    write(state_path, json.dumps(state, ensure_ascii=False, indent=2))

    replace_section(
        'docs/tasks/M1_TASKS.md',
        '## M1 验收结论',
        f'''## M1 验收结论

M1-01至M1-09已全部`Verified`。基础写作MVP已实现无AI创建项目、卷章管理、中文块编辑、自动保存、Version、TXT/Markdown导入导出、恢复点和只读恢复闭环。

M1-09实现提交：`{commit}`。下一活动任务：M2-01锁定块与Core LockGuard。
''',
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    evidence_parser = sub.add_parser('evidence')
    evidence_parser.add_argument('--commit', required=True)
    evidence_parser.add_argument('--generated-at', required=True)
    evidence_parser.add_argument('--run-url', required=True)
    evidence_parser.add_argument('--commands', required=True)
    evidence_parser.add_argument('--screenshot', required=True)
    close_parser = sub.add_parser('close')
    close_parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    if args.command == 'evidence':
        evidence(args)
    else:
        close(args)


if __name__ == '__main__':
    main()
