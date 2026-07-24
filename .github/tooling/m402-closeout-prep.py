from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import os
import subprocess

TARGET_BRANCH = 'work/m4-02-constraint-package'
IMPLEMENTATION_COMMIT = '3e6ae02c2b3c71647d93d972ec215f39e4d93a24'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected one replacement target, found {text.count(old)}')
    return text.replace(old, new, 1)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


# Full required verification plus explicit performance coverage.
run(['pnpm', 'lint'])
run(['pnpm', 'typecheck'])
run(['pnpm', 'test'])
run(['pnpm', 'test:security'])
run(['pnpm', 'test:e2e'])
run(['pnpm', 'test:eval'])
run(['pnpm', 'test:integration'])
run(['pnpm', 'test:perf'])
run(['node', 'scripts/taskctl.mjs', 'validate'])

run_id = os.environ.get('GITHUB_RUN_ID', 'local')
run_url = (
    f"https://github.com/{os.environ.get('GITHUB_REPOSITORY', 'sy220284/666')}/actions/runs/{run_id}"
    if run_id != 'local'
    else 'local'
)

task_path = Path('docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md')
task = task_path.read_text()
implementation_section = '''## 实现结果

- 新增P0—P4约束包合同，覆盖任务类型、来源、时序状态、来源Version、Token估算、冲突、裁剪日志、`contentHash`和`constraintHash`。
- Core从ProjectBrief、当前章、SceneBeat、前章有效EndingSnapshot或权威回退、EntityState、KnowledgeState、Foreshadowing、Canon、人物弧光、当前稿与M4-01公共检索组装约束。
- 首章不读取本章尾快照；补充检索按章节顺序排除未来章；Version来源明确标记为`historical`。
- Domain执行稳定序列化、确定性Token估算与P4→P3→低相关P2裁剪；P0/P1不可裁剪，强制约束超限时明确失败。
- Prompt层只负责确定性序列化，不接入Provider，不依赖Renderer临时状态，不新增数据库表。

## 性能与可观测性

- 150万字符正文约束组装与裁剪纳入永久性能回归，P95预算小于1000ms。
- 每次结果返回实际来源、来源Version、时序状态、Token预算、裁剪日志、冲突清单与稳定Hash，可用于后续GenerationRun和审计追溯。

'''
if '## 实现结果' not in task:
    task = replace_once(task, '## 完成条件\n', implementation_section + '## 完成条件\n', 'task implementation section')
task_path.write_text(task)

matrix_path = Path('docs/product/V1.0_TRACEABILITY_MATRIX.md')
matrix = matrix_path.read_text()
matrix = replace_once(
    matrix,
    '| REQ-025 | AI任务使用P0—P4约束包 | P0-025、P0-026相关Eval | M4-02、M5、M6-02 | AI-003 | P0 | In Progress | M4-02已激活；待约束包、来源追溯与裁剪日志实现 |',
    '| REQ-025 | AI任务使用P0—P4约束包 | P0-025、P0-026相关Eval | M4-02、M5、M6-02 | AI-003 | P0 | Implemented | M4-02已实现可追溯P0—P4组装、时序过滤、稳定Hash、冲突标记与P4→P3→低相关P2裁剪；最终Provider与AI验收由M4-03—M6继续闭环 |',
    'REQ-025 traceability',
)
matrix = replace_once(
    matrix,
    '| AI-003 | P0—P4约束包 | M4-02 | REQ-025 | In Progress | M4-02已激活，等待实现 |',
    '| AI-003 | P0—P4约束包 | M4-02 | REQ-025 | Implemented | Contracts、Domain、Core与Prompts闭环已完成；覆盖前章快照/权威回退、未来章隔离、Token裁剪、稳定Hash、冲突与来源Version追溯 |',
    'AI-003 traceability',
)
matrix_path.write_text(matrix)

summary_path = Path('docs/test-evidence/M4-02/summary.md')
summary = summary_path.read_text()
run_section = f'''\n## 自动化记录\n\n- 首批实现工作流：`30103281554`，通过专项单元/集成、全仓Typecheck、Lint、Eval与任务状态校验。\n- 时序与性能加固工作流：`30104373569`，通过首章时序、未来章隔离、短中文、超限、去重、150万字符性能、Typecheck、Lint、Eval与任务状态校验。\n- 完整收口工作流：`{run_id}`（{run_url}），执行Lint、Typecheck、全量测试、Security、Electron E2E、Eval、Integration、Performance与任务状态校验。\n- M4-01启动前基线整改记录见`m401-baseline-audit.md`。\n'''
if '## 自动化记录' not in summary:
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
)

run(['pnpm', 'exec', 'prettier', '--write', str(task_path), str(matrix_path), str(summary_path)])

# Manifest binds the last code implementation commit, matching implementation-first governance.
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
run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['git', 'diff', '--check'])
run(['git', 'add', '--all'])
run(['git', 'commit', '-m', '文档：收口M4-02实现证据与追踪'])
run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'])
