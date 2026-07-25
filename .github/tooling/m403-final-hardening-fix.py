from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = """    '  register(IPC_CHANNELS.projectListRecent',
    '  register(IPC_CHANNELS.projectListRecent',
    'remove generic Provider IPC block',
"""
new = """    '  register(IPC_CHANNELS.projectListRecent',
    '',
    'remove generic Provider IPC block',
"""
if text.count(old) != 1:
    raise SystemExit(f'IPC block replacement patch target count: {text.count(old)}')
script.write_text(text.replace(old, new, 1))
