from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = "task = replace_once(task, '> 状态：In Progress  ', '> 状态：Implemented  ', 'task status')"
new = "task = replace_once(task, '> 状态：In Progress', '> 状态：Implemented', 'task status')"
if text.count(old) != 1:
    raise SystemExit(f'task status format patch target count: {text.count(old)}')
script.write_text(text.replace(old, new, 1))
