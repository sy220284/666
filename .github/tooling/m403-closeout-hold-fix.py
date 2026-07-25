from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = """run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['git', 'diff', '--check'])
"""
new = """run(['node', 'scripts/taskctl.mjs', 'validate'])
for relative in [
    'docs/tasks/ACTIVE_TASK.md',
    'docs/tasks/TASK_INDEX.md',
    'docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md',
]:
    path = Path(relative)
    path.write_text('\\n'.join(line.rstrip() for line in path.read_text().splitlines()) + '\\n')
run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['git', 'diff', '--check'])
"""
if text.count(old) != 1:
    raise SystemExit(f'closeout whitespace patch target count: {text.count(old)}')
script.write_text(text.replace(old, new, 1))
