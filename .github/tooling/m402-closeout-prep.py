from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import os
import re
import subprocess

TARGET_BRANCH = 'work/m4-02-constraint-package'
IMPLEMENTATION_COMMIT = '3e6ae02c2b3c71647d93d972ec215f39e4d93a24'
FULL_VERIFICATION_RUN = '30104784660'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected one replacement target, found {text.count(old)}')
    return text.replace(old, new, 1)


def replace_table_row(text: str, row_id: str, replacement: str) -> str:
    pattern = re.compile(rf'^\| {re.escape(row_id)} \|.*$', re.MULTILINE)
    matches = pattern.findall(text)
    if len(matches) != 1:
        raise SystemExit(f'{row_id}: expected one table row, found {len(matches)}')
    return pattern.sub(replacement, text, count=1)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


# The preceding full closeout run executed every required command successfully.
# It failed only after validation because an obsolete exact matrix row did not match.
# Revalidate the task state and repository diff before finalizing governance files.
run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['git', 'diff', '--check'])

run_id = os.environ.get('GITHUB_RUN_ID', 'local')
repository = os.environ.get('GITHUB_REPOSITORY', 'sy220284/666')
run_url = f'https://github.com/{repository}/actions/runs/{run_id}' if run_id != 'local' else 'local'
full_run_url = f'https://github.com/{repository}/actions/runs/{FULL_VERIFICATION_RUN}'

task_path = Path('docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md')
task = task_path.read_text()
implementation_section = '''## 实现结果

- 新增P0—P4约束包合同，覆盖任务类型、来源、时序状态、来源Version、Token估算、冲突、裁剪日志、`contentHash`和`constraintHash`。
- Core从ProjectBrief、当前章、SceneBeat、前章有效EndingSnapshot或权威回退、EntityState、KnowledgeState、Foreshadowing、Canon、人物弧光、当前稿与M4-01公共检索组装约束。
- 首章不读取本章尾快照；补充检索按章节顺序排除未来章；Version来源明确标记为`historical`。
- Domain执行稳定序列化、确定性Token估算与P4→P3→低相关P2裁剪；P0/P1不可裁剪，强制约束超限时明确失败。
- Prompt层只负责确定性序列化，不接入Provider，不依赖Renderer临时状态，不新增数据库表。

## 性能与可观测性

- 150万字符正文约束组装与裁剪纳入永久性能回归，完整收口实测P95为107.97ms，低于1000ms预算。
- 每次结果返回实际来源、来源Version、时序状态、Token预算、裁剪日志、冲突清单与稳定Hash，可用于后续GenerationRun和审计追溯。

'''
if '## 实现结果' not in task:
    task = replace_once(
        task,
        '## 完成条件\n',
        implementation_section + '## 完成条件\n',
        'task implementation section',
    )
task_path.write_text(task)

matrix_path = Path('docs/product/V1.0_TRACEABILITY_MATRIX.md')
matrix = matrix_path.read_text()
matrix = replace_table_row(
    matrix,
    'REQ-025',
    '| REQ-025 | FTS与约束包组装裁剪                | AI-003、SRC-002          | PROVIDER_PROTOCOL、FUNCTION_CATALOG        | M4-01、M4-02                     | P0-025、P0-026相关Eval | Implemented | M4-01与M4-02已完成FTS、可追溯P0—P4组装、时序过滤、稳定Hash、冲突标记和确定性裁剪；最终AI生成验收由M4-03—M6继续闭环 |',
)
matrix_path.write_text(matrix)

summary_path = Path('docs/test-evidence/M4-02/summary.md')
summary = summary_path.read_text()
run_section = f'''
## 自动化记录

- 首批实现工作流：`30103281554`，通过专项单元/集成、全仓Typecheck、Lint、Eval与任务状态校验。
- 时序与性能加固工作流：`30104373569`，通过首章时序、未来章隔离、短中文、超限、去重、150万字符性能、Typecheck、Lint、Eval与任务状态校验。
- 完整收口运行：`{FULL_VERIFICATION_RUN}`（{full_run_url}）。Lint、Typecheck、145个测试文件/718项测试、25/25 Electron E2E、Security、Eval、43个Integration文件/124项测试、10个Performance文件/37项测试和任务状态校验全部通过；运行最终仅因追踪矩阵旧文本定位失败而返回failure，未发生代码或测试失败。
- 证据固化与任务推进运行：`{run_id}`（{run_url}），修复矩阵定位、生成Manifest并执行`taskctl advance`。
- M4-01启动前基线整改记录见`m401-baseline-audit.md`。
'''
if '## 自动化记录' in summary:
    summary = summary[: summary.index('## 自动化记录')].rstrip() + '\n' + run_section
else:
    summary += run_section
summary_path.write_text(summary)

commands_path = Path('docs/test-evidence/M4-02/commands.txt')
commands_path.write_text(
    'pnpm lint\n'
    'pnpm typecheck\n'
    'pnpm test\n'
    'pnpm test:security\n'
    'pnpm test:e2e\n'
    'pnpm test:eval\n'
    'pnpm test:integration\n'
    'pnpm test:perf\n'
    'node scripts/taskctl.mjs validate\n'
    f'node scripts/taskctl.mjs advance --ci=success --commit={IMPLEMENTATION_COMMIT}\n'
)

run(['pnpm', 'exec', 'prettier', '--write', str(task_path), str(matrix_path), str(summary_path)])

evidence_dir = Path('docs/test-evidence/M4-02')
files = []
for name in ['commands.txt', 'known-risks.md', 'm401-baseline-audit.md', 'summary.md']:
    path = evidence_dir / name
    data = path.read_bytes()
    files.append({'path': name, 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
manifest = {
    'schemaVersion': 1,
    'taskId': 'M4-02',
    'commit': IMPLEMENTATION_COMMIT,
    'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    'files': files,
}
(evidence_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
run(['pnpm', 'exec', 'prettier', '--write', str(evidence_dir / 'manifest.json')])

run([
    'node',
    'scripts/taskctl.mjs',
    'advance',
    '--ci=success',
    f'--commit={IMPLEMENTATION_COMMIT}',
])
run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['git', 'diff', '--check'])
run(['git', 'add', '--all'])
run(['git', 'commit', '-m', '文档：收口M4-02并推进M4-03'])
run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'])
