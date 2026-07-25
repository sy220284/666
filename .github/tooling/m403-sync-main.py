from pathlib import Path
import re
import subprocess

TARGET_BRANCH = 'work/m4-03-provider-credential-connection'
EXPECTED_HEAD = 'e3813e16523ae326f9faa6e157869bf9f05fa0b4'


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def output(command: list[str]) -> str:
    return subprocess.check_output(command, text=True).strip()


def source(ref: str, path: str) -> str:
    return subprocess.check_output(['git', 'show', f'{ref}:{path}'], text=True)


def section(text: str, heading: str) -> str:
    marker = f'## {heading}'
    start = text.find(marker)
    if start < 0:
        raise SystemExit(f'missing section: {heading}')
    remainder = text[start:]
    next_heading = re.search(r'^##\s+', remainder[len(marker):], re.MULTILINE)
    end = len(remainder) if next_heading is None else len(marker) + next_heading.start()
    return remainder[:end].rstrip()


def replace_section(path: str, heading: str, preserved: str) -> None:
    file = Path(path)
    text = file.read_text()
    marker = f'## {heading}'
    start = text.find(marker)
    if start >= 0:
        tail = text[start + len(marker):]
        match = re.search(r'^##\s+', tail, re.MULTILINE)
        end = len(text) if match is None else start + len(marker) + match.start()
        text = text[:start].rstrip() + '\n\n' + text[end:].lstrip()
    file.write_text(text.rstrip() + '\n\n' + preserved + '\n')


def row(text: str, identifier: str) -> str:
    for line in text.splitlines():
        if re.match(rf'^\|\s*{re.escape(identifier)}\s*\|', line):
            return line
    raise SystemExit(f'missing row: {identifier}')


def replace_row(path: str, identifier: str, preserved_row: str) -> None:
    file = Path(path)
    text = file.read_text()
    pattern = re.compile(rf'^\|\s*{re.escape(identifier)}\s*\|.*$', re.MULTILINE)
    text, count = pattern.subn(lambda _match: preserved_row, text, count=1)
    if count != 1:
        raise SystemExit(f'row replacement count for {identifier}: {count}')
    file.write_text(text)


if output(['git', 'rev-parse', 'HEAD']) != EXPECTED_HEAD:
    raise SystemExit('formal M4-03 Head moved before main synchronization')
pre_merge = EXPECTED_HEAD

preserved_sections = {
    ('docs/ai/LOCAL_AI_SERVICE_SPEC.md', 'M4-03 直连端点规则'): section(
        source(pre_merge, 'docs/ai/LOCAL_AI_SERVICE_SPEC.md'), 'M4-03 直连端点规则'
    ),
    ('docs/ai/PROVIDER_PROTOCOL.md', 'M4-03 已实现协议边界'): section(
        source(pre_merge, 'docs/ai/PROVIDER_PROTOCOL.md'), 'M4-03 已实现协议边界'
    ),
    ('docs/security/PRIVACY_AND_LOGGING.md', 'M4-03 Provider凭据与网络日志'): section(
        source(pre_merge, 'docs/security/PRIVACY_AND_LOGGING.md'), 'M4-03 Provider凭据与网络日志'
    ),
}
trace_source = source(pre_merge, 'docs/product/V1.0_TRACEABILITY_MATRIX.md')
trace_rows = {identifier: row(trace_source, identifier) for identifier in ['REQ-023', 'REQ-024', 'REQ-043']}
index_source = source(pre_merge, 'docs/tasks/TASK_INDEX.md')
index_row = row(index_source, 'M4-03')

run(['git', 'fetch', '--no-tags', 'origin', 'main'])
run(['git', 'merge', '--no-commit', '-X', 'theirs', 'origin/main'])

for (path, heading), preserved in preserved_sections.items():
    replace_section(path, heading, preserved)
for identifier, preserved in trace_rows.items():
    replace_row('docs/product/V1.0_TRACEABILITY_MATRIX.md', identifier, preserved)
replace_row('docs/tasks/TASK_INDEX.md', 'M4-03', index_row)

# The task hold is authoritative and must survive the merge unchanged.
active = Path('docs/tasks/ACTIVE_TASK.json').read_text()
if '"id": "M4-03"' not in active or '"status": "IMPLEMENTED"' not in active:
    raise SystemExit('M4-03 Implemented active state was not preserved')
if '"autoActivateNext": false' not in active:
    raise SystemExit('M4-04 activation hold was not preserved')
card = Path('docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md').read_text()
if '> 状态：Planned' not in card:
    raise SystemExit('M4-04 must remain Planned')

format_paths = [
    'docs/ai/LOCAL_AI_SERVICE_SPEC.md',
    'docs/ai/PROVIDER_PROTOCOL.md',
    'docs/security/PRIVACY_AND_LOGGING.md',
    'docs/product/V1.0_TRACEABILITY_MATRIX.md',
    'docs/tasks/TASK_INDEX.md',
]
run(['pnpm', 'exec', 'prettier', '--write', *format_paths])
for relative in format_paths + [
    'docs/tasks/ACTIVE_TASK.md',
    'docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md',
]:
    path = Path(relative)
    path.write_text('\n'.join(line.rstrip() for line in path.read_text().splitlines()) + '\n')

run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['pnpm', 'exec', 'vitest', 'run',
     'tests/unit/task-control.test.ts',
     'tests/unit/task-ordering.test.ts',
     'tests/unit/test-quality-audit.test.ts'])
run(['pnpm', 'lint'])
run(['git', 'diff', '--check'])
run(['git', 'add', '--all'])
run(['git', 'commit', '-m', '合并：同步main并保留M4-03收口状态'])
run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'])
